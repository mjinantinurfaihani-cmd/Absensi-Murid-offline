/**
 * Data filtering utilities for Siswa, Guru Kelas, and Guru Bidang
 * This module provides helper functions to retrieve and filter student and teacher data
 */

import { db } from './db';
import type { Teacher, Student } from './types';

/**
 * Parse comma-separated class string into array
 */
export const parseClasses = (klasesString: string): string[] => {
  return klasesString
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
};

/**
 * Normalize class name (trim and uppercase)
 */
export const normalizeClass = (kelas: string): string => {
  return kelas.trim().toUpperCase();
};

// ============================================================================
// STUDENTS (SISWA)
// ============================================================================

/**
 * Get all students (optionally filtered by class)
 */
export async function getAllStudents(
  kelas?: string,
  includeDeleted = false
): Promise<Student[]> {
  let query = db.students.filter(s => includeDeleted || !s.deleted);
  
  if (kelas) {
    query = query.filter(s => normalizeClass(s.kelas) === normalizeClass(kelas));
  }
  
  const students = await query.toArray();
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get students by single class
 */
export async function getStudentsByClass(kelas: string): Promise<Student[]> {
  const students = await db.students
    .filter(s => !s.deleted && normalizeClass(s.kelas) === normalizeClass(kelas))
    .toArray();
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get students for a specific teacher (by teacher ID)
 * Works for both Guru Kelas and Guru Bidang
 */
export async function getStudentsForTeacher(teacherId: string): Promise<Student[]> {
  const teacher = await db.teachers.get(teacherId);
  
  if (!teacher || teacher.deleted) {
    return [];
  }
  
  // Parse teacher's assigned classes
  const assignedClasses = parseClasses(teacher.kelas);
  
  // Get all students in those classes
  const students = await db.students
    .filter(s => !s.deleted && assignedClasses.includes(normalizeClass(s.kelas)))
    .toArray();
  
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get students for multiple classes
 */
export async function getStudentsByClasses(klasesList: string[]): Promise<Student[]> {
  const normalizedClasses = klasesList.map(normalizeClass);
  
  const students = await db.students
    .filter(s => !s.deleted && normalizedClasses.includes(normalizeClass(s.kelas)))
    .toArray();
  
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}

// ============================================================================
// TEACHERS - GURU KELAS (Class Teachers)
// ============================================================================

/**
 * Get Guru Kelas (class teachers) for a specific class
 * Guru Kelas: role === 'guru' and kelas === specific class
 */
export async function getGuruKelasByClass(kelas: string): Promise<Teacher[]> {
  const teachers = await db.teachers
    .filter(t => 
      !t.deleted && 
      t.role === 'guru' && 
      normalizeClass(t.kelas) === normalizeClass(kelas)
    )
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get all Guru Kelas
 */
export async function getAllGuruKelas(): Promise<Teacher[]> {
  const teachers = await db.teachers
    .filter(t => !t.deleted && t.role === 'guru')
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

// ============================================================================
// TEACHERS - GURU BIDANG (Subject Teachers)
// ============================================================================

/**
 * Get Guru Bidang (subject teachers) who teach a specific class
 * Guru Bidang: role === 'guru bidang' and kelas contains the class
 */
export async function getGuruBidangByClass(kelas: string): Promise<Teacher[]> {
  const normalizedKelas = normalizeClass(kelas);
  
  const teachers = await db.teachers
    .filter(t => {
      if (t.deleted || t.role !== 'guru bidang') return false;
      
      const teacherClasses = parseClasses(t.kelas).map(normalizeClass);
      return teacherClasses.includes(normalizedKelas);
    })
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get Guru Bidang (subject teachers) for multiple classes
 */
export async function getGuruBidangByClasses(klasesList: string[]): Promise<Teacher[]> {
  const normalizedClasses = klasesList.map(normalizeClass);
  
  const teachers = await db.teachers
    .filter(t => {
      if (t.deleted || t.role !== 'guru bidang') return false;
      
      const teacherClasses = parseClasses(t.kelas).map(normalizeClass);
      return teacherClasses.some(tc => normalizedClasses.includes(tc));
    })
    .toArray();
  
  // Remove duplicates (in case a teacher teaches multiple classes from the list)
  const uniqueTeachers = Array.from(new Map(teachers.map(t => [t.id, t])).values());
  
  return uniqueTeachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * Get Guru Bidang for a specific student
 */
export async function getGuruBidangForStudent(studentId: string): Promise<Teacher[]> {
  const student = await db.students.get(studentId);
  if (!student) return [];
  
  return getGuruBidangByClass(student.kelas);
}

/**
 * Get all Guru Bidang
 */
export async function getAllGuruBidang(): Promise<Teacher[]> {
  const teachers = await db.teachers
    .filter(t => !t.deleted && t.role === 'guru bidang')
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

// ============================================================================
// COMBINED QUERIES
// ============================================================================

/**
 * Get all teachers by role and optional class filter
 */
export async function getTeachersByRole(
  role: 'guru' | 'guru bidang',
  kelas?: string
): Promise<Teacher[]> {
  if (role === 'guru') {
    if (kelas) {
      return getGuruKelasByClass(kelas);
    } else {
      return getAllGuruKelas();
    }
  } else {
    if (kelas) {
      return getGuruBidangByClass(kelas);
    } else {
      return getAllGuruBidang();
    }
  }
}

/**
 * Get all teachers (Guru Kelas + Guru Bidang) for a class
 */
export async function getAllTeachersByClass(kelas: string): Promise<{
  guruKelas: Teacher[];
  guruBidang: Teacher[];
}> {
  const [guruKelas, guruBidang] = await Promise.all([
    getGuruKelasByClass(kelas),
    getGuruBidangByClass(kelas)
  ]);
  
  return { guruKelas, guruBidang };
}

/**
 * Get unique list of all classes
 */
export async function getAllClasses(): Promise<string[]> {
  const students = await db.students.filter(s => !s.deleted).toArray();
  const classes = [...new Set(students.map(s => normalizeClass(s.kelas)))];
  return classes.sort();
}

/**
 * Load complete admin dashboard data
 */
export async function loadAdminDashboardData(selectedKelas: string = 'ALL') {
  const allStudents = await db.students.filter(s => !s.deleted).toArray();
  const allClasses = [...new Set(allStudents.map(s => normalizeClass(s.kelas)))].sort();
  
  let students: Student[] = [];
  let guruKelas: Teacher[] = [];
  let guruBidang: Teacher[] = [];
  
  if (selectedKelas === 'ALL') {
    students = allStudents.sort((a, b) => a.nama.localeCompare(b.nama));
    [guruKelas, guruBidang] = await Promise.all([
      getAllGuruKelas(),
      getAllGuruBidang()
    ]);
  } else {
    const normalizedSelected = normalizeClass(selectedKelas);
    students = allStudents
      .filter(s => normalizeClass(s.kelas) === normalizedSelected)
      .sort((a, b) => a.nama.localeCompare(b.nama));
    
    [guruKelas, guruBidang] = await Promise.all([
      getGuruKelasByClass(selectedKelas),
      getGuruBidangByClass(selectedKelas)
    ]);
  }
  
  return {
    students,
    guruKelas,
    guruBidang,
    classes: allClasses,
    selectedKelas
  };
}

/**
 * Get summary statistics
 */
export async function getStatistics() {
  const [students, guruKelas, guruBidang, classes] = await Promise.all([
    db.students.filter(s => !s.deleted).toArray(),
    getAllGuruKelas(),
    getAllGuruBidang(),
    getAllClasses()
  ]);
  
  return {
    totalStudents: students.length,
    totalGuruKelas: guruKelas.length,
    totalGuruBidang: guruBidang.length,
    totalClasses: classes.length,
    classes
  };
}
