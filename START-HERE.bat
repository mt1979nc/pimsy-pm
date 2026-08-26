@echo off
setlocal
title PIMSY Implementations - local setup

echo.
echo   PIMSY Implementations
echo   =====================
echo.
echo   This window will set the app up and start it. First run takes a few
echo   minutes, mostly downloading packages. Leave this window OPEN - closing
echo   it stops the app.
echo.

cd /d "%~dp0"

REM ---------------------------------------------------------------- Node check
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed.
  echo.
  echo       Download the LTS version from  https://nodejs.org
  echo       Run the installer, accept the defaults, then RESTART this file.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 20 (
  echo   [X] Node.js %NODEMAJOR% is too old - version 20 or newer is required.
  echo       Install the LTS build from https://nodejs.org and try again.
  echo.
  pause
  exit /b 1
)
echo   [1/5] Node.js found.

for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set APPVER=%%v
echo         This is version %APPVER% of the app.
echo         The sign-in page shows the same number at the bottom. If the
echo         browser shows an older one, you are running a different copy
echo         from a different folder.
echo.

REM ------------------------------------------------------------------- Install
if exist "node_modules" (
  echo   [2/5] Checking packages are up to date...
) else (
  echo   [2/5] Installing packages. This is the slow part, please wait...
)
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo   [X] Package installation failed. Scroll up for the reason.
  echo       The most common cause is no internet connection.
  echo.
  pause
  exit /b 1
)
echo.

REM --------------------------------------------------------------------- Setup
echo   [3/5] Preparing the database and loading your implementation playbook...
echo.
call npm run setup
if errorlevel 1 (
  echo.
  echo   [X] Setup failed. Scroll up for the reason.
  echo.
  echo       If it mentions the database, the quickest fix is to start the
  echo       database over: run  RESET-DATABASE.bat  in this folder, then
  echo       double-click START-HERE.bat again.
  echo.
  pause
  exit /b 1
)

REM --------------------------------------------------------------- Build
echo.
echo   [4/5] Building the app. Takes a minute or two, only happens once...
echo.
call npm run build
if errorlevel 1 (
  echo.
  echo   [X] Build failed. Scroll up for the reason.
  echo.
  pause
  exit /b 1
)

REM --------------------------------------------------------------------- Start
echo.
echo   ============================================================
echo     [5/5] Starting the app.
echo.
echo     1. Wait for the line that says  Ready
echo     2. Open  http://localhost:3000  in your browser
echo     3. Sign in as  alexander@pimsyehr.com
echo     4. NO EMAIL IS SENT. Your sign-in link is saved to
echo        SIGN-IN-LINK.txt in this folder - open it and
echo        click the link. (It is printed here too.)
echo.
echo     Keep this window open. Press Ctrl+C to stop.
echo     Only ONE copy can run at a time - close any other
echo     window running this app before starting another.
echo   ============================================================
echo.

start "" http://localhost:3000
call npm run start

echo.
echo   The app has stopped.
pause
