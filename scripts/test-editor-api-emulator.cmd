@echo off
node "%~dp0test-editor-api-emulator.mjs"
if errorlevel 1 exit /b %errorlevel%
node "%~dp0test-editor-browser-emulator.mjs"
