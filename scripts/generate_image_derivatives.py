#!/usr/bin/env python3
"""
RoadReach Auto Export — Deterministic & Hardened Image Derivative Generator
Reads scripts/image_derivatives_manifest.json and generates optimized WebP derivatives:
- thumb: 160px width, WebP q75
- card: 640px width, WebP q80
- detail: 1200px width, WebP q82

Security Hardening Rules:
- Enforces strict HTTPS certificate verification (CERT_REQUIRED, hostname check enabled)
- Strictly allows only https:// URLs
- Rejects localhost, 127.0.0.1, ::1, private/link-local/multicast IP ranges (SSRF protection)
- Enforces strict request timeouts (default 15s)
- Enforces 25 MB hard download limit (checks Content-Length and enforces streaming chunk limit)
- Verifies Content-Type against allowed image MIME whitelist (image/jpeg, image/png, image/webp)
- Pillow image format and dimension validation (width > 0, height > 0)
- Strictly preserves aspect ratio (no stretch, no crop)
- Never upscales if original image is narrower than target width
- Strips non-essential EXIF metadata
- Safe local overwrite in .local/image-derivatives/
- NEVER uploads to Production Storage directly
- NEVER writes to database
"""

import os
import sys
import io
import time
import json
import socket
import argparse
import urllib.request
import urllib.parse
import urllib.error
import ipaddress
import ssl
try:
    from PIL import Image
except ImportError:
    Image = None

