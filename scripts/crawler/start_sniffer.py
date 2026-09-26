import os
import sys
import subprocess
import winreg
import atexit

# 彻底修复 Windows 控制台中文及特殊字符编码
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

PROXY_HOST = "127.0.0.1"
PROXY_PORT = 8899

def set_windows_proxy(enable: bool, host: str = PROXY_HOST, port: int = PROXY_PORT):
    """开启或关闭 Windows 系统全局代理"""
    try:
        internet_settings = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            0,
            winreg.KEY_ALL_ACCESS,
        )
        if enable:
            winreg.SetValueEx(internet_settings, "ProxyEnable", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(internet_settings, "ProxyServer", 0, winreg.REG_SZ, f"{host}:{port}")
            print(f"[代理设置] 已开启系统代理: {host}:{port}")
        else:
            winreg.SetValueEx(internet_settings, "ProxyEnable", 0, winreg.REG_DWORD, 0)
            print("[代理设置] 已恢复关闭系统代理。")
        winreg.CloseKey(internet_settings)
    except Exception as e:
        print(f"[代理设置警告] 设置 Windows 代理注册表失败: {e}")

@atexit.register
def cleanup():
    set_windows_proxy(False)

def main():
    print("=" * 65)
    print("RoadReach Auto - 微信小程序嗅探服务【合规与安全阻断保护】")
    print("=" * 65)
    print("【风险拦截与合规提示】")
    print("根据系统安全与法律合规审计规范：")
    print("1. 自动截获第三方流量并安装根证书存在系统安全与平台授权合规风险；")
    print("2. 严禁未经授权修改 Windows 全局代理或自动公开发布第三方图片；")
    print("3. 当前抓包嗅探流程已默认停用。")
    print("如需恢复，须取得平台明确 API 授权/书面许可，并配置环境变量 ALLOW_AUTHORIZED_SNIFFER=1；")
    print("且仅允许作为 DRAFT 本地草稿待人工审核，严禁直接发布。")
    print("=" * 65)

    # 确保当前系统全局代理已恢复关闭状态
    set_windows_proxy(False)

    if os.environ.get("ALLOW_AUTHORIZED_SNIFFER") != "1":
        print("\n[安全退出] 嗅探流程已安全终止，全局代理已确认关闭。\n")
        return

    # 1. 开启系统代理
    set_windows_proxy(True)

    # 2. 启动 mitmdump
    addon_path = os.path.join(os.path.dirname(__file__), "wechat_sniffer.py")
    cmd = [
        sys.executable,
        "-m",
        "mitmproxy.tools.dump",
        "-p",
        str(PROXY_PORT),
        "-s",
        addon_path,
        "--quiet",
    ]

    print(f"\n[运行中] 正在监听中... (按 Ctrl+C 可退出并自动还原代理)\n")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\n收到退出指令，正在退出...")
    finally:
        set_windows_proxy(False)

if __name__ == "__main__":
    main()
