@echo off
:: Ensure the script runs in its own directory (Fixes "Run as Administrator" path issue)
cd /d %~dp0

:: ------------------------------------------
:: Lottery Manager - One-Click Packager (Final Rescue)
:: ------------------------------------------
echo [Step 0] Killing existing processes to unlock files...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM electron.exe /T >nul 2>&1

echo [Step 1] Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. 
    echo Please install it from https://nodejs.org/ and RESTART your PC.
    pause
    exit /b
)

:: Use HTTP instead of HTTPS to bypass SSL issues
echo [Config] Setting up mirrors and cleaning cache...
call npm cache clean --force
call npm config set registry http://registry.npmmirror.com
call npm config set strict-ssl false
set ELECTRON_MIRROR=http://npmmirror.com/mirrors/electron/

:: Check Disk Space Warning
echo [Check] Please ensure your C: drive has at least 1GB free space.

:: Deep Clean
echo [Clean] Cleaning everything...
if exist node_modules (
    echo Removing old node_modules...
    rd /s /q node_modules >nul 2>&1
)
if exist package-lock.json (
    del /f /q package-lock.json >nul 2>&1
)

:: 2. Install
echo [Step 2] Installing dependencies (This may take time)...
call npm install --no-audit
if errorlevel 1 (
    echo [ERROR] npm install failed. 
    echo Please make sure NO other programs are using this folder.
    pause
    exit /b
)

:: 3. Build
echo [Step 3] Building App...
call npm run dist
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b
)

echo.
echo ==========================================
echo   SUCCESS! 
echo   Check the "release" folder for your .exe
echo ==========================================
pause
