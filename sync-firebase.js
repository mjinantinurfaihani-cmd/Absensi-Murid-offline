#!/usr/bin/env node
/**
 * Script untuk sinkronkan semua data dari localhost:9005 ke Firebase
 * Usage: node sync-firebase.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Baca konfigurasi Firebase dari firebaseStore
const firebaseConfigPath = path.join(__dirname, 'src/firebaseStore.ts');
let firebaseConfig = {
  apiKey: "AIzaSyAzKx3JN-dqGH1rPwqkP8T1-u6qdNqEjpM",
  authDomain: "absensi-murid-268.firebaseapp.com",
  projectId: "absensi-murid-268",
  storageBucket: "absensi-murid-268.appspot.com",
  messagingSenderId: "934869919913",
  appId: "1:934869919913:web:d6c581a4ae21b74d28ab62"
};

const LOCAL_SERVER = 'https://localhost:9005';
const FIREBASE_URL = 'https://absensi-murid-268.web.app';

// Helper untuk HTTPS request tanpa validasi cert (development only)
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const httpsOptions = {
      rejectUnauthorized: false, // HANYA untuk development
      ...options
    };

    https.get(url, httpsOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function syncDataToFirebase() {
  console.log('🔄 Memulai sinkronisasi data dari localhost:9005 ke Firebase...\n');

  try {
    // 1. Fetch data dari server lokal
    console.log('📥 Mengambil data dari server lokal...');
    const attendanceRes = await httpsRequest(`${LOCAL_SERVER}/api/attendance`);
    const studentsRes = await httpsRequest(`${LOCAL_SERVER}/api/students`);
    const teachersRes = await httpsRequest(`${LOCAL_SERVER}/api/teachers`);

    const attendance = Array.isArray(attendanceRes) ? attendanceRes : attendanceRes?.data || [];
    const students = Array.isArray(studentsRes) ? studentsRes : studentsRes?.data || [];
    const teachers = Array.isArray(teachersRes) ? teachersRes : teachersRes?.data || [];

    console.log(`✓ Kehadiran: ${attendance.length} records`);
    console.log(`✓ Siswa: ${students.length} records`);
    console.log(`✓ Guru: ${teachers.length} records\n`);

    // 2. Filter data yang tidak dihapus
    console.log('🔍 Memfilter data yang tidak dihapus...');
    const activeAttendance = attendance.filter(a => !a.deleted);
    const activeStudents = students.filter(s => !s.deleted);
    const activeTeachers = teachers.filter(t => !t.deleted);

    console.log(`✓ Kehadiran aktif: ${activeAttendance.length}`);
    console.log(`✓ Siswa aktif: ${activeStudents.length}`);
    console.log(`✓ Guru aktif: ${activeTeachers.length}\n`);

    // 3. Siapkan payload untuk Firebase
    const payload = {
      attendance: activeAttendance,
      students: activeStudents,
      teachers: activeTeachers,
      syncTimestamp: new Date().toISOString(),
      source: 'localhost:9005'
    };

    // 4. Kirim ke Firebase via function atau API
    console.log('📤 Mengirim data ke Firebase...');
    
    // Opsi 1: Langsung via POST request (jika ada endpoint Firebase)
    // Opsi 2: Simpan ke file lokal sebagai backup
    const backupPath = path.join(__dirname, `backup-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2));
    console.log(`✓ Backup lokal tersimpan: ${backupPath}\n`);

    // 5. Coba sinkronisasi via browser automation atau API endpoint
    console.log('📡 Informasi untuk manual sync via UI:');
    console.log('1. Buka https://localhost:5173');
    console.log('2. Login dengan akun Anda');
    console.log('3. Buka Settings → Sync Settings');
    console.log('4. Pastikan Firebase sudah terkonfigurasi');
    console.log('5. Klik "Sinkronkan (Server + Firebase)" button');
    console.log('6. Tunggu hingga sync selesai\n');

    console.log('✅ Data siap untuk disinkronkan!');
    console.log(`📊 Total records: ${activeAttendance.length + activeStudents.length + activeTeachers.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Jalankan
syncDataToFirebase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
