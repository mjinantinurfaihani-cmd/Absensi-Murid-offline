# Phase 3E: Cross-User Data Synchronization - Testing & Deployment

## 🎯 Objective
Memverifikasi dan memperbaiki masalah cross-user data synchronization — guru yang ditambahkan akun A harus muncul ketika akun B login di browser/device lain.

## 📋 Status
- ✅ Build successful (0 errors, 518 modules)
- ✅ Debug tools added untuk monitoring
- ✅ Logging enhanced di Firebase publish/load
- ⏳ Cross-user testing pending

## 🚀 Quick Start

### 1. Build Aplikasi
```bash
npm run build
```
Expected output:
```
✓ built in 765ms
dist/index.html 0.88 kB
dist/assets/index-D4xJkWEG.css 35.55 kB
dist/assets/index.es-fsBb0ljT.js 151.40 kB
dist/assets/index-BKrUvdui.js 2,164.16 kB
```

### 2. Run Lokal dengan HTTPS
```bash
# Terminal 1: Start HTTPS server
node server/https.mjs

# Expected: 
# 🔐 HTTPS server on https://127.0.0.1:9005
# 📁 Serving dist/index.html
```

### 3. Testing Cross-User Sync

#### Setup: Siapkan 2 Browser/Device
- **Device A:** Chrome/Safari/Firefox dengan Google Account A
- **Device B:** Chrome/Safari/Firefox dengan Google Account B (atau incognito/private)

#### Step 1: Add Guru di Device A
1. Buka: https://127.0.0.1:9005
2. Accept certificate warning (self-signed)
3. Open DevTools (F12 atau Right-click > Inspect)
4. Go to Console tab
5. Jalankan: `debugTeacherSync()`
   - Catat jumlah guru di Local + Cloud
6. Tambah guru baru:
   - Tab "Guru" > Form
   - Nama: "Guru Debug 1"
   - NIK: "999001"
   - Role: "Guru"
   - Kelas: "12A"
   - Klik "Simpan"
7. Monitor console, harus ada log:
   ```
   [Firebase] Publishing teacher: Guru Debug 1 (999001)
   [Firebase] Teacher published successfully: <id>
   ```
8. Jalankan: `debugTeacherSync()` lagi
   - Harus ada guru "Guru Debug 1" di Local ✅
   - Harus ada guru "Guru Debug 1" di Cloud (Firestore) ✅

#### Step 2: Verify di Firestore Console
1. Buka: https://console.firebase.google.com
2. Project: "absensi-murid-268"
3. Firestore Database > Collection "teachers"
4. Harus ada document dengan nama "Guru Debug 1"

#### Step 3: Check di Device B
1. Buka: https://127.0.0.1:9005 (device/browser terpisah)
2. Accept certificate warning
3. Open DevTools > Console
4. Monitor logs saat page load, harus ada:
   ```
   [Hydrate] Local: 0 teachers, 0 students
   [Hydrate] Cloud: <n> teachers, 0 students
   [Hydrate] Merging cloud data into local...
   [Hydrate] Merge complete
   ```
   - Jika ada timeout error → masalah Firestore access
   
5. Jalankan: `debugTeacherSync()`
   - Harus ada "Guru Debug 1" di Local IndexedDB ✅
   - Status harus "✅ SYNCED"

### 4. Result Interpretation

#### ✅ SUCCESS: Guru muncul di Device B
```
Status: SYNCED | Guru Debug 1 (999001) ✅
Local IndexedDB: 1 teacher
Cloud Firestore: 1 teacher
```
→ Cross-user sync working! Ready for deployment.

#### ❌ FAILURE: Guru tidak muncul di Device B
Collect evidence:
1. **Check Firestore:**
   - https://console.firebase.google.com
   - Project > Firestore > teachers collection
   - Tanya: Guru ada di sini? (YES/NO)

2. **Check Local:**
   - Device B console: `db.teachers.toArray().then(t => console.table(t))`
   - Tanya: Guru ada di sini? (YES/NO)

3. **Check Cloud Loading:**
   - Device B console: `loadPublicData().then(d => console.log('Teachers:', d.teachers.length))`
   - Tanya: Berapa teachers? (jika 0 = masalah loading)

4. **Check Errors:**
   - Lihat full console output
   - Ada error merah? Copy message

## 📊 Test Matrix

| Device A                         | Device B                         | Expected       | Status |
|----------------------------------|----------------------------------|----------------|--------|
| Add Guru Debug 1                 | Same Account, Refresh            | Guru appears   | ⏳     |
| Publish Guru Debug 1             | Different Account, Refresh       | Guru appears   | ⏳     |
| Guru Debug 1 in Firestore        | Load from Cloud                  | Data syncs     | ⏳     |
| Multiple Gurus                   | Cross-device merge               | All appear     | ⏳     |
| Edit Guru Debug 1                | Cross-device timestamp merge     | Newer wins     | ✅     |
| Delete Guru Debug 1              | Cross-device soft-delete respect | Deleted=1      | ✅     |

