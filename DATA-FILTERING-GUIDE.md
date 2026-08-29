# Data Filtering Guide: Siswa, Guru Kelas, and Guru Bidang

## Overview

This guide shows how to filter and retrieve:
- **Data Siswa** (Students) - by assigned class(es)
- **Guru Kelas** (Class Teachers) - by class
- **Guru Bidang** (Subject Teachers) - by assigned class(es)

## Data Structure

### Student (Siswa)
```typescript
interface Student {
  id: string;
  nisn: string;
  nama: string;
  kelas: string;        // e.g., "4A", "3B"
  kontak: string;
  deleted?: boolean | number;
  updatedAt: string;
}
```

### Teacher (Guru)
```typescript
interface Teacher {
  id: string;
  nama: string;
  nik: string;
  role: 'admin' | 'guru' | 'guru bidang';
  kelas: string;        // Single class OR comma-separated classes
                         // e.g., "4A" (guru kelas) or "4A, 4B, 5A" (guru bidang)
  password: string;
  deleted?: boolean | number;
  updatedAt: string;
}
```

## Filtering Functions

### 1. Get Students by Class
```typescript
async function getStudentsByClass(kelas: string): Promise<Student[]> {
  const students = await db.students
    .filter(s => !s.deleted && s.kelas === kelas)
    .toArray();
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}
```

### 2. Get Students Assigned to a Teacher (Guru Kelas or Guru Bidang)
```typescript
async function getStudentsForTeacher(teacherId: string): Promise<Student[]> {
  // Get teacher's assigned classes
  const teacher = await db.teachers.get(teacherId);
  if (!teacher || teacher.deleted) return [];
  
  // Parse comma-separated classes
  const assignedClasses = teacher.kelas
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  
  // Get all students in those classes
  const students = await db.students
    .filter(s => !s.deleted && assignedClasses.includes(s.kelas))
    .toArray();
  
  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}
```

### 3. Get Guru Kelas (Class Teachers) by Class
```typescript
async function getGuruKelasByClass(kelas: string): Promise<Teacher[]> {
  // Guru kelas assigned to a single class (role = 'guru')
  const teachers = await db.teachers
    .filter(t => 
      !t.deleted && 
      t.role === 'guru' && 
      t.kelas === kelas
    )
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}
```

### 4. Get Guru Bidang (Subject Teachers) by Assigned Classes
```typescript
async function getGuruBidangByClasses(kelas: string[]): Promise<Teacher[]> {
  // Guru bidang can teach multiple classes
  const teachers = await db.teachers
    .filter(t => {
      if (t.deleted || t.role !== 'guru bidang') return false;
      
      // Check if teacher's classes overlap with input classes
      const teacherClasses = t.kelas
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);
      
      return teacherClasses.some(tc => kelas.includes(tc));
    })
    .toArray();
  
  return teachers.sort((a, b) => a.nama.localeCompare(b.nama));
}

// Or get Guru Bidang for all classes a student is in
async function getGuruBidangForStudent(studentId: string): Promise<Teacher[]> {
  const student = await db.students.get(studentId);
  if (!student) return [];
  
  return getGuruBidangByClasses([student.kelas]);
}
```

### 5. Get All Teachers by Role and Class
```typescript
async function getTeachersByRoleAndClass(
  role: 'guru' | 'guru bidang',
  kelas: string
): Promise<Teacher[]> {
  if (role === 'guru') {
    // Guru kelas - must have exact class assignment
    return db.teachers
      .filter(t => 
        !t.deleted && 
        t.role === 'guru' && 
        t.kelas === kelas
      )
      .toArray();
  } else {
    // Guru bidang - assigned classes contain the class
    return db.teachers
      .filter(t => {
        if (t.deleted || t.role !== 'guru bidang') return false;
        const teacherClasses = t.kelas
          .split(',')
          .map(c => c.trim())
          .filter(Boolean);
        return teacherClasses.includes(kelas);
      })
      .toArray();
  }
}
```

## Admin Page Implementation Example

