@echo off
setlocal
title BeatFlow
cd /d "%~dp0"

rem BeatFlow Windows launcher: double-clicking this file (or the desktop
rem shortcut that points at it) starts the Next.js dev server in this console
rem window, then opens http://localhost:3000.
rem The real startup logic lives in start.sh (bash); this wrapper only finds
rem Git Bash and runs it from this directory so all relative paths resolve.

set "BASH="
for %%P in ("C:\Program Files\Git\bin\bash.exe" "C:\Program Files\Git\usr\bin\bash.exe" "%LOCALAPPDATA%\Programs\Git\bin\bash.exe") do (
  if not defined BASH if exist "%%~P" set "BASH=%%~P"
)

if not defined BASH (
  echo Git Bash was not found. Install Git for Windows from:
  echo   https://git-scm.com/download/win
  pause
  exit /b 1
)

echo Starting BeatFlow - web app only. Keep this window open.
echo Press Ctrl+C here (or close this window) to stop it.
echo.

rem Open the app in the default browser once the dev server has booted.
rem Keep in step with BEATFLOW_PORT when overriding the port.
start "" /min cmd /c "timeout /t 10 /nobreak >nul && start http://localhost:3000"

"%BASH%" -c "exec ./start.sh"

echo.
echo BeatFlow stopped.
pause
