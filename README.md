# Absensi Siswa Offline

## Cara tercepat menjalankan HTTPS

### Windows sekali klik

Klik dua kali `MULAI-HTTPS.bat`. Skrip akan memasang dependensi jika diperlukan, membuat folder `dist`, lalu menjalankan server HTTPS.

### Terminal

```bash
npm install
npm run start:https
```

Perintah `start:https` sekarang otomatis menjalankan `npm run build` sebelum server HTTPS dibuka. Jangan menjalankan `npm run serve:https` sebelum folder `dist` tersedia.

PWA React + TypeScript yang menyimpan data ke IndexedDB melalui Dexie. Aplikasi dapat dipasang dari Chrome/Edge, tetap dibuka tanpa internet, memindai QR, menyimpan absensi, mengelola guru/siswa, membuat QR, mengekspor Excel, memberi notifikasi suara, dan menyinkronkan data ke server lokal opsional.

## Notifikasi Infobip WhatsApp

Notifikasi hadir dan pulang dikirim melalui server ke Infobip WhatsApp. API key tidak disimpan di frontend atau repository. Jika konfigurasi Infobip belum diisi, aplikasi tetap berjalan normal dan notifikasi WhatsApp otomatis dilewati tanpa menimbulkan error 503.

### Setup cepat

Salin file `.env.example` menjadi `.env` lalu sesuaikan nilainya:

```bash
copy .env.example .env
```

Contoh isi `.env`:

```env
INFOBIP_API_KEY=your_infobip_api_key
INFOBIP_WHATSAPP_FROM=6288211912087
INFOBIP_TEMPLATE_HADIR=notifikasi_kehadiran
INFOBIP_TEMPLATE_PULANG=notifikasi_pulang
INFOBIP_TEMPLATE_LANGUAGE=id
INFOBIP_BASE_URL=8vyr2e.api.infobip.com
INFOBIP_NOTIFY_URL=https://alamat-publik-sekolah.example/api/infobip/delivery-reports
# Optional (alternative to INFOBIP_API_KEY): OAuth2 client-credentials
# INFOBIP_CLIENT_ID=your_client_id
# INFOBIP_CLIENT_SECRET=your_client_secret
# INFOBIP_OAUTH_TOKEN_URL=https://<infobip-auth-host>/oauth/token
# Optional: webhook secret to verify delivery reports
# INFOBIP_WEBHOOK_SECRET=your_webhook_secret
# Optional: header name where webhook signature is sent (default: X-Infobip-Signature)
# INFOBIP_WEBHOOK_HEADER=X-Infobip-Signature
```

Atau set di PowerShell sebelum menjalankan server HTTPS:

```powershell
$env:INFOBIP_API_KEY = '<API key Infobip>'
$env:INFOBIP_WHATSAPP_FROM = '6288211912087'
$env:INFOBIP_TEMPLATE_HADIR = 'notifikasi_kehadiran'
$env:INFOBIP_TEMPLATE_PULANG = 'notifikasi_pulang'
$env:INFOBIP_TEMPLATE_LANGUAGE = 'id'
$env:INFOBIP_NOTIFY_URL = 'https://alamat-publik-sekolah.example/api/infobip/delivery-reports'
# Optional (OAuth):
# $env:INFOBIP_CLIENT_ID = '<client id>'
# $env:INFOBIP_CLIENT_SECRET = '<client secret>'
# $env:INFOBIP_OAUTH_TOKEN_URL = 'https://<infobip-auth-host>/oauth/token'
# Optional webhook secret:
# $env:INFOBIP_WEBHOOK_SECRET = '<webhook secret>'
npm run start:https
```

Kolom **Kontak** siswa harus berisi nomor WhatsApp Indonesia, misalnya `081234567890` atau `628123456789`. Pesan menggunakan gaya bahasa guru SDN 268 Panyileukan dan dikirim saat scan/hadir, Hadir semua siswa, perubahan status menjadi hadir, serta Pulangkan semua siswa. Base URL default adalah `8vyr2e.api.infobip.com` dan dapat diganti melalui `INFOBIP_BASE_URL`.

Pesan teks bebas Infobip hanya dapat dikirim dalam jendela percakapan WhatsApp aktif, biasanya 24 jam setelah orang tua menghubungi nomor bisnis. Untuk notifikasi di luar jendela tersebut, isi `INFOBIP_TEMPLATE_HADIR` dan `INFOBIP_TEMPLATE_PULANG` dengan nama template WhatsApp yang sudah disetujui Infobip. Template harus memiliki tiga placeholder berurutan: nama siswa, kelas, dan waktu.

Untuk validasi pengiriman, `INFOBIP_NOTIFY_URL` harus berupa URL HTTPS publik yang dapat diakses Infobip. Laporan disimpan di `server/data/infobip-delivery-reports.json`; status `DELIVERED_TO_HANDSET` berarti pesan diterima perangkat, sedangkan `PENDING` atau status error belum berarti diterima.

