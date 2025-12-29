@echo off
echo === KIOSK APP DEBUG MODE ===
echo.
echo This will show you all the logs.
echo To EXIT: Press the Q key 5 times quickly!
echo.
echo Running as Administrator...
echo.

cd /d "%~dp0dist"
KioskApp_Debug.exe

echo.
echo === APP CLOSED ===
pause
