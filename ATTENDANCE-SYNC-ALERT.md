# Attendance Synchronization Alert System

## Overview

This feature automatically detects and displays alerts when there are attendance status discrepancies between **guru kelas** (class teachers) and **guru bidang** (subject teachers) for the same student on the same date.

**Use Case:** When a subject teacher (guru bidang) changes a student's attendance status differently from what the class teacher recorded, the class teacher receives a floating red alert notification prompting them to review and confirm the discrepancy.

---

## Components

### 1. **AttendanceDifferenceAlert** Component
**File:** `src/components/AttendanceDifferenceAlert.tsx`

A React component that displays a floating alert notification with red gradient background and white text.

#### Props
```typescript
interface Props {
  difference: AttendanceDifference | null;
  fading: boolean;
  onConfirm: () => void;
}

interface AttendanceDifference {
  key: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  tanggal: string;
  classTeacherStatus: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPA' | 'TERLAMBAT';
  subjectTeacherStatus: 'HADIR' | 'SAKIT' | 'IZIN' | 'ALPA' | 'TERLAMBAT';
  classTeacherName?: string;
  subjectTeacherName?: string;
}
```

#### Features
- **Visual Design:**
  - Red gradient background (`linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%)`)
  - White text with high contrast
  - Positioned in bottom-right corner (fixed)
  - Responsive design (adapts to mobile screens)
  - Width: min(92vw, 480px)

