# Quick Reference: Data Filtering Functions

## Import
```typescript
import {
  // Students
  getAllStudents,
  getStudentsByClass,
  getStudentsForTeacher,
  
  // Guru Kelas
  getGuruKelasByClass,
  getAllGuruKelas,
  
  // Guru Bidang
  getGuruBidangByClass,
  getGuruBidangForStudent,
  getAllGuruBidang,
  
  // Combined
  loadAdminDashboardData,
  getAllClasses,
  getStatistics,
  
  // Utilities
  parseClasses,
  normalizeClass
} from './dataFilters';
```

## Common Usage Patterns

### 1. Get All Students
```typescript
const students = await getAllStudents();
```

### 2. Get Students by Class
```typescript
const siswa4A = await getStudentsByClass('4A');
```

### 3. Get Students for a Teacher
```typescript
const studentsList = await getStudentsForTeacher(teacherId);
// Works for both Guru Kelas and Guru Bidang
```

### 4. Get Guru Kelas for a Class
```typescript
const guruKelas = await getGuruKelasByClass('4A');
// Returns teachers where role === 'guru' AND kelas === '4A'
```

### 5. Get Guru Bidang for a Class
```typescript
const guruBidang = await getGuruBidangByClass('4A');
// Returns teachers where role === 'guru bidang' AND '4A' in their kelas list
```

### 6. Get Guru Bidang for a Student
```typescript
const teachersForStudent = await getGuruBidangForStudent(studentId);
```

### 7. Get All Data for Admin Dashboard
```typescript
const data = await loadAdminDashboardData('4A');
// Returns: { students, guruKelas, guruBidang, classes, selectedKelas }

const allData = await loadAdminDashboardData('ALL');
// Returns all students, teachers, and classes
```

### 8. Get Statistics
```typescript
const stats = await getStatistics();
// Returns: { totalStudents, totalGuruKelas, totalGuruBidang, totalClasses, classes }
```

### 9. Parse Teacher Classes (Guru Bidang)
```typescript
const guru = await db.teachers.get(guruBidangId);
const classes = parseClasses(guru.kelas);
// "4A, 4B, 5A" => ["4A", "4B", "5A"]
```

### 10. Normalize Class Name
```typescript
const normalized = normalizeClass('  4a  ');
// Returns: "4A"
```

## React Hook Patterns

### Load Data in useEffect
```typescript
const [students, setStudents] = useState<Student[]>([]);
const [selectedKelas, setSelectedKelas] = useState('4A');

useEffect(() => {
  const load = async () => {
    const data = await getStudentsByClass(selectedKelas);
    setStudents(data);
  };
  load();
}, [selectedKelas]);
```

### Load Multiple Data at Once
```typescript
const [data, setData] = useState<AdminDashboardData | null>(null);
const [selectedKelas, setSelectedKelas] = useState('ALL');

useEffect(() => {
  const load = async () => {
    const dashboardData = await loadAdminDashboardData(selectedKelas);
    setData(dashboardData);
  };
  load();
}, [selectedKelas]);

return (
  <>
    <h2>Students: {data?.students.length}</h2>
    <h2>Guru Kelas: {data?.guruKelas.length}</h2>
    <h2>Guru Bidang: {data?.guruBidang.length}</h2>
  </>
);
```

## Filtering in React
```typescript
function TeacherListWithFilter() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [role, setRole] = useState<'guru' | 'guru bidang'>('guru');
  const [selectedKelas, setSelectedKelas] = useState('4A');

  useEffect(() => {
    const load = async () => {
      const data = role === 'guru'
        ? await getGuruKelasByClass(selectedKelas)
        : await getGuruBidangByClass(selectedKelas);
      setTeachers(data);
    };
    load();
  }, [role, selectedKelas]);

  return (
    <div>
      <select value={role} onChange={(e) => setRole(e.target.value as any)}>
        <option value="guru">Guru Kelas</option>
        <option value="guru bidang">Guru Bidang</option>
      </select>
      
      {teachers.map((t) => (
        <div key={t.id}>{t.nama} - {t.kelas}</div>
      ))}
    </div>
  );
}
```

