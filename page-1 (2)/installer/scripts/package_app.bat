@echo off
:: ============================================================
:: Package Kiosk App for Distribution
:: Creates a ZIP file ready to upload to Google Cloud Storage
:: ============================================================

echo ========================================
echo    Packaging Timezone Kiosk App
echo ========================================
echo.

:: Navigate to the page-1 (2) folder (parent of installer)
cd /d "%~dp0\..\.."

echo Current directory: %cd%
echo.

:: Output filename
set ZIPFILE=timezone-kiosk-app.zip

:: Remove old ZIP if exists
if exist "%ZIPFILE%" (
    echo Removing old package...
    del "%ZIPFILE%"
)

echo Creating package: %ZIPFILE%
echo.
echo Including:
echo   - page-1 folder
echo   - server.js
echo   - package.json
echo   - package-lock.json (if exists)
echo   - db.js
echo   - .env
echo   - nulshock folder
echo   - electron-main.js
echo   - preload.js
echo   - nulshock folder (fonts)
echo.

:: Check if required files exist
if not exist "page-1" (
    echo [ERROR] page-1 folder not found!
    echo Make sure you run this script from the installer\scripts folder.
    pause
    exit /b 1
)

if not exist "server.js" (
    echo [ERROR] server.js not found!
    pause
    exit /b 1
)

:: Build the list of files to include
echo Building file list...
set "INCLUDE_LIST=page-1,server.js,package.json,db.js,electron-main.js,preload.js"

if exist "package-lock.json" set "INCLUDE_LIST=%INCLUDE_LIST%,package-lock.json"
if exist ".env" set "INCLUDE_LIST=%INCLUDE_LIST%,.env"
if exist ".env.example" set "INCLUDE_LIST=%INCLUDE_LIST%,.env.example"
if exist "nulshock" set "INCLUDE_LIST=%INCLUDE_LIST%,nulshock"

echo Files to include: %INCLUDE_LIST%
echo.

:: Use PowerShell to create ZIP
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$items = '%INCLUDE_LIST%'.Split(','); Compress-Archive -Path $items -DestinationPath '%ZIPFILE%' -Force"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo    Package created successfully!
    echo ========================================
    echo.
    echo File: %cd%\%ZIPFILE%
    
    :: Show file size
    for %%A in ("%ZIPFILE%") do (
        set /a SIZE_MB=%%~zA / 1048576
        echo Size: %%~zA bytes
    )
    
    echo.
    echo ========================================
    echo    Next steps:
    echo ========================================
    echo.
    echo 1. Upload '%ZIPFILE%' to Google Cloud Storage
    echo 2. Make it publicly accessible OR use existing URL
    echo 3. Rebuild the installer in Inno Setup (F9)
    echo.
) else (
    echo.
    echo [ERROR] Failed to create package!
    echo.
)

pause
