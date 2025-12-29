@echo off
:: Run Kiosk App as Administrator
cd /d "%~dp0"
powershell -Command "Start-Process -FilePath '%~dp0dist\KioskApp.exe' -Verb RunAs"