Status InfoBip juga tersedia di UI aplikasi. Jika konfigurasi belum aktif, aplikasi menampilkan status WA Nonaktif dan otomatis melewati pengiriman WhatsApp tanpa mengganggu proses absensi.

## Menjalankan

```bash
npm install
npm run dev
```

Buka alamat yang tampil di terminal. Untuk kamera pada perangkat selain localhost, gunakan HTTPS.

## Build PWA

```bash
npm run build
npm run preview
```

## Server mandiri opsional

Terminal kedua:

```bash
npm run server
```

Server menyimpan JSON ke `server/data`. URL default `http://localhost:4174/api` dapat diubah dari halaman Pengaturan.

### Metrics dan logging untuk Infobip
Server mengumpulkan metrik sederhana terkait pengiriman Infobip di `server/data/infobip-metrics.json`. Metrik yang dicatat:

- successful_requests: jumlah panggilan Infobip yang berhasil
- retry_attempts: jumlah percobaan ulang (retry)
- failed_requests: jumlah permintaan yang gagal setelah semua retry
- token_fetch_failures: jumlah kegagalan pengambilan token OAuth2

Untuk melihat metrik secara lokal, buka file:

```
server/data/infobip-metrics.json
```

Metrik ditulis setiap kali terjadi retry/failure/success sehingga memudahkan pemantauan ringan tanpa external monitoring.

### Docker Compose contoh
Ada contoh `docker-compose.infobip.example.yml` yang menunjukkan cara menjalankan aplikasi di container dengan environment variables yang relevan untuk Infobip. File ini hanya contoh — jangan masukkan secrets ke dalam file yang di-commit.

## Akun contoh

- Admin: `admin` / `admin123`
- Guru: `1987001` / `123456`

## Uji offline

1. Jalankan build dan buka aplikasi sekali saat online.
2. Buka DevTools > Application dan pastikan Service Worker aktif.
3. Ubah Network menjadi Offline, lalu muat ulang.
4. Login, kelola data, dan scan tetap memakai IndexedDB lokal.
5. Saat online kembali, klik Sinkronkan atau tunggu event `online`.

## Catatan

- QR kamera membutuhkan izin kamera.
- Data server lokal contoh tidak memiliki autentikasi dan ditujukan untuk jaringan sekolah tepercaya. Tambahkan HTTPS, autentikasi, audit log, backup, dan kontrol akses sebelum produksi.
- Kata sandi contoh disimpan lokal untuk demo. Produksi harus memakai hashing pada server dan kebijakan kredensial yang tepat.

## Template dan Excel

Menu **Templates** menyediakan template siswa dan guru dalam format XLSX. Halaman Data Siswa dan Data Guru memiliki tombol Template, Import .xlsx, dan Export .xlsx. Import memperbarui data berdasarkan NISN/NIK dan tetap bekerja offline karena hasilnya disimpan ke IndexedDB.

## Izin kamera

Aplikasi tidak dapat mengaktifkan izin kamera tanpa persetujuan pengguna karena aturan keamanan browser. Tekan **Izinkan Kamera** pada panel scanner. Kamera hanya tersedia melalui `localhost` atau koneksi HTTPS. Untuk pengujian Android atau perangkat lain pada jaringan lokal gunakan:

```bash
npm run dev:https
```

Buka alamat HTTPS yang ditampilkan, terima sertifikat pengembangan, lalu izinkan kamera. Jika izin pernah diblokir, buka ikon gembok/kamera pada bilah alamat, ubah izin Kamera menjadi Izinkan, lalu muat ulang aplikasi.

## Menjalankan melalui HTTPS

### Pengembangan HTTPS

```bash
npm install
npm run dev:https
```

### Server HTTPS mandiri untuk build produksi

```bash
npm install
npm run build
npm run start:https
```

Buka `https://localhost:8443`. Server juga menampilkan alamat HTTPS LAN. Sertifikat lokal dibuat otomatis di `server/certs`. Browser mungkin meminta persetujuan pada akses pertama. Untuk kamera Android yang paling andal, gunakan domain publik dengan sertifikat resmi atau pasang sertifikat lokal sebagai tepercaya pada perangkat.

### Hosting publik

Konfigurasi `vercel.json`, `netlify.toml`, dan `public/_headers` sudah disertakan. Hosting tersebut memberikan HTTPS resmi secara otomatis. Setelah deploy, buka domain HTTPS, masuk ke menu Scan, tekan Izinkan Kamera, lalu pilih kamera belakang. API sinkronisasi mandiri memerlukan server Node yang terpisah atau gunakan server HTTPS bawaan pada jaringan sekolah.

## Perbaikan TypeScript

Versi ini memperbaiki tipe riwayat scan, deklarasi CSS Vite, nilai awal timer toast, dan deklarasi lokal ZXing. Jika proyek lama pernah menjalankan instalasi yang terputus, hapus `node_modules` dan `package-lock.json`, lalu jalankan `npm install` kembali sebelum `npm run start:https`.
"# Absensi-Murid-offline" 
