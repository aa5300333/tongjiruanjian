@echo off
:: ------------------------------------------
:: Lottery Manager - Local Runner
:: ------------------------------------------
echo ==========================================
echo   Lottery Manager - Local Runner
echo ==========================================
echo.

:: 1. Check Node
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. 
    echo Please install it from https://nodejs.org/
    pause
    exit /b
)

:: 2. Install (only if needed)
if not exist node_modules (
    echo [1/2] Installing environment...
    call npm config set registry http://registry.npmmirror.com
    call npm install
)

:: 3. Run
echo [2/2] Starting system...
echo.
echo ------------------------------------------
echo   SYSTEM IS RUNNING!
echo   Your browser should open automatically.
echo   Keep this window open while using the app.
echo ------------------------------------------
echo.

:: Start the dev server and open browser
start http://localhost:3000
call npm run dev

pause
