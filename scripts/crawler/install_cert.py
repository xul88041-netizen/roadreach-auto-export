import os
import sys
import time
import subprocess
from pathlib import Path

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

def setup_ca_cert():
    print("=" * 65)
    print("RoadReach Auto - 证书安装脚本【合规与系统安全保护】")
    print("=" * 65)
    print("【风险提示】")
    print("将自签名证书导入 Windows 受信任根证书颁发机构 (Root CA) 会影响本机系统安全性。")
    print("根据合规要求，此脚本已默认停用自动静默注入系统根证书的操作。")
    print("如在独立受控测试环境中调试，请手动参阅 mitmproxy 官方文档操作，切勿在生产环境注入根证书。")
    print("=" * 65)
    if os.environ.get("ALLOW_AUTHORIZED_CERT_INSTALL") != "1":
        print("\n[安全终止] 未配置授权安装环境变量，已取消证书安装操作。\n")
        return False

    cert_dir = Path.home() / ".mitmproxy"
    cert_file = cert_dir / "mitmproxy-ca-cert.cer"
    if not cert_file.exists():
        print("未检测到本地 mitmproxy 证书文件。")
        return False

    print(f"📄 找到证书: {cert_file}")
    print("⚠️ 正在根据用户明确配置安装证书...")
    cmd = ["certutil", "-addstore", "-user", "Root", str(cert_file)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return res.returncode == 0

if __name__ == "__main__":
    setup_ca_cert()
