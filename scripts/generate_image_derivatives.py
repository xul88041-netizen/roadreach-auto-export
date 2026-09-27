#!/usr/bin/env python3
"""
RoadReach Auto Export — Deterministic Image Derivative Generator
Reads scripts/image_derivatives_manifest.json and generates optimized WebP derivatives:
- thumb: 160px width, WebP q75
- card: 640px width, WebP q80
- detail: 1200px width, WebP q82

Rules:
- Strictly preserves aspect ratio (no stretch, no crop)
- Never upscales if original image is narrower than target width
- Strips non-essential EXIF metadata
- Safe local overwrite
- NEVER uploads to Production Storage directly
"""

import os
import sys
import json
import argparse
import urllib.request
import ssl
from PIL import Image

def get_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def process_single_derivative(im, target_width, quality, output_path):
    orig_w, orig_h = im.size
    target_w = min(target_width, orig_w)
    target_h = max(1, int(orig_h * (target_w / orig_w)))

    resized = im.resize((target_w, target_h), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    # Saving without exif parameter strips all non-essential camera metadata
    resized.save(output_path, "WEBP", quality=quality, method=6)
    return target_w, target_h, os.path.getsize(output_path)

def generate_derivatives(manifest_path, output_base_dir, single_image_id=None):
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
        sort_order = item.get("sort_order", 0)

        # Target file paths
        thumb_path = os.path.join(output_base_dir, v_id, "derived", "thumb", f"{img_id}.webp")
        card_path = os.path.join(output_base_dir, v_id, "derived", "card", f"{img_id}.webp")
        detail_path = os.path.join(output_base_dir, v_id, "derived", "detail", f"{img_id}.webp")

        print(f"[{idx}/{len(manifest)}] Processing {stock_id} ({img_id[:8]}...)...")

        # Download original image into memory
        req = urllib.request.Request(orig_url, headers={"User-Agent": "RoadReach-ImagePipeline/1.0"})
        with urllib.request.urlopen(req, context=ctx) as resp:
            orig_data = resp.read()

        import io
        with Image.open(io.BytesIO(orig_data)) as raw_im:
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
