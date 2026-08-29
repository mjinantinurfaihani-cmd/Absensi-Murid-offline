import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, writeBatch } from 'firebase/firestore';
import https from 'https';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAzKx3JN-dqGH1rPwqkP8T1-u6qdNqEjpM",
  authDomain: "absensi-murid-268.firebaseapp.com",
  projectId: "absensi-murid-268",
  storageBucket: "absensi-murid-268.appspot.com",
  messagingSenderId: "934869919913",
  appId: "1:934869919913:web:d6c581a4ae21b74d28ab62"
};

// Coba multiple ports untuk server lokal
const SERVER_PORTS = [9005, 4174, 5000, 3000];
const LOCAL_SERVERS = SERVER_PORTS.map(port => `https://localhost:${port}`);
const BATCH_SIZE = 500; // Firebase batch write limit

interface AttendanceRecord {
  id?: string;
  studentId: string;
  tanggal: string;
  status: string;
  ownerId?: string;
  deviceId?: string;
  deleted?: boolean;
  [key: string]: any;
}

interface StudentRecord {
  id?: string;
  nama: string;
  nisn: string;
  kelas: string;
  deleted?: boolean;
  [key: string]: any;
}

interface TeacherRecord {
  id?: string;
  nama: string;
  deleted?: boolean;
  [key: string]: any;
}

// Helper untuk HTTPS request
async function httpsRequest(url: string, options: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const httpsOptions = {
      rejectUnauthorized: false, // HANYA untuk development
      ...options
    };

    https.get(url, httpsOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
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

async function syncToFirebase() {
  console.log('🚀 Memulai sinkronisasi data ke Firebase...\n');
  
  try {
    // 1. Initialize Firebase
    console.log('🔧 Inisialisasi Firebase...');
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    console.log('✓ Firebase initialized\n');

    // 2. Fetch data dari server lokal
    console.log('📥 Mengambil data dari localhost:9005...');
    let attendanceData: AttendanceRecord[] = [];
    let studentsData: StudentRecord[] = [];
    let teachersData: TeacherRecord[] = [];

    try {
      const attendanceRes = await httpsRequest(`${LOCAL_SERVER}/api/attendance`);
      attendanceData = Array.isArray(attendanceRes) ? attendanceRes : attendanceRes?.data || [];
      console.log(`  ✓ Kehadiran: ${attendanceData.length} records`);
    } catch (e) {
      console.log('  ⚠ Tidak bisa fetch attendance:', (e as Error).message);
    }

    try {
      const studentsRes = await httpsRequest(`${LOCAL_SERVER}/api/students`);
      studentsData = Array.isArray(studentsRes) ? studentsRes : studentsRes?.data || [];
      console.log(`  ✓ Siswa: ${studentsData.length} records`);
    } catch (e) {
      console.log('  ⚠ Tidak bisa fetch students:', (e as Error).message);
    }

    try {
      const teachersRes = await httpsRequest(`${LOCAL_SERVER}/api/teachers`);
      teachersData = Array.isArray(teachersRes) ? teachersRes : teachersRes?.data || [];
      console.log(`  ✓ Guru: ${teachersData.length} records`);
    } catch (e) {
      console.log('  ⚠ Tidak bisa fetch teachers:', (e as Error).message);
    }

    // 3. Filter data yang tidak dihapus
    console.log('\n🔍 Memfilter data aktif...');
    const activeAttendance = attendanceData.filter(a => !a.deleted);
    const activeStudents = studentsData.filter(s => !s.deleted);
    const activeTeachers = teachersData.filter(t => !t.deleted);

    console.log(`  ✓ Kehadiran aktif: ${activeAttendance.length}`);
    console.log(`  ✓ Siswa aktif: ${activeStudents.length}`);
    console.log(`  ✓ Guru aktif: ${activeTeachers.length}`);

    // 4. Sync ke Firestore dengan batching
    console.log('\n📤 Mengirim data ke Firebase Firestore...\n');

    // Sync Students
    if (activeStudents.length > 0) {
      console.log(`  📝 Sinkronisasi ${activeStudents.length} siswa...`);
      for (let i = 0; i < activeStudents.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = activeStudents.slice(i, i + BATCH_SIZE);
        
        for (const student of chunk) {
          const docRef = doc(collection(db, 'data-sync'), `student_${student.id}`);
          batch.set(docRef, {
            type: 'student',
            id: student.id,
            ...student,
            syncedAt: new Date().toISOString()
          });
        }
        
        await batch.commit();
        console.log(`    ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} records)`);
      }
      console.log(`  ✅ Siswa selesai\n`);
    }

    // Sync Teachers
    if (activeTeachers.length > 0) {
      console.log(`  👨‍🏫 Sinkronisasi ${activeTeachers.length} guru...`);
      for (let i = 0; i < activeTeachers.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = activeTeachers.slice(i, i + BATCH_SIZE);
        
        for (const teacher of chunk) {
          const docRef = doc(collection(db, 'data-sync'), `teacher_${teacher.id}`);
          batch.set(docRef, {
            type: 'teacher',
            id: teacher.id,
            ...teacher,
            syncedAt: new Date().toISOString()
          });
        }
        
        await batch.commit();
        console.log(`    ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} records)`);
      }
      console.log(`  ✅ Guru selesai\n`);
    }

    // Sync Attendance (largest dataset)
    if (activeAttendance.length > 0) {
      console.log(`  📅 Sinkronisasi ${activeAttendance.length} records kehadiran...`);
      for (let i = 0; i < activeAttendance.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = activeAttendance.slice(i, i + BATCH_SIZE);
        
        for (const attendance of chunk) {
          const key = `${attendance.studentId}_${attendance.tanggal}`;
          const docRef = doc(collection(db, 'data-sync'), `attendance_${key}`);
          batch.set(docRef, {
            type: 'attendance',
            ...attendance,
            syncedAt: new Date().toISOString()
          });
        }
        
        await batch.commit();
        console.log(`    ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} records)`);
      }
      console.log(`  ✅ Kehadiran selesai\n`);
    }

    // 5. Summary
    const totalRecords = activeAttendance.length + activeStudents.length + activeTeachers.length;
    console.log('═'.repeat(60));
    console.log('✅ SINKRONISASI SELESAI!');
    console.log('═'.repeat(60));
    console.log(`📊 Total records: ${totalRecords}`);
    console.log(`  • Kehadiran: ${activeAttendance.length}`);
    console.log(`  • Siswa: ${activeStudents.length}`);
    console.log(`  • Guru: ${activeTeachers.length}`);
    console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
    console.log(`📍 Lokasi: Firebase (absensi-murid-268)`);
    console.log(`📍 Collection: data-sync`);
    console.log('═'.repeat(60));
    console.log('\n✨ Data sudah tersinkronisasi dengan Firebase!');
    console.log('   Akses via: https://absensi-murid-268.web.app');

  } catch (error) {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run
syncToFirebase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
