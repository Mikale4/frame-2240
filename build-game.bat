@echo off
setlocal
title Babel Sword: Reignition - Production Build
cd /d "%~dp0"

echo ============================================
echo   BABEL SWORD: REIGNITION
echo   Building the production bundle...
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
  echo Installing dependencies first...
  echo.
  call npm install --no-fund --no-audit
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Running automated tests...
call npm test
if errorlevel 1 (
  echo.
  echo [ERROR] Tests failed - build aborted.
  pause
  exit /b 1
)
echo.

echo Type-checking and bundling...
call npm run build
if errorlevel 1 (
  echo.
  echo [ERROR] Build failed. See the output above.
  pause
  exit /b 1
)

echo.
echo ============================================
echo   Build complete.
echo   Output: %CD%\dist
echo.
echo   To preview the built game, run:
echo     npm run preview
echo ============================================
echo.
pause
