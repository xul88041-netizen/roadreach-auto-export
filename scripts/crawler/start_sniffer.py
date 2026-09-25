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
    print("RoadReach Auto - 微信小程序金鱼塘车源【全自动嗅探与发布系统】")
    print("=" * 65)
    print("【工作流程说明】")
    print("1. 正在启动网络监听服务并配置本机代理...")
    print("2. 你只需在【电脑版微信】中点开金鱼塘Plus小程序的任意车辆详情页；")
    print("3. 脚本将【全自动截获】该车全部无水印高清大图与批发价；")
    print("4. 自动裁切去原标 -> 盖上 RoadReach 官方水印 -> 转 WebP -> 自动发布到网站！")
    print("=" * 65)

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

    print(f"\n[运行中] 正在监听中... 请打开电脑微信点开车辆详情页 (按 Ctrl+C 可退出并自动还原代理)\n")
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\n收到退出指令，正在退出...")
    finally:
        set_windows_proxy(False)

if __name__ == "__main__":
    main()
