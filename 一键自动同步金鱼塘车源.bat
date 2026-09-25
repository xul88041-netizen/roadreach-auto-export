@echo off
chcp 65001 >nul
title RoadReach Auto Export - 金鱼塘自动同步助手
cd /d "%~dp0"

echo ========================================================
echo    RoadReach Auto Export - 金鱼塘零人工自动车源发布器
echo ========================================================
echo.
echo [1] 启动后台实时监听（只要在微信点开某辆车，立即自动发布到网站）
echo [2] 立即发布当前微信里打开的这辆车（单次同步）
echo [3] 退出
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
