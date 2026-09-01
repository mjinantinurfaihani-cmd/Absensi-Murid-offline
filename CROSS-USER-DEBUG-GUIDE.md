# Cross-User Data Sync Debugging Guide

## Status Masalah
- ❌ Data guru yang ditambahkan akun A tidak muncul ketika akun B login di browser/device lain
- ✅ Build dan tests lokal pass (9/9)
- ✅ Sync logic verified, tetapi cross-user scenario belum ditest

## Hipotesis Penyebab
1. ❌ Publikasi ke Firestore gagal tanpa error handling
2. ❌ Hydration data dari Firestore tidak berjalan untuk user baru
3. ❌ Firebase authentication memblokir akses antar user
4. ❌ Data disimpan ke user-specific collection, bukan shared collection

## Langkah Debugging

### Fase 1: Setup Testing Environment
Siapkan 2 device/browser dengan akun Google berbeda:
- **Device A:** Browser dengan Google Account A
- **Device B:** Browser dengan Google Account B

### Fase 2: Publish Data & Monitor
1. **Di Device A (Account A):**
   - Buka https://127.0.0.1:9005/ atau https://absensi-murid-268.web.app/
   - Buka DevTools > Console
   - Jalankan: `debugTeacherSync()`
   - Catat output (harus ada 0 teacher jika baru)

2. **Tambah Guru Test:**
   - Klik Tab Guru
   - Tambah guru baru: "Guru Test A", NIK "123456", Role "Guru"
   - Monitor console di DevTools:
     ```
     [Firebase] Publishing teacher: Guru Test A (123456)
     [Firebase] Teacher published successfully: <id>
     ```
   - Jika ERROR, itu adalah masalah publikasi

3. **Verifikasi Publikasi:**
   - Jalankan di console: `debugTeacherSync()`
   - Output harus menunjukkan:
     ```
     📱 Local IndexedDB:
     ✅ SYNCED | Guru Test A (123456)
     
     ☁️ Firebase Firestore:
     (table harus ada row yang sama)
     ```
   - Jika Firestore kosong → masalah publikasi
   - Jika ada di Firestore → lanjut ke Fase 3

### Fase 3: Test Cross-Account Access
1. **Di Device B (Account B):**
   - Buka app (di browser/device terpisah dengan akun berbeda)
   - Monitor console, seharusnya lihat:
     ```
     [Hydrate] Local: 0 teachers, 0 students
     [Hydrate] Cloud: 1 teachers, 0 students
     [Hydrate] Merging cloud data into local...
     [Hydrate] Merge complete
     ```
   - Jika tidak ada log ini → hydration tidak berjalan
   - Jika ada error → masalah akses Firebase

2. **Verifikasi Data:**
   - Jalankan: `debugTeacherSync()`
   - Harus menunjukkan: "Guru Test A" di Local IndexedDB
   - Jika tidak ada → masalah merge atau akses Firestore

### Fase 4: Diagnostik Berdasarkan Hasil

#### ✅ Skenario Sukses (Data muncul di Device B)
- Lanjutkan testing dengan multiple account/device
- Run full sync test dengan beberapa guru
- Tanda: Masalah sudah fixed, ready untuk production

#### ❌ Skenario Publikasi Gagal (Console error saat publish)
- Lihat error message di console
- Kemungkinan:
  - Firebase credentials invalid
  - Firestore rules blocking write
  - Network/CORS issue
- Solusi: Check browser console error + Firestore console untuk permission denied

#### ❌ Skenario Hydration Gagal (Tidak ada log [Hydrate])
- Hydration mungkin timeout atau error
- Lihat console untuk "Firebase publik tidak tersedia"
- Kemungkinan:
  - loadPublicData() throw error
  - Timeout 8 detik
  - Firebase credentials issue
- Solusi: Add manual retry dengan: `debugManualPublish('123456')`

#### ❌ Skenario Access Denied (Firestore permission error)
- Error di publishTeacher atau loadPublicData
- Kemungkinan: Firestore rules tidak allow public read/write
- Solusi: 
  1. Check Firestore rules: `allow read: if true;` dan `allow write: if true;`
  2. Test di Firestore console: dapat baca collection 'teachers'?

### Fase 5: Collect Evidence
Jika masalah terjadi, kumpulkan:
1. **Console logs** (copy-paste dari DevTools Console)
2. **Firestore data** (buka Firestore console, check collection 'teachers')
3. **Network tab** (check fetch ke Firestore, response status)
4. **IndexedDB data** (DevTools > Application > IndexedDB > absensi-siswa-offline)

## Quick Test Commands

### Di browser console:
```javascript
// Lihat semua guru di local + cloud
debugTeacherSync()

// Publish guru tertentu (by NIK)
debugManualPublish('123456')

// Check local data saja
db.teachers.toArray().then(t => console.table(t))

// Check Firestore directly
loadPublicData().then(d => console.table(d.teachers))
```

## Expected Timeline
- **Fase 1-2:** 5-10 menit (setup + add guru)
- **Fase 3:** 2-5 menit (login akun B + check data)
- **Fase 4:** 5-10 menit (diagnostik)
- **Fase 5:** 5 menit (collect evidence)

**Total: 20-30 menit untuk full test cycle**

## Next Action
1. Jalankan Fase 1-3 dengan 2 akun/device
2. Kumpulkan evidence dari console + Firestore console
3. Lapor hasil:
   - Guru muncul di Device B? (YES/NO)
   - Ada error di console? (copy-paste message)
   - Data ada di Firestore? (screenshot dari console.firebase.google.com)

## Files Modified
- `src/debugPersistence.ts` - Debug tools (NEW)
- `src/firebaseStore.ts` - Added logging
- `src/main.tsx` - Added logging to hydration
- `src/App.tsx` - Expose debug tools to window
