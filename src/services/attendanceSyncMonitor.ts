import type { Attendance, Student, Teacher } from '../types';
import type { AttendanceDifference } from '../components/AttendanceDifferenceAlert';

/**
 * Service untuk memonitor dan mendeteksi perbedaan status kehadiran
 * antara guru kelas dan guru bidang
 */

export interface AttendanceChangeEvent {
  type: 'created' | 'updated' | 'deleted';
  record: Attendance;
  previousRecord?: Attendance;
  changedBy: 'guru' | 'guru bidang' | 'unknown';
}

export interface SyncMonitorOptions {
  onDifferenceDetected?: (difference: AttendanceDifference) => void;
  onChangeDetected?: (change: AttendanceChangeEvent) => void;
  debounceMs?: number;
}

class AttendanceSyncMonitor {
  private lastCheckedAttendance: Map<string, Attendance> = new Map();
  private debounceTimer: number | undefined;
  private debounceMs: number;
  private onDifferenceDetected?: (difference: AttendanceDifference) => void;
  private onChangeDetected?: (change: AttendanceChangeEvent) => void;

  constructor(options: SyncMonitorOptions = {}) {
    this.debounceMs = options.debounceMs || 500;
    this.onDifferenceDetected = options.onDifferenceDetected;
    this.onChangeDetected = options.onChangeDetected;
  }

  /**
   * Cek apakah ada perbedaan status kehadiran antara guru kelas dan guru bidang
   */
  checkForDifferences(
    attendance: Attendance[],
    students: Map<string, Student>,
    teachers: Map<string, Teacher>
  ): AttendanceDifference[] {
    const differences: AttendanceDifference[] = [];

    // Group attendance by student and tanggal
    const groupedByStudent = new Map<string, Map<string, Attendance[]>>();

    for (const record of attendance) {
      if (!groupedByStudent.has(record.studentId)) {
        groupedByStudent.set(record.studentId, new Map());
      }

      const byDate = groupedByStudent.get(record.studentId)!;
      if (!byDate.has(record.tanggal)) {
        byDate.set(record.tanggal, []);
      }

      byDate.get(record.tanggal)!.push(record);
    }

    // Cek setiap kombinasi siswa-tanggal
    for (const [studentId, byDate] of groupedByStudent.entries()) {
      const student = students.get(studentId);
      if (!student) continue;

      for (const [tanggal, records] of byDate.entries()) {
        // Cari record dari guru kelas dan guru bidang untuk tanggal yang sama
        const classTeacherRecords = records.filter(
          r => r.ownerRole === 'guru' || (r.ownerRole === undefined && !r.ownerId)
        );
        const subjectTeacherRecords = records.filter(r => r.ownerRole === 'guru bidang');

        // Jika ada record dari keduanya, cek apakah statusnya berbeda
        if (classTeacherRecords.length > 0 && subjectTeacherRecords.length > 0) {
          const classRecord = classTeacherRecords[classTeacherRecords.length - 1];
          const subjectRecord = subjectTeacherRecords[subjectTeacherRecords.length - 1];

          if (classRecord.status !== subjectRecord.status) {
            const classTeacher = classRecord.ownerId
              ? teachers.get(classRecord.ownerId)
              : undefined;
            const subjectTeacher = subjectRecord.ownerId
              ? teachers.get(subjectRecord.ownerId)
              : undefined;

            differences.push({
              key: `${studentId}-${tanggal}`,
              studentId,
              studentName: student.nama,
              studentClass: student.kelas,
              tanggal,
              classTeacherStatus: classRecord.status,
              subjectTeacherStatus: subjectRecord.status,
              classTeacherName: classTeacher?.nama,
              subjectTeacherName: subjectTeacher?.nama,
            });
          }
        }
      }
    }

    return differences;
  }

  /**
   * Monitoring perubahan status kehadiran dengan debounce
   */
  monitorChanges(
    currentAttendance: Attendance[],
    students: Map<string, Student>,
    teachers: Map<string, Teacher>
  ): void {
    // Clear previous debounce timer
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(() => {
      this._processChanges(currentAttendance, students, teachers);
    }, this.debounceMs);
  }

  private _processChanges(
    currentAttendance: Attendance[],
    students: Map<string, Student>,
    teachers: Map<string, Teacher>
  ): void {
    // Deteksi perubahan record
    const changeEvents: AttendanceChangeEvent[] = [];

    for (const record of currentAttendance) {
      const key = record.id;
      const previousRecord = this.lastCheckedAttendance.get(key);

      if (!previousRecord) {
        // Record baru
        changeEvents.push({
          type: 'created',
          record,
          changedBy: (record.ownerRole === 'guru' || record.ownerRole === 'guru bidang' ? record.ownerRole : 'unknown') as 'guru' | 'guru bidang' | 'unknown',
        });
      } else if (previousRecord.status !== record.status) {
        // Record berubah
        changeEvents.push({
          type: 'updated',
          record,
          previousRecord,
          changedBy: (record.ownerRole === 'guru' || record.ownerRole === 'guru bidang' ? record.ownerRole : 'unknown') as 'guru' | 'guru bidang' | 'unknown',
        });
      }
    }

    // Update cache
    this.lastCheckedAttendance.clear();
    for (const record of currentAttendance) {
      this.lastCheckedAttendance.set(record.id, record);
    }

    // Emit change events
    for (const event of changeEvents) {
      if (this.onChangeDetected) {
        this.onChangeDetected(event);
      }
    }

    // Cek perbedaan antar role
    const differences = this.checkForDifferences(currentAttendance, students, teachers);
    for (const diff of differences) {
      if (this.onDifferenceDetected) {
        this.onDifferenceDetected(diff);
      }
    }
  }

  /**
   * Reset monitor (untuk testing atau saat logout)
   */
  reset(): void {
    this.lastCheckedAttendance.clear();
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * Update callback untuk perbedaan
   */
  setOnDifferenceDetected(callback: (difference: AttendanceDifference) => void): void {
    this.onDifferenceDetected = callback;
  }

  /**
   * Update callback untuk perubahan
   */
  setOnChangeDetected(callback: (change: AttendanceChangeEvent) => void): void {
    this.onChangeDetected = callback;
  }
}

// Singleton instance
let monitorInstance: AttendanceSyncMonitor | null = null;

export function getAttendanceSyncMonitor(
  options?: SyncMonitorOptions
): AttendanceSyncMonitor {
  if (!monitorInstance) {
    monitorInstance = new AttendanceSyncMonitor(options);
  }
  return monitorInstance;
}

export function createAttendanceSyncMonitor(
  options?: SyncMonitorOptions
): AttendanceSyncMonitor {
  return new AttendanceSyncMonitor(options);
}

export function resetAttendanceSyncMonitor(): void {
  if (monitorInstance) {
    monitorInstance.reset();
    monitorInstance = null;
  }
}

export default AttendanceSyncMonitor;
