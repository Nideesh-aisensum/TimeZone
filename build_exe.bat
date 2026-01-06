@echo off
echo ========================================
echo Building Kiosk Application EXE
echo ========================================
echo.

REM Install dependencies
echo Installing dependencies...
python -m pip install pywebview keyboard pyinstaller pywin32 Pillow

echo.
echo Building EXE with page-1 assets...
echo This may take a few minutes...
echo.

REM Use the spec file which includes all page-1 assets
python -m PyInstaller --clean KioskApp.spec

echo.
echo ========================================
echo Build complete!
echo EXE location: dist\KioskApp.exe
echo ========================================
echo.
echo IMPORTANT: The page-1 folder is bundled inside the EXE.
echo The first page will be kiosk-shell.html with audio support.
echo.
echo To exit the app, press: Q five times quickly
pause
