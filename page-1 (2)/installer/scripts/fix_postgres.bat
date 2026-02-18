@echo off
:: ============================================================
:: PostgreSQL Complete Reinstall Script
:: Run this as Administrator to fix PostgreSQL installation
:: ============================================================

echo ========================================
echo    PostgreSQL Complete Fix
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
set BINDIR=%PGDIR%\bin
set DATADIR=%PGDIR%\data

:: Step 1: Stop any running PostgreSQL
echo Step 1: Stopping PostgreSQL services...
net stop postgresql-17 >nul 2>&1
taskkill /F /IM postgres.exe >nul 2>&1
taskkill /F /IM pg_ctl.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Step 2: Remove the service if it exists
echo Step 2: Removing old service...
sc delete postgresql-17 >nul 2>&1
timeout /t 2 /nobreak >nul

:: Step 3: Clean the data directory
echo Step 3: Cleaning data directory...
if exist "%DATADIR%" (
    rd /s /q "%DATADIR%" 2>nul
    mkdir "%DATADIR%"
)

:: Step 4: Initialize the database cluster
echo Step 4: Initializing database cluster...
echo.

:: Create password file
echo timezone@2025> "%TEMP%\pgpass.txt"

:: Run initdb with explicit paths to avoid version conflicts
set PATH=%BINDIR%;%PATH%
cd /d "%BINDIR%"

initdb.exe -D "%DATADIR%" -U postgres --pwfile="%TEMP%\pgpass.txt" -E UTF8 --auth=trust

del "%TEMP%\pgpass.txt" >nul 2>&1

if not exist "%DATADIR%\postgresql.conf" (
    echo [ERROR] Database initialization failed!
    echo.
    echo Possible solutions:
    echo 1. Uninstall PostgreSQL 17 from Windows Settings
    echo 2. Delete folder: %PGDIR%
    echo 3. Reinstall PostgreSQL from enterprisedb.com
    pause
    exit /b 1
)

echo [OK] Database cluster initialized!

:: Step 5: Configure port to 5433
echo Step 5: Configuring port 5433...
powershell -Command "(Get-Content '%DATADIR%\postgresql.conf') -replace '#port = 5432', 'port = 5433' | Set-Content '%DATADIR%\postgresql.conf'"

:: Step 6: Configure pg_hba.conf for local connections
echo Step 6: Configuring authentication...
echo # Allow local connections with password> "%DATADIR%\pg_hba.conf"
echo host    all             all             127.0.0.1/32            md5>> "%DATADIR%\pg_hba.conf"
echo host    all             all             ::1/128                 md5>> "%DATADIR%\pg_hba.conf"
echo local   all             all                                     trust>> "%DATADIR%\pg_hba.conf"

:: Step 7: Register and start the service
echo Step 7: Registering PostgreSQL service...
"%BINDIR%\pg_ctl.exe" register -N postgresql-17 -D "%DATADIR%"

echo Step 8: Starting PostgreSQL service...
net start postgresql-17

:: Wait for it to start
timeout /t 5 /nobreak >nul

:: Step 9: Verify it's running
echo Step 9: Verifying...
netstat -ano | findstr ":5433.*LISTENING" >nul
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo [SUCCESS] PostgreSQL is running on port 5433!
    echo ========================================
) else (
    echo [WARNING] Port check failed. Trying direct start...
    "%BINDIR%\pg_ctl.exe" start -D "%DATADIR%" -l "%DATADIR%\logfile.txt"
    timeout /t 5 /nobreak >nul
)

:: Step 10: Set postgres password and create database
echo Step 10: Creating TimeZone database...
set PGPASSWORD=timezone@2025
"%BINDIR%\psql.exe" -U postgres -p 5433 -c "ALTER USER postgres WITH PASSWORD 'timezone@2025';" 2>nul

"%BINDIR%\createdb.exe" -U postgres -p 5433 TimeZone 2>nul
if %errorlevel% equ 0 (
    echo [OK] TimeZone database created!
) else (
    echo [INFO] Database may already exist
)

echo.
echo ========================================
echo    PostgreSQL Setup Complete!
echo ========================================
echo.
echo Connection details:
echo   Host: localhost
echo   Port: 5433
echo   Database: TimeZone
echo   User: postgres
echo   Password: timezone@2025
echo.
pause