## 🔍 Debugging Flowchart

```
App starts (Device B)
    ↓
hydratePublicData() called
    ↓
loadPublicData() from Firestore?
    ├─ YES (data loaded)
    │  ↓
    │  mergePublicTable() to local
    │  ↓
    │  ✅ Guru appears in Local IndexedDB
    │
    └─ NO (empty or error)
       ↓
       ❌ publishInitialData() (local-only)
       ↓
       Guru tidak tersedia di Device B
```

## 🛠️ Troubleshooting

### Error: "Firebase publik tidak tersedia"
- **Cause:** loadPublicData() timeout atau error
- **Fix:**
  1. Check network tab di DevTools
  2. Are requests to Firestore getting 403? → permission issue
  3. Are requests timing out (>8s)? → network issue
  4. Try: `loadPublicData()` di console, copy error message

### Error: "PublishTeacher failed"
- **Cause:** setDoc() ke Firestore gagal
- **Check:**
  1. Firestore rules `allow write`?
  2. Firebase credentials valid?
  3. Network working?

### Guru ada di Firestore tapi tidak di Local (Device B)
- **Cause:** mergePublicTable() mungkin tidak berjalan
- **Check:**
  1. applyCloudData() flag correct?
  2. mergePublicTable() logic correct?
  3. Try manual: `debugManualPublish('999001')`

## 📝 Evidence Collection Template

```
# Cross-User Sync Test Results

## Device A (Account A) - Add Guru
- [ ] Guru added: Guru Debug 1 (999001)
- [ ] Console log shown (Publishing...)
- [ ] debugTeacherSync() confirms guru in Cloud

## Device A - Firestore Verification
- [ ] Guru "Guru Debug 1" exists in Firestore
- [ ] Document shows id, nama, nik, updatedAt
- [ ] Screenshot: [paste Firestore console]

## Device B (Account B) - Load Data
- [ ] Page opened (different Google account)
- [ ] Console logs show hydration attempt
- [ ] Logs show: "Cloud: X teachers loaded"

## Device B - Data Verification
- [ ] debugTeacherSync() shows Guru Debug 1 in Local
- [ ] Status: SYNCED ✅
- [ ] Device can use guru data without issues

## Outcome
- [ ] ✅ SUCCESS: Cross-user sync working
- [ ] ❌ FAILURE: [describe issue]
- [ ] 🔧 PARTIAL: [describe limitation]
```

## 🚀 Deployment

### Prerequisites
- ✅ npm run build succeeds
- ✅ Cross-user testing passed (or known issues documented)
- ✅ Firestore rules updated
- ✅ GitHub repository synced

### Step 1: Sync to GitHub
```bash
git add -A
git commit -m "Phase 3E: Cross-user sync debugging tools"
git push origin main
```

### Step 2: Deploy to Firebase Hosting
```bash
firebase deploy --only hosting
```

Expected:
```
✔  Deploy complete!
Project Console: https://console.firebase.google.com/project/absensi-murid-268
Hosting URL: https://absensi-murid-268.web.app
```

### Step 3: Verify Deployment
1. Open: https://absensi-murid-268.web.app
2. Accept any SSL warning
3. Open console (F12)
4. Run: `debugTeacherSync()`
5. Should show cloud data from Firestore

### Step 4: Test Cross-User on Production
- Repeat testing steps but use production URL instead of https://127.0.0.1:9005

## 📦 Files Changed
- `src/debugPersistence.ts` - NEW: Debug tools for sync monitoring
- `src/firebaseStore.ts` - Enhanced: Added logging to publish/load
- `src/main.tsx` - Enhanced: Added logging to hydration
- `src/App.tsx` - Enhanced: Expose debug tools to window
- `dist/` - Rebuilt with new code

## ⏭️ Next Steps
1. Complete cross-user testing
2. Document results in EVIDENCE collection
3. If successful: Deploy to production
4. If issues found: Debug using flowchart + troubleshooting guide
5. Phase 4: Add Firebase Authentication (for user-specific features)

## 📚 Related Documentation
- [CROSS-USER-DEBUG-GUIDE.md](CROSS-USER-DEBUG-GUIDE.md) - Detailed debugging procedures
- [PHASE-3D-COMPLETION.md](PHASE-3D-COMPLETION.md) - Previous phase status
- [PROJECT-COMPLETION-SUMMARY.md](PROJECT-COMPLETION-SUMMARY.md) - Overall project status

---

**Last Updated:** 2025-09-01  
**Status:** Ready for Testing  
**Owner:** Phase 3E Team
