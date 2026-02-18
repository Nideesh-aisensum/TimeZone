@echo off
:: ============================================================
:: TimeZone Database Creator
:: Creates the PostgreSQL database if it doesn't exist
:: ============================================================

echo ========================================
echo    Creating TimeZone Database
echo ========================================
echo.

:: PostgreSQL binaries path
set PGBIN=C:\Program Files\PostgreSQL\17\bin

:: Check if PostgreSQL 17 exists, otherwise try 16
if not exist "%PGBIN%\psql.exe" (
    set PGBIN=C:\Program Files\PostgreSQL\16\bin
)

if not exist "%PGBIN%\psql.exe" (
    echo [ERROR] PostgreSQL not found!
    echo Please ensure PostgreSQL 17 or 16 is installed.
    exit /b 1
)

:: Database credentials
set PGPASSWORD=timezone@2025
set PGPORT=5433

echo Using PostgreSQL from: %PGBIN%
echo Port: %PGPORT%
echo.

:: Wait for service to be ready
echo Waiting for PostgreSQL service...
timeout /t 3 /nobreak >nul

:: Check if database already exists
"%PGBIN%\psql.exe" -U postgres -p %PGPORT% -tc "SELECT 1 FROM pg_database WHERE datname = 'TimeZone'" 2>nul | findstr "1" >nul

if %errorlevel% neq 0 (
    echo Creating TimeZone database...
    "%PGBIN%\createdb.exe" -U postgres -p %PGPORT% TimeZone
    
    if %errorlevel% equ 0 (
        echo [OK] Database 'TimeZone' created successfully!
    ) else (
        echo [ERROR] Failed to create database!
        exit /b 1
    )
) else (
    echo [OK] Database 'TimeZone' already exists.
)

echo.
echo ========================================
echo    Database setup complete!
echo ========================================
exit /b 0
