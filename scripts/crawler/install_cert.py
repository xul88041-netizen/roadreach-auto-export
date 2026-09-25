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
    cert_dir = Path.home() / ".mitmproxy"
    cert_file = cert_dir / "mitmproxy-ca-cert.cer"

    # 如果证书不存在，启动一次 mitmdump 促使其生成
    if not cert_file.exists():
        print("⏳ 正在初始化抓包安全证书...")
        proc = subprocess.Popen([sys.executable, "-m", "mitmproxy.tools.dump", "-p", "8899", "--quiet"])
        for _ in range(20):
            time.sleep(0.5)
            if cert_file.exists():
                break
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            pass

    if not cert_file.exists():
        print("❌ 未能生成证书文件，请检查 mitmproxy 是否正常。")
        return False

    print(f"📄 找到证书: {cert_file}")
    # 自动导入到当前用户的受信任根证书颁发机构 (无需弹窗，静默添加)
    print("🔐 正在将证书安装到 Windows 系统受信证书库...")
    cmd = ["certutil", "-addstore", "-user", "Root", str(cert_file)]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if "成功" in res.stdout or "command completed successfully" in res.stdout or res.returncode == 0:
        print("✅ 证书安装成功！微信小程序数据包已具备解密权限。")
        return True
    else:
        print(f"⚠️ 安装结果: {res.stdout}\n{res.stderr}")
        return True

if __name__ == "__main__":
    setup_ca_cert()
