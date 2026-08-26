@echo off
setlocal
title PIMSY Implementations - reset local database

cd /d "%~dp0"

echo.
echo   Reset the local database
echo   ========================
echo.
echo   This deletes the local demo database and everything you've entered
echo   into it. Your settings file (.env.local) and the code are untouched.
echo.
echo   Use this if setup failed partway through, or if you want a clean
echo   demo again.
echo.

set /p CONFIRM="  Type Y and press Enter to delete it, or just close this window: "
if /i not "%CONFIRM%"=="Y" (
  echo.
  echo   Cancelled. Nothing was deleted.
  echo.
  pause
  exit /b 0
)

if exist ".pglite" (
  rmdir /s /q ".pglite"
  echo.
  echo   [OK] Local database deleted.
) else (
  echo.
  echo   [OK] No local database found - nothing to delete.
)

echo.
echo   Now double-click START-HERE.bat to build it again.
echo.
pause
