import { initializeApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, limit, query, setDoc, where } from 'firebase/firestore';
import type { Attendance, Student, Teacher } from './types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCLxH3R9QUXkPs_lJoZjCsjBxMRgGnVH9I',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'absensi-murid-268.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'absensi-murid-268',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'absensi-murid-268.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '81051053083',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:81051053083:web:f6a1c4803ad7b715e1dcbe',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-BZTD8QK8HB'
};

const app = initializeApp(firebaseConfig);

const firestore = getFirestore(app);
let applyingCloudData = false;

type FirestoreRecord = Record<string, unknown>;

function normalizeRole(value: unknown): Teacher['role'] {
  return value === 'guru bidang' || value === 'guru' || value === 'admin' ? value : 'guru';
}

function normalizeStudent(raw: FirestoreRecord): Student {
  return {
    id: String(raw.id ?? raw.studentId ?? crypto.randomUUID()),
    nisn: String(raw.nisn ?? ''),
    nama: String(raw.nama ?? raw.namaLengkap ?? 'Tanpa Nama'),
    kelas: String(raw.kelas ?? ''),
    kontak: String(raw.kontak ?? ''),
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : undefined,
    deleted: Boolean(raw.deleted ?? false),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    synced: Number(raw.synced ?? 1)
  };
}

function normalizeTeacher(raw: FirestoreRecord): Teacher {
  return {
    id: String(raw.id ?? raw.teacherId ?? crypto.randomUUID()),
    nama: String(raw.nama ?? raw.namaLengkap ?? 'Tanpa Nama'),
    nik: String(raw.nik ?? ''),
    role: normalizeRole(raw.role),
    kelas: String(raw.kelas ?? 'SEMUA'),
    password: String(raw.password ?? ''),
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : undefined,
    deleted: Boolean(raw.deleted ?? false),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    synced: Number(raw.synced ?? 1)
  };
}

export function isApplyingCloudData() {
  return applyingCloudData;
}

export async function applyCloudData<T>(operation: () => Promise<T>) {
  applyingCloudData = true;
  try {
    return await operation();
  } finally {
    applyingCloudData = false;
  }
}

export async function loadPublicData() {
  try {
    const [studentSnapshot, teacherSnapshot] = await Promise.all([
      getDocs(collection(firestore, 'students')),
      getDocs(collection(firestore, 'teachers'))
    ]);
    const result = {
      students: studentSnapshot.docs.map(snapshot => normalizeStudent(snapshot.data() as FirestoreRecord)),
      teachers: teacherSnapshot.docs.map(snapshot => normalizeTeacher(snapshot.data() as FirestoreRecord))
    };
    if (import.meta.env.DEV) {
      console.log(`[Firebase] Loaded ${result.teachers.length} teachers, ${result.students.length} students`);
    }
    return result;
  } catch (error) {
    console.error('[Firebase] loadPublicData error:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function loadAllPublicData() {
  const [students, teachers, attendance] = await Promise.all([
    getDocs(collection(firestore, 'students')),
    getDocs(collection(firestore, 'teachers')),
    getDocs(collection(firestore, 'attendance'))
  ]);
  return {
    students: students.docs.map(snapshot => normalizeStudent(snapshot.data() as FirestoreRecord)),
    teachers: teachers.docs.map(snapshot => normalizeTeacher(snapshot.data() as FirestoreRecord)),
    attendance: attendance.docs.map(snapshot => snapshot.data() as Attendance)
  };
}

export async function fetchTeacherByNik(nik: string): Promise<Teacher | null> {
  const snapshot = await getDocs(query(collection(firestore, 'teachers'), where('nik', '==', nik), limit(1)));
  if (snapshot.empty) return null;
  return normalizeTeacher(snapshot.docs[0].data() as FirestoreRecord);
}

export async function publishStudent(student: Student) {
  try {
    const normalized = normalizeStudent(student as unknown as FirestoreRecord);
    if (normalized.deleted === true || normalized.deleted === 1) {
      await deleteDoc(doc(firestore, 'students', normalized.id));
      if (import.meta.env.DEV) {
        console.log(`[Firebase] Student deleted from cloud: ${normalized.id}`);
      }
      return;
    }
    if (import.meta.env.DEV) {
      console.log(`[Firebase] Publishing student: ${normalized.nama} (${normalized.nisn})`);
    }
    await setDoc(doc(firestore, 'students', normalized.id), normalized);
    if (import.meta.env.DEV) {
      console.log(`[Firebase] Student published successfully: ${normalized.id}`);
    }
  } catch (error) {
    console.error('[Firebase] publishStudent failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function publishTeacher(teacher: Teacher) {
  try {
    const normalized = normalizeTeacher(teacher as unknown as FirestoreRecord);
    if (normalized.deleted === true || normalized.deleted === 1) {
      await deleteDoc(doc(firestore, 'teachers', normalized.id));
      if (import.meta.env.DEV) {
        console.log(`[Firebase] Teacher deleted from cloud: ${normalized.id}`);
      }
      return;
    }
    if (import.meta.env.DEV) {
      console.log(`[Firebase] Publishing teacher: ${normalized.nama} (${normalized.nik})`);
    }
    await setDoc(doc(firestore, 'teachers', normalized.id), normalized);
    if (import.meta.env.DEV) {
      console.log(`[Firebase] Teacher published successfully: ${normalized.id}`);
    }
  } catch (error) {
    console.error('[Firebase] publishTeacher failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}

export async function removePublicStudent(id: string) {
  await deleteDoc(doc(firestore, 'students', id));
}

export async function removePublicTeacher(id: string) {
  await deleteDoc(doc(firestore, 'teachers', id));
}

export async function publishInitialData(students: Student[], teachers: Teacher[]) {
  await Promise.all([
    ...students.map(publishStudent),
    ...teachers.map(publishTeacher)
  ]);
}

export async function publishAllData(students: Student[], teachers: Teacher[], attendance: Attendance[]) {
  await Promise.all([
    ...students.map(publishStudent),
    ...teachers.map(publishTeacher),
    ...attendance.map(record => setDoc(doc(firestore, 'attendance', record.id), record))
  ]);
}

export function subscribePublicData(onData: (kind: 'students' | 'teachers', data: (Student | Teacher)[]) => void) {
  let stopped = false;
  let timer: number | undefined;
  const poll = async () => {
    if (stopped || !navigator.onLine || document.visibilityState === 'hidden') return;
    try {
      const data = await loadPublicData();
      onData('students', data.students);
      onData('teachers', data.teachers);
    } catch (error) {
      const details = error as Error & { code?: string };
      console.warn('Sinkronisasi Firebase ditunda', { code: details.code, message: details.message });
      if (details.code === 'resource-exhausted') stopped = true;
    }
  };
  timer = window.setInterval(() => void poll(), 300000);
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
  };
}
