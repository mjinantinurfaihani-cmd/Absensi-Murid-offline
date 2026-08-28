import { initializeApp } from 'firebase/app';
import { collection, deleteDoc, doc, getDocs, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import type { Student, Teacher } from './types';

const app = initializeApp({
  apiKey: 'AIzaSyCLxH3R9QUXkPs_lJoZjCsjBxMRgGnVH9I',
  authDomain: 'absensi-murid-268.firebaseapp.com',
  projectId: 'absensi-murid-268',
  storageBucket: 'absensi-murid-268.firebasestorage.app',
  messagingSenderId: '81051053083',
  appId: '1:81051053083:web:f6a1c4803ad7b715e1dcbe',
  measurementId: 'G-BZTD8QK8HB'
});

const firestore = getFirestore(app);
let applyingCloudData = false;

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
  const [studentSnapshot, teacherSnapshot] = await Promise.all([
    getDocs(collection(firestore, 'students')),
    getDocs(collection(firestore, 'teachers'))
  ]);
  return {
    students: studentSnapshot.docs.map(snapshot => snapshot.data() as Student),
    teachers: teacherSnapshot.docs.map(snapshot => snapshot.data() as Teacher)
  };
}

export async function publishStudent(student: Student) {
  await setDoc(doc(firestore, 'students', student.id), student);
}

export async function publishTeacher(teacher: Teacher) {
  await setDoc(doc(firestore, 'teachers', teacher.id), teacher);
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

export function subscribePublicData(onData: (kind: 'students' | 'teachers', data: (Student | Teacher)[]) => void) {
  const onError = (error: Error) => console.warn('Firestore realtime tidak tersedia', { code: (error as Error & { code?: string }).code, message: error.message });
  const unsubscribeStudents = onSnapshot(collection(firestore, 'students'), snapshot => {
    onData('students', snapshot.docs.map(item => item.data() as Student));
  }, onError);
  const unsubscribeTeachers = onSnapshot(collection(firestore, 'teachers'), snapshot => {
    onData('teachers', snapshot.docs.map(item => item.data() as Teacher));
  }, onError);
  return () => {
    unsubscribeStudents();
    unsubscribeTeachers();
  };
}
