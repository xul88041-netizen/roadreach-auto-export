import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function runPython(code) {
  return execFileSync("python", ["-c", code], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8"
  });
}

test("1. CI workflow 显式配置执行 npm run check 门禁", async () => {
  const workflow = await read(".github/workflows/pages.yml");

  assert.match(workflow, /run:\s*npm\s+ci/u, "Workflow must run 'npm ci'");
  assert.match(workflow, /run:\s*npm\s+run\s+check/u, "Workflow must run 'npm run check'");
});

test("2. CI 门禁严格位于 upload artifact 及 deploy 步骤之前", async () => {
  const workflow = await read(".github/workflows/pages.yml");

  const checkIndex = workflow.indexOf("run: npm run check");
  const uploadIndex = workflow.indexOf("actions/upload-pages-artifact");
  const deployIndex = workflow.indexOf("actions/deploy-pages");

  assert.ok(checkIndex !== -1, "npm run check must be present");
  assert.ok(uploadIndex !== -1, "upload-pages-artifact must be present");
  assert.ok(deployIndex !== -1, "deploy-pages must be present");

  assert.ok(checkIndex < uploadIndex, "npm run check must execute before artifact upload");
  assert.ok(checkIndex < deployIndex, "npm run check must execute before deploy");
});

test("3. CI workflow 无 continue-on-error 且无 || true 等弱化测试逻辑", async () => {
  const workflow = await read(".github/workflows/pages.yml");

  assert.doesNotMatch(workflow, /continue-on-error\s*:\s*true/iu, "Workflow must not set continue-on-error: true");
  assert.doesNotMatch(workflow, /\|\|\s*true/u, "Workflow must not ignore errors with '|| true'");
  assert.doesNotMatch(workflow, /\|\|\s*exit\s+0/u, "Workflow must not ignore errors with '|| exit 0'");
});

test("4. 派生生成器脚本杜绝所有 TLS bypass (verify=False, CERT_NONE, check_hostname=False)", async () => {
  const script = await read("scripts/generate_image_derivatives.py");

  assert.doesNotMatch(script, /verify\s*=\s*False/u, "Script must not set verify=False");
  assert.doesNotMatch(script, /CERT_NONE/u, "Script must not disable certificate validation with CERT_NONE");
  assert.doesNotMatch(script, /check_hostname\s*=\s*False/u, "Script must not disable hostname verification");
  assert.doesNotMatch(script, /disable_warnings/iu, "Script must not suppress SSL/TLS security warnings");
});

test("5. HTTPS 证书校验行为测试：强制 CERT_REQUIRED 与 check_hostname=True", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
from generate_image_derivatives import get_ssl_context
import ssl

ctx = get_ssl_context()
assert ctx.verify_mode == ssl.CERT_REQUIRED, f"Expected CERT_REQUIRED, got {ctx.verify_mode}"
assert ctx.check_hostname is True, "Expected check_hostname to be True"
print("SSL_CONTEXT_VERIFIED")
`;
  const result = runPython(pyCode);
  assert.match(result, /SSL_CONTEXT_VERIFIED/u);
});

test("6. 远程下载强制配置 request timeout，杜绝无限悬挂", () => {
  const pyCode = `
import sys, inspect
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen

assert gen.DEFAULT_TIMEOUT_SECONDS == 15, f"Expected default timeout 15s, got {gen.DEFAULT_TIMEOUT_SECONDS}"
sig = inspect.signature(gen.download_image_securely)
assert sig.parameters['timeout'].default == 15, "Parameter timeout default must be 15s"
print("TIMEOUT_VERIFIED")
`;
  const result = runPython(pyCode);
  assert.match(result, /TIMEOUT_VERIFIED/u);
});

test("7. 超过 25MB 的 Content-Length 响应立即拒绝并中止下载", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen
from unittest.mock import patch, MagicMock

mock_resp = MagicMock()
mock_resp.__enter__.return_value = mock_resp
# 25MB + 1 byte
mock_resp.headers = {
    'Content-Type': 'image/jpeg',
    'Content-Length': str(25 * 1024 * 1024 + 1)
}

with patch('urllib.request.urlopen', return_value=mock_resp):
    try:
        gen.download_image_securely('https://example.com/oversized.jpg', ctx=MagicMock())
        sys.exit(1)
    except ValueError as e:
        assert 'exceeds maximum allowed size' in str(e), f"Unexpected error: {e}"
        print("CONTENT_LENGTH_OVERSIZE_REJECTED")
`;
  const result = runPython(pyCode);
  assert.match(result, /CONTENT_LENGTH_OVERSIZE_REJECTED/u);
});

