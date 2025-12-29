@echo off
echo ========================================
echo    TIZO Application Setup
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found
node -v

:: Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed!
    pause
    exit /b 1
)

echo [OK] npm found
npm -v
echo.

:: Install dependencies
echo ========================================
echo    Installing Dependencies...
echo ========================================
echo.
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed successfully!
echo.

:: Database setup reminder
echo ========================================
echo    Database Setup Reminder
echo ========================================
echo.
echo Before starting the server, make sure you have:
echo.
echo 1. Created a PostgreSQL database named 'TimeZoneDB'
echo 2. Imported the TimeZoneDB.sql file in pgAdmin:
echo    - Open pgAdmin
echo    - Right-click on your database
echo    - Select Query Tool
echo    - Open and execute TimeZoneDB.sql
echo.
echo ========================================
echo.

:: Ask user if they want to start the server
set /p startserver="Do you want to start the server now? (Y/N): "
if /i "%startserver%"=="Y" (
    echo.
    echo ========================================
    echo    Starting Server...
    echo ========================================
    echo.
    echo Server will be available at: http://localhost:3000
    echo Press Ctrl+C to stop the server
    echo.
    node server.js
) else (
    echo.
    echo To start the server later, run:
    echo    node server.js
    echo.
    echo Server will be available at: http://localhost:3000
    echo.
)

pause
