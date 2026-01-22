@echo off
setlocal
cd /d %~dp0

echo ========================================
echo   Starting Storyboard Development...
echo ========================================

:: Start Backend in a new window
echo Starting Backend...
start "Storyboard Backend" cmd /k "cd server && npm run dev"

:: Start Frontend in a new window
echo Starting Frontend...
start "Storyboard Frontend" cmd /k "cd client && npm run dev"

echo.
echo Both services are starting in separate windows.
echo Keep this window open or close it; the other windows will stay running.
echo.
pause
