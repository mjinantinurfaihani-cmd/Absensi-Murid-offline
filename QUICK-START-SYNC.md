# 🚀 Quick Start: Sinkronisasi GitHub + Firebase

Panduan singkat untuk memulai sinkronisasi ke GitHub dan Firebase dalam 5 menit.

## Step 1️⃣: Dapatkan GitHub Token (3 menit)

1. Buka: https://github.com/settings/tokens
2. Klik **"Generate new token"** → **"Generate new token (classic)"**
3. Isi form:
   - **Token name**: `absensi-sync`
   - **Expiration**: `90 days` atau lebih
   - **Scopes**: Centang ✅ `repo` dan ✅ `workflow`
4. Klik **"Generate token"** bawah halaman
5. **COPY token** yang muncul (hanya muncul 1x!)
6. Paste ke notepad sementara

## Step 2️⃣: Setup di App (2 menit)

1. **Login ke app** sebagai admin
2. Klik tab **"pengaturan"** (settings)
3. Scroll ke bagian **"Sinkronisasi GitHub"**
4. Isi 3 field:
   ```
   GitHub Token: ghp_xxxxxxxxxxxxxxxxxxxx  (paste dari Step 1)
   GitHub Username: mjinantinurfaihani-cmd
   Repository: Absensi-Murid-offline
   ```
5. Klik **"Simpan Konfigurasi GitHub"**

✅ Jika berhasil: `✓ GitHub configured: mjinantinurfaihani-cmd/Absensi-Murid-offline`

❌ Jika error:
- Pastikan token sudah di-copy dengan benar
- Periksa scope `repo` dan `workflow` dicentang
- Token belum expired

## Step 3️⃣: Test Sync

1. Kembali ke halaman **"scan"**
2. Di toolbar atas, klik tombol: **"Sinkronkan (Server + Firebase + Git)"**
3. Tunggu notifikasi (2-5 detik)

✅ Jika berhasil:
```
✓ Sinkronisasi selesai (456ms): Server(45) + Firebase(45) + GitHub(5230) = 5320 total
```

❌ Jika gagal:
- Check console (F12) untuk detail error
- Pastikan internet aktif
- Verifikasi token di Settings

## Step 4️⃣: Verifikasi di GitHub

1. Buka: https://github.com/mjinantinurfaihani-cmd/Absensi-Murid-offline
2. Cari folder: `data-sync/`
3. Lihat file: `sync-data-YYYY-MM-DD.json` (paling baru)
4. Click file untuk lihat isi
5. Verifikasi data ada di dalamnya ✓

## Daily Usage

Setelah setup, tinggal:

1. Gunakan app seperti biasa (scan QR, input absensi)
2. Kapan saja ingin backup → Klik **"Sinkronkan"**
3. Data otomatis ter-push ke 3 tempat:
   - ✅ Server API
   - ✅ Firebase Firestore
   - ✅ GitHub (version controlled)

## Tips & Tricks

### ⏰ Auto Backup

Biasakan sync setiap hari:
- Pagi sebelum mulai scan
- Siang setelah sesi pagi
- Sore setelah sesi siang

### 📱 Offline Mode

Tetap bisa bekerja tanpa internet:
- App tetap jalan offline
- Data tersimpan di cache lokal
- Otomatis sync ke GitHub saat online

### 🔄 Check Last Sync Time

Buka browser console (F12):
```javascript
localStorage.getItem('lastGithubSync')
// Output: 2026-08-29T10:30:45.123Z
```

### 🆘 Error: "GitHub token tidak dikonfigurasi"

**Solusi**: Setup token di Settings → Sinkronisasi GitHub

### 🆘 Error: "Repository not found"

**Cek**:
- Username: `mjinantinurfaihani-cmd` (sesuai?)
- Repository: `Absensi-Murid-offline` (sesuai?)
- Token scope punya `repo` + `workflow`?

### 🆘 Sync Lambat

Normal jika data banyak (>1000 records). Tunggu hingga selesai.

## Links Penting

| Tujuan | Link |
|--------|------|
| Token Manager | https://github.com/settings/tokens |
| Repository | https://github.com/mjinantinurfaihani-cmd/Absensi-Murid-offline |
| Firebase | https://console.firebase.google.com/project/absensi-murid-268 |
| App | Open di browser |

## Backup Strategy

**Recommended**:
- Sync **2-3x sehari** (pagi, siang, sore)
- GitHub = permanent archive
- Firebase = real-time sync
- Server = live working data

---

**Selesai! 🎉**

Sekarang data absensi Anda di-backup secara otomatis ke GitHub dan Firebase setiap kali click "Sinkronkan".

**Next**: Baca [SYNC-GITHUB-FIREBASE.md](SYNC-GITHUB-FIREBASE.md) untuk detail lebih lanjut.
