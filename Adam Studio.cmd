@echo off
cd /d "%~dp0"
rem First launch: install and check everything Adam Studio needs.
if not exist "%USERPROFILE%\.adam-studio\setup.json" call npm run setup
call npm run ui
pause