### Get All Data for Admin Dashboard
```typescript
async function loadAdminData(selectedKelas: string = 'ALL') {
  try {
    // Get all students (optionally filtered by class)
    const students = selectedKelas === 'ALL'
      ? await db.students.filter(s => !s.deleted).toArray()
      : await getStudentsByClass(selectedKelas);
    
    // Get all unique classes
    const uniqueClasses = [...new Set(students.map(s => s.kelas))].sort();
    
    // Get Guru Kelas for selected class
    let guruKelas: Teacher[] = [];
    if (selectedKelas !== 'ALL') {
      guruKelas = await getGuruKelasByClass(selectedKelas);
    } else {
      guruKelas = await db.teachers
        .filter(t => !t.deleted && t.role === 'guru')
        .toArray();
    }
    
    // Get Guru Bidang for selected class(es)
    const classesToCheck = selectedKelas === 'ALL' 
      ? uniqueClasses 
      : [selectedKelas];
    const guruBidang = await db.teachers
      .filter(t => {
        if (t.deleted || t.role !== 'guru bidang') return false;
        const teacherClasses = t.kelas
          .split(',')
          .map(c => c.trim())
          .filter(Boolean);
        return teacherClasses.some(tc => classesToCheck.includes(tc));
      })
      .toArray();
    
    return {
      students,
      guruKelas,
      guruBidang,
      uniqueClasses,
      selectedKelas
    };
  } catch (error) {
    console.error('Error loading admin data:', error);
    throw error;
  }
}
```

## Usage in React Components

### Example: Admin Teachers Page
```typescript
function Teachers({ showToast }: any) {
  const [selectedKelas, setSelectedKelas] = useState('ALL');
  const [guruKelas, setGuruKelas] = useState<Teacher[]>([]);
  const [guruBidang, setGuruBidang] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<string[]>([]);

  useEffect(() => {
    const loadData = async () => {
      const data = await loadAdminData(selectedKelas);
      setGuruKelas(data.guruKelas);
      setGuruBidang(data.guruBidang);
      setClasses(data.uniqueClasses);
    };
    loadData();
  }, [selectedKelas]);

  return (
    <div>
      <div className="heading">
        <h1>Data Guru</h1>
        <div className="filter">
          <label>Filter Kelas:</label>
          <select value={selectedKelas} onChange={e => setSelectedKelas(e.target.value)}>
            <option value="ALL">Semua Kelas</option>
            {classes.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

      <section>
        <h2>Guru Kelas</h2>
        {guruKelas.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>NIK</th>
                <th>Kelas</th>
              </tr>
            </thead>
            <tbody>
              {guruKelas.map(guru => (
                <tr key={guru.id}>
                  <td>{guru.nama}</td>
                  <td>{guru.nik}</td>
                  <td>{guru.kelas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Tidak ada guru kelas untuk kelas ini.</p>
        )}
      </section>

      <section>
        <h2>Guru Bidang</h2>
        {guruBidang.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>NIK</th>
                <th>Kelas yang Diajar</th>
              </tr>
            </thead>
            <tbody>
              {guruBidang.map(guru => (
                <tr key={guru.id}>
                  <td>{guru.nama}</td>
                  <td>{guru.nik}</td>
                  <td>{guru.kelas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Tidak ada guru bidang untuk kelas ini.</p>
        )}
      </section>
    </div>
  );
}
```

### Example: Get Students by Guru Kelas
```typescript
async function getStudentsByGuruKelas(guruId: string) {
  const teacher = await db.teachers.get(guruId);
  if (!teacher || teacher.role !== 'guru') {
    throw new Error('Teacher not found or is not guru kelas');
  }

  const students = await db.students
    .filter(s => !s.deleted && s.kelas === teacher.kelas)
    .toArray();

  return students.sort((a, b) => a.nama.localeCompare(b.nama));
}
```

## Key Points

1. **Guru Kelas** (Class Teachers):
   - `role === 'guru'`
   - Assigned to ONE class: `kelas === "4A"`
   - Teach all subjects in their class

2. **Guru Bidang** (Subject Teachers):
   - `role === 'guru bidang'`
   - Can teach MULTIPLE classes: `kelas === "4A, 4B, 5A"`
   - Teach one subject across multiple classes

3. **Admin**:
   - `role === 'admin'`
   - Access to ALL data
   - Can see all students and teachers
   - `kelas === "SEMUA"`

4. **Filtering Pattern**:
   ```typescript
   // For Guru Kelas - single class match
   teacher.kelas === studentKelas
   
   // For Guru Bidang - check if class is in their list
   teacher.kelas.split(',').map(c => c.trim()).includes(studentKelas)
   ```

## Imports Required

```typescript
import { db } from './db';
import type { Teacher, Student } from './types';
```