- **Content Display:**
  - Student name and class
  - Date of attendance record
  - Side-by-side comparison of guru kelas vs guru bidang attendance status
  - Color-coded status badges:
    - 🟢 HADIR (Present) - Green (#16a34a)
    - 🔵 SAKIT (Sick) - Blue (#0284c7)
    - 🟡 IZIN (Excused) - Yellow (#eab308)
    - 🔴 ALPA (Absent) - Red (#dc2626)
    - 🟢 TERLAMBAT (Late) - Green (#16a34a)

- **Animations:**
  - **Entry:** `alertSlideIn` (0.35s) - slides up from bottom with scale and fade
  - **Exit:** `alertFade` (0.35s) - fades out and scales down when confirmed
  - **Icon Pulse:** `alertPulse` (2.4s) - continuous breathing animation on alert icon

- **Interaction:**
  - Confirm button triggers `onConfirm` callback
  - Alert automatically fades and closes after confirmation
  - No automatic dismissal (requires explicit confirmation)

#### Usage Example
```tsx
<AttendanceDifferenceAlert 
  difference={currentDifference}
  fading={differenceFading}
  onConfirm={() => {
    setDifferenceFading(true);
    setTimeout(() => {
      setCurrentDifference(null);
      setDifferenceFading(false);
    }, 350);
  }}
/>
```

---

### 2. **AttendanceSyncMonitor** Service
**File:** `src/services/attendanceSyncMonitor.ts`

A TypeScript service that monitors attendance records and detects discrepancies between class teachers and subject teachers.

#### Key Methods

##### `checkForDifferences()`
Analyzes attendance records and identifies status mismatches.

```typescript
checkForDifferences(): AttendanceDifference[] {
  // Groups attendance by studentId + tanggal
  // Filters records from guru kelas and guru bidang
  // Compares status values
  // Returns array of differences
}
```

**Logic:**
1. Groups all attendance records by `studentId + tanggal` combination
2. For each group:
   - Finds latest record from guru kelas (ownerRole === 'guru')
   - Finds latest record from guru bidang (ownerRole === 'guru bidang')
   - Compares `status` fields
   - If different, creates `AttendanceDifference` object
3. Returns sorted array by date (newest first)

##### `monitorChanges()`
Sets up continuous monitoring of attendance changes.

```typescript
monitorChanges(
  attendance: Attendance[],
  students: Map<string, Student>,
  teachers: Map<string, Teacher>
): void
```

**Parameters:**
- `attendance`: Array of all attendance records
- `students`: Map of student ID to Student object
- `teachers`: Map of teacher ID to Teacher object

**Behavior:**
- Tracks new/updated attendance records
- Debounces change detection (default 500ms)
- Calls `onDifferenceDetected` callback when differences found
- Calls `onChangeDetected` callback on any record change

##### `reset()`
Clears internal state and cancels all timers.

```typescript
reset(): void
```

**Use Cases:**
- Logout/session change
- Testing/cleanup
- Switching user context

#### Singleton Pattern

The service uses a singleton pattern for easy integration:

```typescript
import { getAttendanceSyncMonitor } from './services/attendanceSyncMonitor';

// Get or create singleton instance
const monitor = getAttendanceSyncMonitor({
  onDifferenceDetected: (difference) => {
    // Handle new difference
    setCurrentDifference(difference);
  }
});

// Start monitoring
monitor.monitorChanges(attendanceList, studentsMap, teachersMap);

// Reset when needed
monitor.reset();
```

#### Configuration Options

```typescript
interface SyncMonitorOptions {
  onDifferenceDetected?: (difference: AttendanceDifference) => void;
  onChangeDetected?: (event: AttendanceChangeEvent) => void;
  debounceMs?: number;  // default: 500ms
}
```

---

## Integration with App.tsx

The feature is integrated into the main `App.tsx` component:

### State Management
```typescript
const [currentDifference, setCurrentDifference] = useState<AttendanceDifference | null>(null);
const [differenceFading, setDifferenceFading] = useState(false);
const [teachers, setTeachers] = useState<Map<string, Teacher>>(new Map());
const [attendance, setAttendance] = useState<Attendance[]>([]);
```

### Setup Effect
```typescript
useEffect(() => {
  if (!ready || !studentsLoaded) return;
  
  const setupMonitoring = async () => {
    const [attendanceList, teacherList, studentsList] = await Promise.all([
      db.attendance.toArray(),
      db.teachers.toArray(),
      db.students.toArray()
    ]);

    setAttendance(attendanceList);
    setTeachers(new Map(teacherList.map(t => [t.id, t])));

    const monitor = getAttendanceSyncMonitor({
      onDifferenceDetected: (difference) => {
        if (user && (user.role === 'admin' || 
            (user.role === 'guru' && normalizeClassList(user.kelas).includes(difference.studentClass)))) {
          setCurrentDifference(difference);
          setDifferenceFading(false);
        }
      }
    });

    const studentsMap = new Map(studentsList.map(s => [s.id, s]));
    monitor.monitorChanges(attendanceList, studentsMap, new Map(teacherList.map(t => [t.id, t])));
  };

  setupMonitoring();
}, [ready, studentsLoaded, user]);
```

### Rendering
```tsx
<AttendanceDifferenceAlert 
  difference={currentDifference} 
  fading={differenceFading} 
  onConfirm={() => {
    setDifferenceFading(true);
    window.setTimeout(() => {
      setCurrentDifference(null);
      setDifferenceFading(false);
    }, 350);
  }} 
/>
```

---

## Styling

**File:** `src/style.css` (220+ lines added)

All styling uses CSS Grid, Flexbox, and custom animations for consistency with the application design.

### Key CSS Classes

| Class | Purpose |
|-------|---------|
| `.attendance-difference-alert` | Main alert container |
| `.attendance-difference-alert.fading` | Fade-out animation state |
| `.alert-header` | Header section with icon and title |
| `.alert-icon` | Circular animated icon |
| `.status-comparison` | 3-column grid for status comparison |
| `.status-badge` | Individual status display |
| `.status-dot` | Color-coded dot indicator |
| `.alert-message` | Alert message text |
| `.alert-confirm-btn` | Confirm action button |

### Animations

- `alertSlideIn`: Entry animation (0.35s)
- `alertFade`: Exit animation (0.35s)
- `alertPulse`: Icon breathing animation (2.4s, infinite)

---

## How It Works

### Step-by-Step Flow

1. **Application Starts:**
   - App loads student, teacher, and attendance data from IndexedDB
   - `setupMonitoring()` effect is triggered

2. **Monitor Initialization:**
   - Calls `getAttendanceSyncMonitor()` to create/get singleton instance
   - Registers `onDifferenceDetected` callback
   - Calls `monitorChanges()` with current data

3. **Difference Detection:**
   - Monitor analyzes all attendance records
   - Groups by studentId + tanggal
   - Compares guru kelas vs guru bidang status
   - When difference found: calls `onDifferenceDetected` callback

4. **Alert Display:**
   - Callback sets `currentDifference` state
   - `AttendanceDifferenceAlert` component renders
   - Alert slides in with animation
   - Shows student info and status comparison
   - Icon pulses continuously

5. **User Confirmation:**
   - Class teacher reviews the discrepancy
   - Clicks "Konfirmasi" button
   - `onConfirm` handler triggered
   - Alert fades out over 350ms
   - Alert state is cleared
   - Component unmounts

### Visibility Rules

The alert is only shown to:
- **Admin users:** See all differences
- **Class teachers (guru kelas):** See differences for their assigned classes
- **Subject teachers (guru bidang):** Do NOT see alerts (they made the change)

---

## Testing Scenarios

### Scenario 1: Basic Alert Display
1. Log in as guru kelas for a class (e.g., "1A")
2. Student attendance is recorded as HADIR
3. Switch to guru bidang account
4. Change same student's status for same date to SAKIT
5. Switch back to guru kelas account
6. Expected: Red alert appears showing HADIR → SAKIT change

### Scenario 2: Multiple Teachers on Same Subject
1. One guru bidang records status A
2. Different guru bidang updates to status B for same student
3. If status differs from guru kelas: alert appears
4. Expected: Alert shows latest differences

### Scenario 3: Fade Animation
1. Alert is displayed
2. Click "Konfirmasi" button
3. Expected: Alert fades out over 350ms and disappears
4. Multiple alert states should not stack

### Scenario 4: Mobile Responsiveness
1. Open application on mobile device (< 640px width)
2. Trigger attendance difference
3. Expected: Alert width adjusts, status comparison becomes single column
4. All text remains readable and button is tappable

---

## Troubleshooting

### Alert Not Appearing
- **Check user role:** Only admin and class teachers (guru kelas) see alerts
- **Verify assigned class:** User must be assigned to the student's class
- **Check sync status:** Monitor activates only after `ready && studentsLoaded`
- **Attendance data:** Ensure records exist for both guru and guru bidang

### Alert Appearing Twice
- Service uses singleton pattern; verify only one monitor instance is created
- Check that `getAttendanceSyncMonitor()` is not called multiple times

### Animations Not Working
- Verify CSS file is loaded: check `dist/assets/index-*.css` in browser DevTools
- Check browser support for CSS animations (Chrome 26+, Firefox 16+, Safari 9+)
- Verify no conflicting CSS overrides `.attendance-difference-alert` class

### Type Errors
- Ensure `AttendanceDifference` import matches component export
- Verify `ownerRole` field exists in attendance records
- Check TypeScript version compatibility (3.8+)

---

## Future Enhancements

Potential improvements:
1. **Automatic Resolution:** Mark difference as reviewed without confirmation
2. **Conflict Merge:** Automatically pick higher priority status (e.g., ALPA > IZIN > SAKIT > HADIR)
3. **Notification Sounds:** Play alert tone when difference detected
4. **Batch Processing:** Handle multiple differences with pagination
5. **History Tracking:** Log who confirmed and when
6. **Email Notifications:** Send email to class teacher about discrepancies

---

## File Structure

```
src/
├── components/
│   └── AttendanceDifferenceAlert.tsx    (Component)
├── services/
│   └── attendanceSyncMonitor.ts         (Service)
├── App.tsx                               (Integration)
├── style.css                             (Styling)
└── types.ts                              (Type definitions)
```

---

## Related Documentation

- [INTEGRASI.md](./INTEGRASI.md) - Integration guide
- [SYNC-DATA-GUIDE.md](./SYNC-DATA-GUIDE.md) - Synchronization details
- [PHASE-3D-FIREBASE-RULES.md](./PHASE-3D-FIREBASE-RULES.md) - Firebase security rules
