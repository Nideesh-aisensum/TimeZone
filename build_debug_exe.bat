@echo off
echo ========================================
echo Building Kiosk Application DEBUG EXE
echo (With Console Window Visible)
echo ========================================
echo.

REM Install dependencies
echo Installing dependencies...
pip install pywebview keyboard pyinstaller pywin32 Pillow

echo.
echo Building DEBUG EXE with console...
pyinstaller --onefile --name "KioskApp_Debug" --add-data "index.html;." --icon=NONE --console kiosk_app.py

echo.
echo ========================================
echo Build complete!
echo DEBUG EXE location: dist\KioskApp_Debug.exe
echo ========================================
echo.
echo NOTE: Console window will show debug output
echo To exit the app, press: Q five times quickly
pause
