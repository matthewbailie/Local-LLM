@echo off
REM Double-click this file to start Free AI Forever (Windows).
REM It opens this window, starts the app, and opens it in a window.
REM Keep this window open while you use the app; close it (or press Ctrl + C)
REM to stop the app.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found.
  echo Install the LTS version from https://nodejs.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

node launch.mjs
pause
