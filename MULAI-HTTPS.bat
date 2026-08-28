@echo off
setlocal
cd /d "%~dp0"
title Absensi Siswa Offline HTTPS
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terpasang.
  echo Pasang Node.js versi LTS lalu jalankan file ini kembali.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Memasang dependensi...
  call npm install
  if errorlevel 1 goto :error
)
if "%INFOBIP_BASE_URL%"=="" set "INFOBIP_BASE_URL=8vyr2e.api.infobip.com"
if "%INFOBIP_API_KEY%"=="" (
  echo.
  echo Masukkan API key Infobip untuk mengaktifkan notifikasi:
  set /p "INFOBIP_API_KEY=API key: "
)
if "%INFOBIP_WHATSAPP_FROM%"=="" set "INFOBIP_WHATSAPP_FROM=6288211912087"
if "%INFOBIP_API_KEY%"=="" (
  echo API key Infobip kosong. Notifikasi Infobip tidak akan aktif.
)
if "%INFOBIP_WHATSAPP_FROM%"=="" (
  echo Sender WhatsApp Infobip kosong. Notifikasi Infobip tidak akan aktif.
)
echo Membuat build dan menjalankan HTTPS...
call npm run start:https
if errorlevel 1 goto :error
goto :eof
:error
echo.
echo Proses gagal. Periksa pesan di atas.
pause
exit /b 1
