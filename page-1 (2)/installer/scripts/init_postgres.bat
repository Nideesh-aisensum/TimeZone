@echo off
:: ============================================================
:: PostgreSQL Database Cluster Initializer
:: Run this as Administrator!
:: ============================================================

echo ========================================
echo    PostgreSQL Initialization
echo ========================================
echo.

:: Check if running as admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Please run this script as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

set PGDIR=C:\Program Files\PostgreSQL\17
set DATADIR=%PGDIR%\data
set BINDIR=%PGDIR%\bin

echo PostgreSQL directory: %PGDIR%
echo Data directory: %DATADIR%
echo.

:: Check if PostgreSQL binaries exist
if not exist "%BINDIR%\initdb.exe" (
    echo [ERROR] PostgreSQL 17 not found!
    pause
    exit /b 1
)

:: Check if already initialized
if exist "%DATADIR%\postgresql.conf" (
    echo [INFO] Database cluster already exists!
    goto START_SERVICE
)

:: Create password file
echo timezone@2025> "%TEMP%\pgpass.txt"

echo Initializing database cluster...
"%BINDIR%\initdb.exe" -D "%DATADIR%" -U postgres --pwfile="%TEMP%\pgpass.txt" -E UTF8

del "%TEMP%\pgpass.txt" 2>nul

if not exist "%DATADIR%\postgresql.conf" (
    echo [ERROR] Initialization failed!
    pause
    exit /b 1
)

echo [OK] Database cluster created!
echo.

:: Configure port 5433
echo Configuring port 5433...
powershell -Command "(Get-Content '%DATADIR%\postgresql.conf') -replace '^#?port\s*=.*', 'port = 5433' | Set-Content '%DATADIR%\postgresql.conf'"

:START_SERVICE
echo.
echo Registering PostgreSQL service...
"%BINDIR%\pg_ctl.exe" register -N postgresql-17 -D "%DATADIR%" 2>nul

echo Starting PostgreSQL service...
net start postgresql-17

:: Wait for it to start
timeout /t 5 /nobreak >nul

:: Check if running
netstat -ano | findstr ":5433.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo [OK] PostgreSQL is running on port 5433!
    echo ========================================
) else (
    echo [WARNING] Service may not have started correctly
    echo Trying direct start...
    "%BINDIR%\pg_ctl.exe" start -D "%DATADIR%" -l "%DATADIR%\logfile.txt"
    timeout /t 5 /nobreak >nul
)

:: Create TimeZone database
echo.
echo Creating TimeZone database...
set PGPASSWORD=timezone@2025
"%BINDIR%\createdb.exe" -U postgres -p 5433 TimeZone 2>nul
if %errorlevel% equ 0 (
    echo [OK] TimeZone database created!
) else (
    echo [INFO] TimeZone database may already exist
)

echo.
echo ========================================
echo    Setup Complete!
echo ========================================
pause
