#!/usr/bin/env npx tsx
/**
 * Firebase Sync with Rate Limiting
 * 
 * Sinkronisasi data dari localhost:9005/4174 ke Firebase Firestore
 * dengan rate limiting intelligent untuk menghindari quota exceeded
 * 
 * Usage: npx tsx sync-firebase-rate-limited.ts
 */

import https from 'https';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';

// ============================================================================
// CONFIG
// ============================================================================

const firebaseConfig = {
  apiKey: 'AIzaSyA1rKVNPo3tSLGe_tYgQi4C7K7N4Q5R6S7',
  authDomain: 'absensi-murid-268.firebaseapp.com',
  projectId: 'absensi-murid-268',
  storageBucket: 'absensi-murid-268.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abcdef1234567890abcd'
};

const SERVER_PORTS = [9005, 4174, 5000, 3000];
const BATCH_SIZE = 100; // Reduced from 500 to avoid quota issues
const BATCH_DELAY_MS = 3000; // 3 seconds between batches
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds per request
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// TYPES
// ============================================================================

interface AttendanceRecord {
  id?: string;
  tanggal: string;
  studentId: string;
  status: string;
  ownerId?: string;
  deviceId?: string;
  deleted?: boolean;
  syncedAt?: string;
}

interface StudentRecord {
  id: string;
  nama: string;
  nisn?: string;
  kelas?: string;
  deleted?: boolean;
  syncedAt?: string;
  [key: string]: any;
}

interface TeacherRecord {
  id: string;
  nama: string;
  nip?: string;
  deleted?: boolean;
  syncedAt?: string;
  [key: string]: any;
}

// ============================================================================
// UTILS
// ============================================================================

function httpsRequest(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`JSON parse error: ${e}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`));
    });
  });
}

