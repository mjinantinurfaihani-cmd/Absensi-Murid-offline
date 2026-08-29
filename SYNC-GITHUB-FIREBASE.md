# Sinkronisasi Semua Data: Server, Firebase, dan GitHub

## 📋 Ringkasan

Anda sekarang memiliki tombol sinkronisasi yang dapat menyinkronkan semua data absensi ke **tiga destinasi sekaligus**:

1. **Server Lokal** - API server mandiri (opsional)
2. **Firebase Firestore** - Cloud database untuk backup real-time
3. **GitHub** - Version control dan backup jangka panjang

## 🚀 Cara Menggunakan

### 1. Sinkronisasi Cepat (Semua Destination)

**Lokasi:** Halaman Scan di bagian toolbar (atas)

```
[Sinkronkan (Server + Firebase + Git)]
```

Klik tombol ini untuk menyinkronkan semua data ke ketiga tempat sekaligus.

### 2. Notifikasi Status

Setelah sync, akan menampilkan pesan berisi ringkasan:

```
✓ Sinkronisasi selesai (123ms): Server(45) + Firebase(45) + GitHub(45) = 135 total
```

Atau jika ada masalah:

```
✗ Sinkronisasi gagal: GitHub token tidak dikonfigurasi
```

## ⚙️ Setup GitHub Integration

Untuk mengaktifkan sinkronisasi ke GitHub, ikuti langkah berikut:

### Step 1: Buka Settings (Pengaturan)

- Login sebagai **admin**
- Klik tab **"pengaturan"** di menu atas

### Step 2: Konfigurasi GitHub Credentials

Di bagian **"Sinkronisasi GitHub"**, isi:

1. **GitHub Personal Access Token**
   - Token dengan scope: `repo`, `workflow`
   - Lihat cara mendapat token di bawah

2. **GitHub Username**
   - Default: `mjinantinurfaihani-cmd`
   - Ganti dengan username Anda (jika punya repo sendiri)

3. **Repository Name**
   - Default: `Absensi-Murid-offline`
   - Ganti dengan nama repository Anda

### Step 3: Dapatkan GitHub Personal Access Token

1. Buka https://github.com/settings/tokens
2. Klik **"Generate new token"** → **"Generate new token (classic)"**
3. Isi field:
   - **Token name**: `absensi-sync` (atau nama lain)
   - **Expiration**: Pilih sesuai kebutuhan (90 days, 1 year, dst)
   - **Scopes**: Centang `repo` dan `workflow`
4. Klik **"Generate token"** di bawah
5. **Copy token** (hanya muncul sekali!)
6. Paste ke field "GitHub Personal Access Token" di Settings

### Step 4: Simpan Konfigurasi

Klik tombol **"Simpan Konfigurasi GitHub"**

Jika berhasil akan muncul pesan:
```
✓ GitHub configured: username/repository
```

Jika gagal, periksa:
- Token sudah di-copy dengan benar?
- Username dan repo name sesuai?
- Internet connection aktif?

## 📊 Data Yang Disinkronkan

Setiap kali sync, data berikut akan dikirim:

| Destination | Data | Format |
|-------------|------|--------|
| **Server** | Teachers, Students, Attendance | JSON (merge dengan server) |
| **Firebase** | Teachers, Students | Firestore collections |
| **GitHub** | Teachers, Students, Attendance | Single JSON file per sync |

### GitHub File Structure

File akan disimpan di:
```
data-sync/sync-data-YYYY-MM-DD.json
```

Contoh konten:
```json
{
  "timestamp": "2026-08-29T10:30:45.123Z",
  "summary": {
    "totalStudents": 450,
    "totalTeachers": 25,
    "totalAttendanceRecords": 5230,
    "syncedAt": "2026-08-29T10:30:45.123Z"
  },
  "data": {
    "students": [...],
    "teachers": [...],
    "attendance": [...]
  }
}
```

## 🔄 Automatic Sync

Sistem juga melakukan **auto-sync** di background setiap 15 detik jika:
- Device online (`navigator.onLine`)
- Server URL sudah dikonfigurasi

Auto-sync hanya mengirim ke **Server lokal**, bukan ke Firebase/GitHub.

## ❌ Troubleshooting

### Sync Gagal ke GitHub

**Error: "GitHub token tidak dikonfigurasi"**
- Solusi: Konfigurasi token di Settings → Sinkronisasi GitHub

**Error: "Repository not found or not accessible"**
- Token scope kurang: Pastikan scope `repo` dan `workflow` dicentang
- Repository tidak ada: Verifikasi username dan repo name
- Token expired: Generate token baru

**Error: "Failed to update ref"**
- Ada conflict di branch main
- Solusi: Check GitHub repository untuk melihat issue

### Sync Partial (Sebagian Berhasil)

Jika status `partial`, berarti:
- Server sync berhasil, tapi Firebase/GitHub gagal
- Atau sebaliknya

Pesan akan menunjukkan:
```
✓ Sinkronisasi selesai: Server(45) + Firebase(0) + GitHub(0) = 45 total
```

### Sync Lambat

Jika sync memakan waktu lama:
- Ukuran data besar: Tunggu hingga selesai
- Internet lambat: Cek koneksi
- Server tidak respond: Cek status server

## 📱 Monitoring Sync Status

### Check Last Sync Time

Buka browser console (F12) dan jalankan:

```javascript
console.log({
  lastServerSync: localStorage.getItem('lastSync'),
  lastFirebaseSync: localStorage.getItem('lastFullSync'),
  lastGithubSync: localStorage.getItem('lastGithubSync')
})
```

### Check Sync Status di GitHub

Buka repository: https://github.com/mjinantinurfaihani-cmd/Absensi-Murid-offline

File terbaru akan ada di folder `data-sync/`

## 🔐 Security Notes

- **GitHub Token**: Jangan share token ke orang lain!
- **Token Scope**: Gunakan scope minimal yang diperlukan (`repo`, `workflow`)
- **Token Expiration**: Set expiration date yang reasonable
- **Local Storage**: Token disimpan di browser localStorage (encrypted via HTTPS)

## 🎯 Best Practices

1. **Test Sync Terlebih Dahulu**
   - Klik "Sinkronkan" setelah konfigurasi
   - Verifikasi data muncul di GitHub (folder `data-sync/`)

2. **Monitor Regular**
   - Check GitHub repository secara berkala
   - Pastikan file baru ter-generate setiap hari

3. **Backup**
   - GitHub automatic jadi backup
   - Firebase juga bisa backup di cloud

4. **Network**
   - Sync berfungsi terbaik dengan internet stabil
   - Offline mode tetap berjalan (sync nanti saat online)

## 📞 Support

Jika ada masalah:

1. **Check Console Errors** (F12 → Console)
2. **Verify GitHub Token** - Buka https://github.com/settings/tokens
3. **Test Connectivity** - Pastikan internet aktif
4. **Check Repository Access** - Pastikan punya akses ke repo

## 🔗 Links

- GitHub Token: https://github.com/settings/tokens
- GitHub Repository: https://github.com/mjinantinurfaihani-cmd/Absensi-Murid-offline
- Firebase: https://console.firebase.google.com/u/0/project/absensi-murid-268/overview?hl=id
- App: Buka offline app di browser

---

**Last Updated**: 2026-08-29  
**Version**: 1.0.0
