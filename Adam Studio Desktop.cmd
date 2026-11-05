@echo off
setlocal
cd /d "%~dp0"
node "packages\desktop\launch.mjs"
if errorlevel 1 pause
