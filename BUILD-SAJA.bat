@echo off
setlocal
cd /d "%~dp0"
title Build Absensi Siswa Offline
if not exist node_modules call npm install
call npm run build
if errorlevel 1 (
  echo Build gagal.
  pause
  exit /b 1
)
echo.
echo Build selesai. Folder dist sudah dibuat.
pause
