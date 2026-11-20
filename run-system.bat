@echo off
title WaterGuard SCADA Telemetry Launcher
color 0b
echo ==============================================================
echo    WATERGUARD // INDUSTRIAL SCADA TELEMETRY LAUNCHER
echo ==============================================================
echo.
echo [1/2] Opening WaterGuard SCADA Dashboard in your browser...
start "" "%~dp0dashboard\index.html"

echo [2/2] Starting Node.js Serial Bridge @ 9600 baud...
echo (Keep this command window open while using the system)
echo.
cd /d "%~dp0serial-bridge"
node server.js

pause