test("8. 流式下载累计数据量超过 25MB 时立即硬中断", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen
from unittest.mock import patch, MagicMock

mock_resp = MagicMock()
mock_resp.__enter__.return_value = mock_resp
# No Content-Length provided (e.g. chunked transfer)
mock_resp.headers = {'Content-Type': 'image/jpeg'}

# Chunk of 64KB, 401 chunks = 25.66 MB (> 25 MB)
chunk = b'x' * (64 * 1024)
mock_resp.read.side_effect = [chunk] * 401 + [b'']

with patch('urllib.request.urlopen', return_value=mock_resp):
    try:
        gen.download_image_securely('https://example.com/stream_oversized.jpg', ctx=MagicMock())
        sys.exit(1)
    except ValueError as e:
        assert 'Downloaded stream exceeded maximum allowed size' in str(e), f"Unexpected error: {e}"
        print("STREAM_OVERSIZE_ABORTED")
`;
  const result = runPython(pyCode);
  assert.match(result, /STREAM_OVERSIZE_ABORTED/u);
});

test("9. 非图片 MIME 类型响应 (如 HTML, PDF, Octet-Stream) 立即拒绝", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen
from unittest.mock import patch, MagicMock

forbidden_mimes = [
    'text/html',
    'application/pdf',
    'application/octet-stream',
    'image/gif',
    'application/javascript'
]

for mime in forbidden_mimes:
    mock_resp = MagicMock()
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.headers = {'Content-Type': mime}
    with patch('urllib.request.urlopen', return_value=mock_resp):
        try:
            gen.download_image_securely('https://example.com/file', ctx=MagicMock())
            sys.exit(1)
        except ValueError as e:
            assert 'Forbidden Content-Type' in str(e), f"Unexpected message: {e}"

print("NON_IMAGE_MIME_REJECTED")
`;
  const result = runPython(pyCode);
  assert.match(result, /NON_IMAGE_MIME_REJECTED/u);
});

test("10. SSRF 防护：严格限制 https:// 协议，拒绝 http://, file://, data:, ftp:// 等伪协议", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen

forbidden_schemes = [
    'http://example.com/image.jpg',
    'file:///etc/passwd',
    'data:image/jpeg;base64,1234',
    'ftp://example.com/image.jpg',
    'gopher://example.com/'
]

for url in forbidden_schemes:
    try:
        gen.validate_image_url(url)
        sys.exit(1)
    except ValueError as e:
        assert 'Forbidden URL scheme' in str(e), f"Unexpected error: {e}"

print("FORBIDDEN_SCHEMES_REJECTED")
`;
  const result = runPython(pyCode);
  assert.match(result, /FORBIDDEN_SCHEMES_REJECTED/u);
});

test("11. SSRF 防护：拒绝 localhost, 127.0.0.1, ::1 及私网/链路本地 IP 地址，正常放行 Supabase HTTPS 目标", () => {
  const pyCode = `
import sys
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen

forbidden_hosts = [
    'https://localhost/test.jpg',
    'https://foo.localhost/test.jpg',
    'https://myserver.local/test.jpg',
    'https://127.0.0.1/test.jpg',
    'https://10.0.0.1/test.jpg',
    'https://172.16.0.1/test.jpg',
    'https://192.168.1.1/test.jpg',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/test.jpg'
]

for u in forbidden_hosts:
    try:
        gen.validate_image_url(u)
        sys.exit(1)
    except ValueError:
        pass

# Legitimate Supabase Public Storage URL must be accepted
valid_supabase_url = 'https://smjbzjzsmmisdrmdfjby.supabase.co/storage/v1/object/public/vehicle-images/test.jpg'
gen.validate_image_url(valid_supabase_url)

print("SSRF_TARGETS_BLOCKED_AND_VALID_ALLOWED")
`;
  const result = runPython(pyCode);
  assert.match(result, /SSRF_TARGETS_BLOCKED_AND_VALID_ALLOWED/u);
});

test("12. 图像规格保护：小图禁止放大，保持原始宽高比", () => {
  const pyCode = `
import sys, os, tempfile
sys.path.insert(0, 'scripts')
import generate_image_derivatives as gen
from PIL import Image

with tempfile.TemporaryDirectory() as tmpdir:
    # 100x100 original image
    im = Image.new('RGB', (100, 100), color='blue')
    out_path = os.path.join(tmpdir, 'out.webp')

    # Target 640 (> 100) -> width must remain 100, no upscaling
    tw, th, _ = gen.process_single_derivative(im, 640, 80, out_path)
    assert tw == 100 and th == 100, f"Expected 100x100, got {tw}x{th}"
    with Image.open(out_path) as saved:
        assert saved.size == (100, 100)

    # Target 1200 (> 100) -> width must remain 100, no upscaling
    tw, th, _ = gen.process_single_derivative(im, 1200, 82, out_path)
    assert tw == 100 and th == 100, f"Expected 100x100, got {tw}x{th}"

    # Target 50 (< 100) -> downscaled to 50x50
    tw, th, _ = gen.process_single_derivative(im, 50, 75, out_path)
    assert tw == 50 and th == 50, f"Expected 50x50, got {tw}x{th}"

print("NO_UPSCALING_VERIFIED")
`;
  const result = runPython(pyCode);
  assert.match(result, /NO_UPSCALING_VERIFIED/u);
});

test("13. 图像生成参数保持：锁定 160/640/1200 宽度规格与 q75/q80/q82 质量参数", async () => {
  const script = await read("scripts/generate_image_derivatives.py");

  assert.match(script, /process_single_derivative\(im,\s*160,\s*75,\s*thumb_path\)/u);
  assert.match(script, /process_single_derivative\(im,\s*640,\s*80,\s*card_path\)/u);
  assert.match(script, /process_single_derivative\(im,\s*1200,\s*82,\s*detail_path\)/u);
});

test("14. 生成脚本行为隔离：无 Production Storage 上传或数据库写入逻辑", async () => {
  const script = await read("scripts/generate_image_derivatives.py");

  // No upload method calls
  assert.doesNotMatch(script, /\.upload\(/u);
  // No Supabase / PostgREST write client
  assert.doesNotMatch(script, /createClient/iu);
  assert.doesNotMatch(script, /service_role/iu);
  assert.doesNotMatch(script, /\b(insert|update|delete)\b\s*\(/iu);

  // Writes exclusively to local directory
  assert.match(script, /output_base_dir/u);
  assert.match(script, /\.local\/image-derivatives/u);
});
