@echo off
title Stats for Spotify
cd /d "%~dp0"
if not exist "node_modules\" call npm install
if not exist "dist\index.html" call npm run build
start "" npx electron .
exit /b 0