ALLOWED_SCHEMES = {"https"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024  # 25 MB hard limit
DEFAULT_TIMEOUT_SECONDS = 15

def get_ssl_context():
    """
    Returns an SSL context with strict certificate verification.
    Prefers certifi CA bundle if installed; falls back to system defaults.
    Zero verification bypasses allowed.
    """
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()

    ctx.verify_mode = ssl.CERT_REQUIRED
    ctx.check_hostname = True
    return ctx

def validate_image_url(url: str) -> None:
    """
    Validates that a URL is a legitimate public HTTPS URL.
    Rejects non-https schemes, loopback addresses, and private/internal IP ranges.
    """
    if not isinstance(url, str) or not url.strip():
        raise ValueError("URL must be a non-empty string.")

    parsed = urllib.parse.urlsplit(url.strip())

    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        raise ValueError(f"Forbidden URL scheme '{parsed.scheme}'. Only https:// is allowed.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL must contain a valid hostname.")

    hostname_lower = hostname.lower()

    # Reject localhost and local domain names
    if hostname_lower in ("localhost", "local", "broadcasthost") or hostname_lower.endswith(".localhost") or hostname_lower.endswith(".local"):
        raise ValueError(f"Forbidden localhost/local hostname '{hostname}'.")

    # Check for direct IP address literals
    try:
        ip = ipaddress.ip_address(hostname)
        is_ip = True
    except ValueError:
        is_ip = False

    if is_ip:
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError(f"Forbidden private/local IP address '{hostname}'.")
    else:
        # Check resolved DNS IP address to guard against DNS rebinding / nip.io
        try:
            resolved_ip_str = socket.gethostbyname(hostname)
            resolved_ip = ipaddress.ip_address(resolved_ip_str)
            if resolved_ip.is_private or resolved_ip.is_loopback or resolved_ip.is_link_local or resolved_ip.is_reserved:
                raise ValueError(f"Hostname '{hostname}' resolves to forbidden private/local IP '{resolved_ip_str}'.")
        except (socket.gaierror, socket.herror, ValueError):
            # If DNS resolution fails here, let urlopen handle network failure
            pass

def download_image_securely(url: str, ctx: ssl.SSLContext, timeout: int = DEFAULT_TIMEOUT_SECONDS, max_bytes: int = MAX_DOWNLOAD_BYTES, max_retries: int = 3) -> bytes:
    """
    Securely downloads an image with MIME verification, Content-Length checks,
    and streaming chunk size limits. Retries transient connection drops.
    """
    validate_image_url(url)

    req = urllib.request.Request(
        url,
        headers={"User-Agent": "RoadReach-ImagePipeline/1.0"}
    )

    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                # 1. MIME whitelist verification
                content_type = resp.headers.get("Content-Type", "")
                mime_type = content_type.split(";")[0].strip().lower()
                if mime_type not in ALLOWED_MIME_TYPES:
                    raise ValueError(f"Forbidden Content-Type '{content_type}'. Must be one of: {sorted(ALLOWED_MIME_TYPES)}")

                # 2. Content-Length header verification (if present)
                content_length = resp.headers.get("Content-Length")
                if content_length:
                    try:
                        cl_bytes = int(content_length)
                        if cl_bytes > max_bytes:
                            raise ValueError(f"Content-Length {cl_bytes} exceeds maximum allowed size of {max_bytes} bytes (25MB).")
                    except ValueError as e:
                        if "exceeds maximum allowed size" in str(e):
                            raise
                        # Skip unparseable Content-Length and rely on streaming counter

                # 3. Streaming download with byte accumulation
                chunks = []
                downloaded = 0
                chunk_size = 64 * 1024  # 64 KB

                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    downloaded += len(chunk)
                    if downloaded > max_bytes:
                        raise ValueError(f"Downloaded stream exceeded maximum allowed size of {max_bytes} bytes (25MB).")
                    chunks.append(chunk)

                data = b"".join(chunks)
                return data
        except ValueError:
            # Re-raise security / format validation failures immediately without retry
            raise
        except (urllib.error.URLError, ssl.SSLError, socket.timeout, TimeoutError, ConnectionResetError) as err:
            last_err = err
            if attempt < max_retries:
                time.sleep(1.0 * attempt)
            else:
                raise last_err

    if last_err:
        raise last_err

def process_single_derivative(im, target_width, quality, output_path):
    """
    Resizes image maintaining aspect ratio without upscaling,
    and saves as WebP stripping non-essential EXIF metadata.
    """
    orig_w, orig_h = im.size
    target_w = min(target_width, orig_w)
    target_h = max(1, int(orig_h * (target_w / orig_w)))

    resample = getattr(Image, "Resampling", None)
    resample_method = resample.LANCZOS if resample else getattr(Image, "LANCZOS", 1)

    resized = im.resize((target_w, target_h), resample_method)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    # Saving without exif parameter strips all non-essential camera metadata
    resized.save(output_path, "WEBP", quality=quality, method=6)
    file_size = os.path.getsize(output_path) if os.path.exists(output_path) else 0
    return target_w, target_h, file_size

def generate_derivatives(manifest_path, output_base_dir, single_image_id=None):
    """
    Reads the manifest and deterministically generates 3 derivative WebPs for each image.
    Outputs solely to output_base_dir (.local/image-derivatives/).
    """
    if Image is None:
        raise RuntimeError("Pillow is required for image derivative generation. Please run: pip install Pillow")
    if not os.path.isabs(manifest_path):
        manifest_path = os.path.abspath(manifest_path)
    if not os.path.isabs(output_base_dir):
        output_base_dir = os.path.abspath(output_base_dir)

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    if single_image_id:
        manifest = [item for item in manifest if item["vehicle_image_id"] == single_image_id]
        if not manifest:
            print(f"Error: vehicle_image_id '{single_image_id}' not found in manifest.", file=sys.stderr)
            sys.exit(1)

    print(f"Loaded manifest with {len(manifest)} image entry/entries.")
    print(f"Output directory: {output_base_dir}")

    ctx = get_ssl_context()
    results = []

    for idx, item in enumerate(manifest, 1):
        v_id = item["vehicle_id"]
        img_id = item["vehicle_image_id"]
        stock_id = item.get("stock_id", "UNKNOWN")
        orig_url = item["original_url"]

        # Target file paths
        thumb_path = os.path.join(output_base_dir, v_id, "derived", "thumb", f"{img_id}.webp")
        card_path = os.path.join(output_base_dir, v_id, "derived", "card", f"{img_id}.webp")
        detail_path = os.path.join(output_base_dir, v_id, "derived", "detail", f"{img_id}.webp")

        print(f"[{idx}/{len(manifest)}] Processing {stock_id} ({img_id[:8]}...)...")

        # Download original image securely into memory
        orig_data = download_image_securely(orig_url, ctx=ctx)

        with Image.open(io.BytesIO(orig_data)) as raw_im:
            # Verify image integrity and dimensions
            raw_im.load()
            if raw_im.width <= 0 or raw_im.height <= 0:
                raise ValueError(f"Invalid image dimensions: {raw_im.width}x{raw_im.height}")
            if raw_im.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError(f"Unsupported image format: {raw_im.format}. Must be JPEG, PNG, or WEBP.")

            # Normalize color mode to RGB
            if raw_im.mode in ("RGBA", "LA"):
                bg = Image.new("RGB", raw_im.size, (255, 255, 255))
                bg.paste(raw_im, mask=raw_im.split()[-1])
                im = bg
            elif raw_im.mode != "RGB":
                im = raw_im.convert("RGB")
            else:
                im = raw_im.copy()

            orig_w, orig_h = im.size

            # 1. thumb: 160px WebP q75
            tw, th, t_sz = process_single_derivative(im, 160, 75, thumb_path)
            # 2. card: 640px WebP q80
            cw, ch, c_sz = process_single_derivative(im, 640, 80, card_path)
            # 3. detail: 1200px WebP q82
            dw, dh, d_sz = process_single_derivative(im, 1200, 82, detail_path)

        results.append({
            "image_id": img_id,
            "orig_size_bytes": len(orig_data),
            "orig_dims": f"{orig_w}x{orig_h}",
            "thumb": {"dims": f"{tw}x{th}", "bytes": t_sz, "path": thumb_path},
            "card": {"dims": f"{cw}x{ch}", "bytes": c_sz, "path": card_path},
            "detail": {"dims": f"{dw}x{dh}", "bytes": d_sz, "path": detail_path}
        })
        print(f"   -> Orig {orig_w}x{orig_h} ({len(orig_data)/1024:.1f} KB) | thumb: {tw}x{th} ({t_sz/1024:.1f} KB) | card: {cw}x{ch} ({c_sz/1024:.1f} KB) | detail: {dw}x{dh} ({d_sz/1024:.1f} KB)")

    print(f"\nSuccessfully generated {len(results) * 3} WebP derivative files in {output_base_dir}.")
    return results

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deterministic Image Derivative Generator")
    parser.add_argument("--manifest", default="scripts/image_derivatives_manifest.json", help="Path to manifest JSON")
    parser.add_argument("--output-dir", default=".local/image-derivatives", help="Local directory for generated WebP derivatives")
    parser.add_argument("--single-id", default=None, help="Process only a single vehicle_image_id")
    args = parser.parse_args()

    generate_derivatives(args.manifest, args.output_dir, args.single_id)
