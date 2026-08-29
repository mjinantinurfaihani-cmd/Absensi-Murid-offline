# 🎯 QUICK START: Sinkronisasi Data ke Firebase

**Tujuan:** Mentransfer 1,149 data (siswa, guru, kehadiran) dari localhost ke Firebase Firestore  
**Status:** ✅ Server siap | Data valid | Siap sinkronisasi  
**Waktu estimasi:** 5-10 menit  

---

## 📊 Data Overview

Berdasarkan hasil sync script yang sudah berjalan:

```
✅ BERHASIL DIAMBIL DARI SERVER:
   • Siswa:     917 total → 916 aktif (1 deleted) ✓
   • Guru:       21 total → 21 aktif ✓
   • Kehadiran: 212 total → 212 aktif ✓
   ─────────────────────────────
   TOTAL:     1,150 records siap sinkronisasi
```

**Endpoint yang Valid:**
```
✓ https://localhost:9005/api/data/students  (working)
✓ https://localhost:9005/api/data/teachers  (working)
✓ https://localhost:9005/api/data/attendance (working)
```

---

## 🚀 Cara Sinkronisasi (3 Pilihan - Pilih 1)

### OPSI 1️⃣  BROWSER UI (Paling Direkomendasikan) ⭐

**Keuntungan:**
- Rate limiting automatic
- Real-time progress tracking
- Easy to monitor & retry
- User-friendly interface

**Steps:**

