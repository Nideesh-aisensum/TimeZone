@echo off
:: ============================================================
:: Timezone Kiosk Single-Click Launcher
:: Ensures PostgreSQL is running, starts server, opens app
:: ============================================================

:: Change to app directory
cd /d "%~dp0"

:: If we're in scripts folder, go up to app root
if exist "..\server.js" cd /d "%~dp0.."
if exist "..\..\server.js" cd /d "%~dp0..\.."

:: Verify we're in the right place
if not exist "server.js" (
    echo [ERROR] server.js not found in %cd%
    pause
    exit /b 1
)

:: ========================================
:: Step 1: Check PostgreSQL
:: ========================================
echo Checking PostgreSQL...

:: Check if PostgreSQL is running on port 5433
netstat -ano | findstr ":5433.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PostgreSQL is running
    goto CHECK_SERVER
)

:: Try to start PostgreSQL service
echo Starting PostgreSQL service...
net start postgresql-17 >nul 2>&1

:: Wait a moment
timeout /t 3 /nobreak >nul

:: Check again
netstat -ano | findstr ":5433.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] PostgreSQL started
    goto CHECK_SERVER
)

:: Try pg_ctl as fallback
echo Trying direct start...
if exist "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" (
    "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\17\data" -l "C:\Program Files\PostgreSQL\17\data\logfile.txt" >nul 2>&1
    timeout /t 5 /nobreak >nul
)

:: Final check
netstat -ano | findstr ":5433.*LISTENING" >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] PostgreSQL may not be running properly
    echo App may have limited functionality
)

:CHECK_SERVER
:: ========================================
:: Step 2: Start Node.js Server
:: ========================================
echo.
echo Checking server...

netstat -ano | findstr ":3000.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Server already running
    goto START_APP
)

echo Starting server...

:: Find Node.js
where node >nul 2>&1
if %errorlevel% equ 0 (
    start /B "" node server.js
) else if exist "C:\Program Files\nodejs\node.exe" (
    start /B "" "C:\Program Files\nodejs\node.exe" server.js
) else (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)

:: Wait for server to start
set COUNT=0
:WAIT_SERVER
timeout /t 1 /nobreak >nul
set /a COUNT+=1

netstat -ano | findstr ":3000.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Server is ready!
    goto START_APP
)

if %COUNT% lss 15 (
    echo   Waiting for server... [%COUNT%/15]
    goto WAIT_SERVER
)

echo [WARNING] Server may not have started properly

:START_APP
:: ========================================
:: Step 3: Launch Electron App
:: ========================================
echo.
echo Starting Kiosk Application...

:: Find npm
where npm >nul 2>&1
if %errorlevel% equ 0 (
    start "" npm run start
) else if exist "C:\Program Files\nodejs\npm.cmd" (
    start "" "C:\Program Files\nodejs\npm.cmd" run start
) else (
    echo [ERROR] npm not found!
    pause
    exit /b 1
)

:: Exit batch file
exit