## Parallel Loads (Promise.all)
```typescript
const [guruKelas, guruBidang, students] = await Promise.all([
  getGuruKelasByClass('4A'),
  getGuruBidangByClass('4A'),
  getStudentsByClass('4A')
]);
```

## Filter by Admin Access
```typescript
async function getDataForUser(user: UserSession, selectedKelas: string) {
  if (user.role === 'admin') {
    // Admin sees all data
    return loadAdminDashboardData(selectedKelas);
  } else if (user.role === 'guru') {
    // Guru Kelas sees only their class
    return loadAdminDashboardData(user.kelas);
  } else if (user.role === 'guru bidang') {
    // Guru Bidang sees their assigned classes
    const classes = parseClasses(user.kelas);
    // Load data for those classes
    return loadAdminDashboardData(classes[0]); // or all
  }
}
```

## Combining Data
```typescript
async function getStudentsSummary(kelas: string) {
  const [students, guruKelas] = await Promise.all([
    getStudentsByClass(kelas),
    getGuruKelasByClass(kelas)
  ]);

  return {
    kelas,
    totalStudents: students.length,
    guruKelas: guruKelas[0] || null,
    students
  };
}
```

## Error Handling
```typescript
async function safeLoadData(kelas: string) {
  try {
    const data = await loadAdminDashboardData(kelas);
    return data;
  } catch (error) {
    console.error('Failed to load data:', error);
    showToast('error', 'Gagal memuat data');
    return null;
  }
}
```

## Sorting Examples
```typescript
// Already sorted in functions, but if needed:
const sortedByName = students.sort((a, b) => 
  a.nama.localeCompare(b.nama)
);

const sortedByClass = students.sort((a, b) => 
  a.kelas.localeCompare(b.kelas) || 
  a.nama.localeCompare(b.nama)
);
```

## Search/Filter within Results
```typescript
const searchResults = students.filter(s => 
  s.nama.toLowerCase().includes(query.toLowerCase()) ||
  s.nisn.includes(query)
);
```

## Get Unique Classes from Students
```typescript
const classes = [...new Set(students.map(s => s.kelas))].sort();
// Or use the utility:
const classes = await getAllClasses();
```

## Check Teacher's Students Count
```typescript
async function getTeacherStudentCount(teacherId: string) {
  const students = await getStudentsForTeacher(teacherId);
  return students.length;
}
```

## Export Data Example
```typescript
async function exportTeacherStudents(teacherId: string) {
  const teacher = await db.teachers.get(teacherId);
  const students = await getStudentsForTeacher(teacherId);
  
  const data = students.map(s => ({
    nisn: s.nisn,
    nama: s.nama,
    kelas: s.kelas
  }));
  
  // Export as CSV/Excel...
  return data;
}
```

## Performance Tips

1. **Use parallel loads** for independent queries:
   ```typescript
   await Promise.all([query1, query2, query3])
   ```

2. **Cache results** in state to avoid repeated loads

3. **Filter in code** after loading:
   ```typescript
   const filtered = data.filter(item => condition)
   ```

4. **Limit dataset size** when possible:
   ```typescript
   // Better than loading all and filtering
   await getStudentsByClass('4A')
   ```

## Data Relationships

```
Student (Siswa)
  ├── has single kelas (class)
  └── can have multiple teachers

Teacher (Guru)
  ├── Guru Kelas
  │   └── assigned to ONE class
  │       └── responsible for all subjects
  └── Guru Bidang
      └── can teach MULTIPLE classes
          └── teaches ONE subject
```

## Type Definitions

```typescript
interface Student {
  id: string;
  nisn: string;
  nama: string;
  kelas: string;        // Single class: "4A"
  kontak: string;
  deleted?: boolean | number;
  updatedAt: string;
  synced: number;
}

interface Teacher {
  id: string;
  nama: string;
  nik: string;
  role: 'admin' | 'guru' | 'guru bidang';
  kelas: string;        // "4A" (guru) or "4A, 4B, 5A" (guru bidang)
  password: string;
  deleted?: boolean | number;
  updatedAt: string;
  synced: number;
}
```
