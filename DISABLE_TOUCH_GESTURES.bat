@echo off
echo ========================================
echo Disable Windows Touch Gestures
echo ========================================
echo.
echo This will disable:
echo  - 3-finger touch gestures
echo  - 4-finger touch gestures
echo  - Edge swipe gestures
echo  - Tablet mode auto-switch
echo.
echo WARNING: This requires Administrator privileges!
echo.
pause

echo.
echo Applying registry changes...
regedit /s disable_touch_gestures.reg

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Touch gestures disabled.
    echo ========================================
    echo.
    echo Please LOG OUT and LOG BACK IN for changes to take effect.
    echo.
) else (
    echo.
    echo ========================================
    echo ERROR: Failed to apply changes.
    echo ========================================
    echo.
    echo Please run this script as Administrator!
    echo Right-click and select "Run as administrator"
    echo.
)

pause