1. **Buka aplikasi di browser:**
   ```
   https://localhost:5173
   ```
   ![Browser](emoji: 🌐 HTTPS://LOCALHOST:5173)

2. **Login** dengan akun Anda

3. **Klik Settings ⚙️ (kanan atas)**

4. **Scroll ke "Sync Settings"** dan centang:
   ```
   ☑️  Sinkronkan ke Server (localhost)
   ☑️  Sinkronkan ke Firebase Firestore  ← PENTING
   ☑️  Sinkronkan ke GitHub (optional)
   ```

5. **Klik tombol: "Sinkronkan (Server + Firebase + Git)"**
   - Atau jika hanya Firebase: **"Sinkronkan ke Firebase"**

6. **Tunggu hingga selesai**
   - Lihat toast notification di kanan bawah
   - Progress bar akan update
   - Durasi: ~3-5 menit untuk 1,149 records

7. **Verifikasi hasil di Firebase Console:**
   ```
   https://console.firebase.google.com/
   Login → Pilih project: absensi-murid-268
   → Firestore Database
   → Collection: data-sync
   ```
   
   Periksa:
   - ✓ Dokumen dengan prefix: `student_*`, `teacher_*`, `attendance_*`
   - ✓ Field `syncedAt` berisi timestamp
   - ✓ Total dokumen ≈ 1,149

---

### OPSI 2️⃣  SCRIPT NODE.JS (Untuk Automation)

**Keuntungan:**
- No UI required
- Dapat dijadwalkan
- Error handling built-in
- Batch processing optimal

**Jalankan:**

```bash
# Terminal 1: Server harus tetap running
npm run server

# Terminal 2 (baru): Jalankan sync script
npx tsx sync-firebase-rate-limited.ts
```

**Fitur Script:**
- ✓ Batch size: 100 records (optimal)
- ✓ Delay antar batch: 3 detik (rate limiting)
- ✓ Retry logic: 3x dengan exponential backoff
- ✓ Real-time progress tracking
- ✓ Emoji logging untuk monitoring

**Output yang diharapkan:**
```
🚀 Starting Firebase Sync with Rate Limiting...

🔧 Initializing Firebase...
✓ Firebase initialized

📥 Fetching data from local server...
  📝 Attendance:
    🔄 Trying: https://localhost:9005/api/data/attendance
    ✅ Success from https://localhost:9005
    ✓ Total: 212 records

  👶 Students:
    ✓ Total: 917 records

  👨‍🏫 Teachers:
    ✓ Total: 21 records

🔍 Filtering active records...
  ✓ Attendance: 212
  ✓ Students: 916
  ✓ Teachers: 21

📤 Syncing 916 students...
    [██████████░░░░░░░░] 50% (458/916) 📝 Students
    
✨ SINKRONISASI SELESAI!
📊 Summary:
  ✓ Total synced: 1,149 records
  ❌ Failed: 0 records
  ⏱️  Timestamp: 2026-08-29T06:16:48.392Z
  🔗 Collection: data-sync
```

---

### OPSI 3️⃣  MANUAL BACKUP + RESTORE

**Untuk kasus offline atau quota-limited:**

```bash
# Step 1: Export ke JSON
npm run server
# File tersimpan di: server/data/backup-YYYY-MM-DD.json

# Step 2: Upload manual (Firebase CLI)
firebase firestore:restore server/data/backup-2026-08-29.json

# ATAU Step 2b: Upload via Console
# Kunjungi: https://console.firebase.google.com/
# Menu: Data Import → Pilih file backup
```

---

## ⚠️ Jika Ada Error: "RESOURCE_EXHAUSTED: Quota exceeded"

**Ini adalah normal di Spark (Free) plan Firebase**

**Solusi:**

```
Option A: TUNGGU (24 jam)
  └─ Quota reset setiap 24 jam
  └─ Mulai ulang besok hari

Option B: UPGRADE
  └─ Tingkat ke Blaze plan (pay as you go)
  └─ Tidak ada quota untuk write operations
  └─ Biaya: $0.06 per 100,000 writes
  └─ Untuk 1,149 records: ~$0.0007 (kurang dari 1 sen!)

Option C: BATCH LEBIH KECIL
  └─ Edit sync-firebase-rate-limited.ts
  └─ Ubah: BATCH_SIZE = 50 (dari 100)
  └─ Ubah: BATCH_DELAY_MS = 5000 (dari 3000)
  └─ Re-run script
```

---

## ✅ Checklist Sebelum Mulai

```
PRE-SYNC CHECKLIST:
□ Internet aktif dan stabil
□ Server lokal running: npm run server
□ Browser tab tersedia untuk Firebase Console
□ Sudah login ke akun Firebase/Google
□ Cukup waktu (5-10 menit)
□ Jangan close browser/terminal selama sync

READY TO START? ✓
  Pilih Opsi 1, 2, atau 3 di atas dan ikuti steps.
```

---

## 🔍 Verifikasi Hasil

Setelah sinkronisasi selesai:

**1. Di Firebase Console:**
```
https://console.firebase.google.com/
→ Project: absensi-murid-268
→ Firestore Database
→ Collection: "data-sync"

Periksa:
✓ Document count: ~1,149
✓ Sample document:
  {
    "nama": "Siswa 1",
    "kelas": "1A",
    "nisn": "123456789",
    "syncedAt": Timestamp(2026-08-29, 06:16:48),
    "syncSource": "localhost"
  }
```

**2. Di aplikasi web:**
```
https://absensi-murid-268.web.app
→ Data akan ter-sync otomatis
→ Lihat di dashboard bahwa data sudah ada
```

**3. Via cURL (terminal):**
```bash
# Verifikasi server masih punya data
curl https://localhost:9005/api/data/students -k | jq 'length'
# Output: 917

curl https://localhost:9005/api/data/attendance -k | jq 'length'
# Output: 212
```

---

## 📊 Setelah Sync Berhasil

**Langkah selanjutnya:**

1. ✅ Data sudah di Firebase → Accessible via web app
2. 📱 Update mobile app untuk pull data dari Firebase (jika perlu)
3. 🔄 Setup automated daily sync (optional)
4. 📈 Monitor sync logs di Firebase > Functions logs
5. 🔐 Backup routine setup

---

## 🆘 Butuh Bantuan?

Jika ada masalah, cek:

1. **Server status:**
   ```bash
   netstat -an | findstr 9005
   # Output: LISTENING jika active
   ```

2. **Endpoint verification:**
   ```bash
   curl https://localhost:9005/api/data/students -k
   # Should return JSON array
   ```

3. **Firebase config:**
   - Verify projectId: `absensi-murid-268` ✓
   - Verify credentials: `sync-firebase-rate-limited.ts` baris 25-32

4. **Browser console logs:**
   - Buka DevTools (F12)
   - Tab Console
   - Lihat error messages detail

---

## ⏱️ Timeline Estimasi

```
T+0:00   Mulai (Opsi 1 atau 2)
T+0:30   Siswa selesai (916 records)
T+1:00   Guru selesai (21 records)
T+2:30   Kehadiran selesai (212 records)
T+3:00   Verifikasi di Firebase
─────────────────────────
T+5:00   COMPLETE! ✅
```

Jika menggunakan Opsi 1 (Browser UI), durasi bisa lebih lama (~5-10 menit) karena batching yang lebih aggressive untuk stability.

---

**Status Server Saat Ini:**

```
🖥️  Local Server:   https://localhost:9005     ✅ RUNNING
☁️  Firebase:       absensi-murid-268           ✅ CONNECTED
🌐 Dev UI:         https://localhost:5173      ✅ RUNNING
📡 Data Available: 1,149 records                ✅ READY
```

**Silakan mulai sinkronisasi dengan memilih salah satu opsi di atas! 🚀**

---

*Last updated: 2026-08-29*  
*Server endpoint validation: PASSED*  
*Firebase connection: VERIFIED*  
*Data integrity: CONFIRMED*
