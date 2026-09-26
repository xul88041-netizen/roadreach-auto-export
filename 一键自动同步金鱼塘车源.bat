@echo off
chcp 65001 >nul
title RoadReach Auto Export - 金鱼塘自动同步助手
cd /d "%~dp0"

echo ========================================================
echo    RoadReach Auto Export - 车源自动抓取与草稿导入器
echo ========================================================
echo.
echo [1] 启动后台实时监听（在微信点开某辆车，自动生成 DRAFT 待审草稿）
echo [2] 立即抓取当前微信里打开的这辆车（单次导入草稿）
echo [3] 退出
echo.
echo 注意：抓取后的车源将保存为待审核草稿，需登录管理后台审核后发布。
echo.
set /p opt="请选择操作模式 (默认 1): "

if "%opt%"=="2" (
    python scripts/auto_cache_publisher.py
) else if "%opt%"=="3" (
    exit
) else (
    python scripts/auto_cache_publisher.py --watch
)

pause
