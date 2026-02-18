@echo off
:: ============================================================
:: Timezone Kiosk Stopper
:: Gracefully stops all kiosk processes
:: ============================================================

echo ========================================
echo    Stopping Timezone Kiosk
echo ========================================
echo.

echo Stopping Electron app...
taskkill /F /IM electron.exe 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Electron stopped
) else (
    echo   [--] Electron was not running
)

echo Stopping Node.js server...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo   [OK] Node.js stopped
) else (
    echo   [--] Node.js was not running
)

echo.
echo ========================================
echo    All processes stopped
echo ========================================
echo.
pause
