# 📱 Panduan Sinkronisasi Data: localhost:9005 ↔ Firebase

**Status:** ✅ Server lokal aktif | Data siap untuk diproses | Firebase quota management diperlukan

---

## 📊 Data yang Siap Disinkronkan

```
✅ Kehadiran (Attendance):  212 records  (data valid, tidak dihapus)
✅ Siswa (Students):        916 records  (917 total, 1 deleted)
✅ Guru (Teachers):         21 records   (semua aktif)
─────────────────────────
📌 TOTAL:                  1,149 records
```

**Lokasi Data:**
- 🖥️  Server Lokal: https://localhost:9005/api/data/
- ☁️  Firebase: `absensi-murid-268` (projectId)
- 📁 Backup: `server/data/` (JSON files)

---

## 🚀 Metode Sinkronisasi (3 Pilihan)

### ✅ Metode 1: Via Browser UI (RECOMMENDED - Paling Efisien)

**Keuntungan:**
- ✓ Automatic rate limiting built-in
- ✓ Graceful degradation (1 kegagalan ≠ block semua)
- ✓ Real-time progress indicators
- ✓ Toast notifications dengan detail

**Langkah-langkah:**

1. **Buka aplikasi:**
   ```
   https://localhost:5173
   ```

2. **Login dengan kredensial Anda**
   - Email: (akun Anda)
   - Password: (sesuai)

3. **Navigasi ke Settings (⚙️)**
   ```
   Klik ikon Settings di kanan atas
   Atau: Settings → Sync Settings
   ```

4. **Konfigurasi Sinkronisasi:**
   ```
   📍 Pilihan Sinkronisasi:
   ☑️  Server (localhost)  ← Default aktif
   ☑️  Firebase Firestore  ← Aktifkan ini
   ☑️  GitHub (optional)   ← Opsional
   ```

5. **Mulai Sinkronisasi:**
   ```
   Tekan: "Sinkronkan (Server + Firebase + Git)"
   ```

6. **Monitor Progress:**
   - Toast notification akan muncul
   - Menampilkan: ✓ Records synced / Failed counts
   - Durasi: ~2-5 menit untuk 1,149 records

7. **Verifikasi di Firebase Console:**
   ```
   https://console.firebase.google.com/
   → Project: absensi-murid-268
   → Firestore Database
   → Collection: attendance, students, teachers
   ```

---

### 🔄 Metode 2: Via Script Node.js (Dengan Rate Limiting)

**Keuntungan:**
- ✓ Automated (no UI required)
- ✓ Better error handling
- ✓ Retry dengan exponential backoff
- ✓ Logging detail

**Setup:**

```bash
# 1. Terminal 1: Start server lokal
npm run server

# 2. Terminal 2: Start dev server (optional untuk verifikasi UI)
npm run dev

# 3. Terminal 3: Jalankan sync script
npx tsx sync-firebase-rate-limited.ts
```

**Konfigurasi Rate Limiting:**
- Batch size: 500 records
- Delay antar batch: 2000ms
- Retry attempts: 3
- Exponential backoff: enabled

---

### 📥 Metode 3: Via Backup JSON (Manual Restore)

**Untuk kasus offline atau quota issue:**

```bash
# 1. Export data ke backup JSON
npm run server
# Backup otomatis tersimpan di: server/data/backup-YYYY-MM-DD.json

# 2. Kemudian upload manual via Firebase Console
# Atau gunakan Firebase CLI:
firebase firestore:restore backup-2026-08-29.json
```

---

## 🛠️ Troubleshooting

### ❌ Problem: "RESOURCE_EXHAUSTED: Quota exceeded"

**Sebab:** Firebase Firestore mencapai batas write quota (development mode)

**Solusi:**
```
1. Tunggu 24 jam untuk quota reset (Spark/Free plan)
2. Atau upgrade ke Blaze plan untuk unlimited
3. Atau batch dengan delay yang lebih besar
```

**Implementasi:**
```typescript
// Tunggu antar batch
await new Promise(r => setTimeout(r, 3000));
```

---

### ❌ Problem: "Connection refused di localhost"

**Sebab:** Server lokal tidak berjalan

**Solusi:**
```bash
# Terminal baru:
npm run server

# Verifikasi:
curl https://localhost:9005/api/data/students -k
```

---

### ❌ Problem: "CORS error pada browser"

**Sebab:** Browser-based sync ke server lokal tidak diizinkan

**Solusi:**
- Gunakan Metode 1 (UI sudah menghandle ini)
- Atau jalankan dari server yang sama (https://localhost:5173)

---

## 📋 Checklist Sinkronisasi

```
PRE-SYNC:
☐ Server lokal running (port 4174/9005)
☐ Browser terbuka di https://localhost:5173
☐ Login sudah dilakukan
☐ Settings panel accessible

SYNC PROCESS:
☐ Firestore checkbox diaktifkan
☐ Klik "Sinkronkan" button
☐ Monitor toast notifications
☐ Tunggu hingga selesai

POST-SYNC:
☐ Buka Firebase Console
☐ Verifikasi data ada di collections
☐ Check timestamp (syncedAt field)
☐ Bandingkan count dengan source

VALIDATION:
✓ Kehadiran: 212 records uploaded
✓ Siswa: 916 records uploaded
✓ Guru: 21 records uploaded
✓ Total: 1,149 records in Firebase
```

---

## 📊 Performance Metrics

**Estimated Sync Time (Metode 1 - Browser UI):**
```
Siswa (916):      ~1-2 min
Guru (21):        ~10-20 sec
Kehadiran (212):  ~30-60 sec
────────────────────────
TOTAL:           ~2-3 min (dengan buffering)
```

**Network:**
- Upload size: ~2-3 MB
- Bandwidth: ~100-200 KB/sec (typical home connection)
- Latency: Firebase Firestore API response time

---

## 🔐 Security Notes

- ✓ HTTPS enabled (localhost:9005)
- ✓ Self-signed cert (development mode)
- ✓ No credentials stored in browser localStorage
- ✓ Server-side validation on all endpoints

---

## 📞 Support

Jika ada masalah:

1. **Check logs:**
   ```bash
   # Browser console (F12)
   console.log() output dari React app
   
   # Server logs
   npm run server (lihat output terminal)
   ```

2. **Check data:**
   ```bash
   curl https://localhost:9005/api/data/attendance -k | jq 'length'
   curl https://localhost:9005/api/data/students -k | jq 'length'
   ```

3. **Reset & retry:**
   ```bash
   # Clear IndexedDB (browser)
   # Settings → Clear Application Data
   
   # Atau restart dari scratch:
   rm server/data/*.json
   npm run server
   ```

---

## ✅ Selesai!

Setelah sinkronisasi berhasil, data akan:
- ✓ Tersimpan di Firebase Firestore
- ✓ Accessible via https://absensi-murid-268.web.app
- ✓ Backup tersimpan di server/data/
- ✓ History tercatat di Firebase audit logs

**Next Steps:**
1. Verifikasi data di Firebase Console
2. Test aplikasi dengan data yang sudah tersinkronisasi
3. Setup CI/CD untuk automated sync (optional)
4. Deploy ke production

---

**Generated:** 2026-08-29  
**Server:** localhost:9005 (online)  
**Firebase:** absensi-murid-268 (connected)  
**Status:** 🟢 Ready for sync