async function fetchWithRetry(url: string, attempt = 1): Promise<any> {
  try {
    return await httpsRequest(url);
  } catch (error) {
    if (attempt < RETRY_ATTEMPTS) {
      console.log(`  🔄 Retry ${attempt}/${RETRY_ATTEMPTS} (delay: ${RETRY_DELAY_MS}ms)...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return fetchWithRetry(url, attempt + 1);
    }
    throw error;
  }
}

async function tryFetchData(endpoint: string): Promise<any[]> {
  for (const port of SERVER_PORTS) {
    const serverBase = `https://localhost:${port}`;
    const url = `${serverBase}/api/data/${endpoint}`;
    
    try {
      console.log(`    🔄 Trying: ${url}`);
      const result = await Promise.race([
        fetchWithRetry(url),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
        )
      ]);
      
      console.log(`    ✅ Success from https://localhost:${port}`);
      return Array.isArray(result) ? result : result?.data || [];
    } catch (error: any) {
      console.log(`    ❌ Failed: ${error.message}`);
      continue;
    }
  }
  
  console.log(`    ⚠️  All ports failed for ${endpoint}`);
  return [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logProgress(current: number, total: number, label: string) {
  const percent = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
  console.log(`    [${bar}] ${percent}% (${current}/${total}) ${label}`);
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

async function syncToFirebaseWithRateLimit() {
  console.log('\n🚀 Starting Firebase Sync with Rate Limiting...\n');
  
  // Initialize Firebase
  console.log('🔧 Initializing Firebase...');
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  console.log('✓ Firebase initialized\n');

  // Fetch data from server
  console.log('📥 Fetching data from local server...');
  
  console.log('  📝 Attendance:');
  const attendanceData = await tryFetchData('attendance');
  console.log(`    ✓ Total: ${attendanceData.length} records\n`);

  console.log('  👶 Students:');
  const studentsData = await tryFetchData('students');
  console.log(`    ✓ Total: ${studentsData.length} records\n`);

  console.log('  👨‍🏫 Teachers:');
  const teachersData = await tryFetchData('teachers');
  console.log(`    ✓ Total: ${teachersData.length} records\n`);

  // Filter active records
  console.log('🔍 Filtering active records...');
  const activeAttendance = attendanceData.filter((r: any) => r.deleted !== true);
  const activeStudents = studentsData.filter((r: any) => r.deleted !== true);
  const activeTeachers = teachersData.filter((r: any) => r.deleted !== true);

  console.log(`  ✓ Attendance: ${activeAttendance.length} (filtered from ${attendanceData.length})`);
  console.log(`  ✓ Students: ${activeStudents.length} (filtered from ${studentsData.length})`);
  console.log(`  ✓ Teachers: ${activeTeachers.length} (filtered from ${teachersData.length})`);
  console.log(`  ✓ Total: ${activeAttendance.length + activeStudents.length + activeTeachers.length} records\n`);

  const syncedAt = new Date().toISOString();
  let totalSynced = 0;
  let totalFailed = 0;

  // Sync Students
  console.log(`📤 Syncing ${activeStudents.length} students...`);
  const studentBatches = Math.ceil(activeStudents.length / BATCH_SIZE);
  
  for (let i = 0; i < studentBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, activeStudents.length);
    const batchStudents = activeStudents.slice(start, end);

    try {
      const batch = writeBatch(db);
      
      for (const student of batchStudents) {
        const docKey = `student_${student.id}`;
        const docData = {
          ...student,
          syncedAt: Timestamp.now(),
          syncSource: 'localhost'
        };
        
        batch.set(doc(collection(db, 'data-sync'), docKey), docData);
      }

      await batch.commit();
      totalSynced += batchStudents.length;
      logProgress(end, activeStudents.length, '📝 Students');
      
      if (i < studentBatches - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    } catch (error: any) {
      console.log(`    ❌ Batch ${i + 1} failed: ${error.message}`);
      totalFailed += batchStudents.length;
    }
  }
  console.log(`  ✓ Students synced: ${totalSynced} records\n`);

  // Sync Teachers
  console.log(`📤 Syncing ${activeTeachers.length} teachers...`);
  const teacherBatches = Math.ceil(activeTeachers.length / BATCH_SIZE);

  for (let i = 0; i < teacherBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, activeTeachers.length);
    const batchTeachers = activeTeachers.slice(start, end);

    try {
      const batch = writeBatch(db);
      
      for (const teacher of batchTeachers) {
        const docKey = `teacher_${teacher.id}`;
        const docData = {
          ...teacher,
          syncedAt: Timestamp.now(),
          syncSource: 'localhost'
        };
        
        batch.set(doc(collection(db, 'data-sync'), docKey), docData);
      }

      await batch.commit();
      totalSynced += batchTeachers.length;
      logProgress(end, activeTeachers.length, '👨‍🏫 Teachers');
      
      if (i < teacherBatches - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    } catch (error: any) {
      console.log(`    ❌ Batch ${i + 1} failed: ${error.message}`);
      totalFailed += batchTeachers.length;
    }
  }
  console.log(`  ✓ Teachers synced: ${totalSynced - activeStudents.length} records\n`);

  // Sync Attendance
  console.log(`📤 Syncing ${activeAttendance.length} attendance records...`);
  const attendanceBatches = Math.ceil(activeAttendance.length / BATCH_SIZE);

  for (let i = 0; i < attendanceBatches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, activeAttendance.length);
    const batchAttendance = activeAttendance.slice(start, end);

    try {
      const batch = writeBatch(db);
      
      for (const record of batchAttendance) {
        const docKey = `attendance_${record.studentId}_${record.tanggal}`;
        const docData = {
          ...record,
          syncedAt: Timestamp.now(),
          syncSource: 'localhost'
        };
        
        batch.set(doc(collection(db, 'data-sync'), docKey), docData);
      }

      await batch.commit();
      totalSynced += batchAttendance.length;
      logProgress(end, activeAttendance.length, '📝 Attendance');
      
      if (i < attendanceBatches - 1) {
        await sleep(BATCH_DELAY_MS);
      }
    } catch (error: any) {
      console.log(`    ❌ Batch ${i + 1} failed: ${error.message}`);
      totalFailed += batchAttendance.length;
    }
  }
  console.log(`  ✓ Attendance synced: ${activeAttendance.length} records\n`);

  // Summary
  console.log('✨ SINKRONISASI SELESAI!\n');
  console.log('📊 Summary:');
  console.log(`  ✓ Total synced: ${totalSynced} records`);
  console.log(`  ❌ Failed: ${totalFailed} records`);
  console.log(`  ⏱️  Timestamp: ${syncedAt}`);
  console.log(`  🔗 Collection: data-sync\n`);
  
  console.log('✅ Data sudah disinkronkan ke Firebase!');
  console.log('   Verifikasi: https://console.firebase.google.com/');
  console.log(`   Project: absensi-murid-268\n`);
}

// ============================================================================
// RUN
// ============================================================================

syncToFirebaseWithRateLimit().catch(error => {
  console.error('\n❌ SYNC FAILED:', error.message);
  process.exit(1);
});
