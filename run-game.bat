@echo off
setlocal
title F.R.A.M.E. 2240 - Dev Server
cd /d "%~dp0"

echo ============================================
echo   F.R.A.M.E. 2240
echo   Starting local development server...
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on your PATH.
  echo         Install Node.js 20 or newer from https://nodejs.org/ then run this again.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run detected - installing dependencies. This happens only once.
  echo.
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
  echo.
)

echo Launching. Your browser should open automatically.
echo Close this window or press Ctrl+C to stop the server.
echo.
call npm run dev

echo.
echo Server stopped.
pause
