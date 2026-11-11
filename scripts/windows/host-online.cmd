@echo off
setlocal
rem Double-click to host CATAN: New Energies for friends on other networks.
rem Builds the game, starts the server and brings up the invite link through Tailscale Funnel.
rem First time: see MULTIPLAYER.md (install Tailscale and sign in).
cd /d "%~dp0..\.."

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and try again.
  goto failed
)

if not exist node_modules (
  echo Installing the game's packages for the first time. This takes a minute...
  call npm install
  if errorlevel 1 goto failed
)

call npm run host:online
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo The game server stopped because of an error. Read the messages above.
pause
exit /b 1
