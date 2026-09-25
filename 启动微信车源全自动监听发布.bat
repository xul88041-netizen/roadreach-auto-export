@echo off
title RoadReach Auto - WeChat MiniProgram Sniffer
cls
echo ===================================================================
echo     RoadReach Auto Export - Jinyutang WeChat Sniffer
echo ===================================================================
echo.
echo [Status] Starting proxy listener and setting system proxy...
echo [Notice] Open WeChat on PC and click any car in JinyutangPlus.
echo [Notice] Press Ctrl+C in this window to exit and restore proxy.
echo ===================================================================
echo.

python scripts\crawler\start_sniffer.py

pause
