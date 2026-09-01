import React, { useEffect, useState } from 'react';
import type { Attendance, Student } from '../types';

export interface AttendanceDifference {
  key: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  tanggal: string;
  classTeacherStatus: Attendance['status'];
  subjectTeacherStatus: Attendance['status'];
  classTeacherName?: string;
  subjectTeacherName?: string;
}

interface AttendanceDifferenceAlertProps {
  difference: AttendanceDifference | null;
  onConfirm: () => void;
  fading?: boolean;
}

const statusLabel = (status: Attendance['status']): string => {
  const labels: Record<Attendance['status'], string> = {
    'HADIR': 'Hadir',
    'TERLAMBAT': 'Hadir',
    'SAKIT': 'Sakit',
    'IZIN': 'Ijin',
    'ALPA': 'Alpa'
  };
  return labels[status] || status;
};

const statusColor = (status: Attendance['status']): string => {
  const colors: Record<Attendance['status'], string> = {
    'HADIR': '#16a34a',
    'TERLAMBAT': '#16a34a',
    'SAKIT': '#0284c7',
    'IZIN': '#eab308',
    'ALPA': '#dc2626'
  };
  return colors[status] || '#666';
};

export const AttendanceDifferenceAlert: React.FC<AttendanceDifferenceAlertProps> = ({
  difference,
  onConfirm,
  fading = false
}) => {
  if (!difference) return null;

  return (
    <div className={`attendance-difference-alert ${fading ? 'fading' : ''}`}>
      <div className="alert-header">
        <div className="alert-icon">⚠️</div>
        <div className="alert-title-section">
          <strong className="alert-title">Perbedaan Status Kehadiran</strong>
          <span className="alert-subtitle">Tanggal {difference.tanggal}</span>
        </div>
      </div>

      <div className="alert-content">
        <div className="student-info">
          <div className="info-item">
            <span className="info-label">Nama Siswa:</span>
            <span className="info-value">{difference.studentName}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Kelas:</span>
            <span className="info-value">{difference.studentClass}</span>
          </div>
        </div>

        <div className="status-comparison">
          <div className="status-column guru-kelas">
            <div className="status-role">Guru Kelas</div>
            <div className="status-badge">
              <span
                className="status-dot"
                style={{ backgroundColor: statusColor(difference.classTeacherStatus) }}
              />
              <span className="status-text">{statusLabel(difference.classTeacherStatus)}</span>
            </div>
            {difference.classTeacherName && (
              <span className="teacher-name">{difference.classTeacherName}</span>
            )}
          </div>

          <div className="status-separator">vs</div>

          <div className="status-column guru-bidang">
            <div className="status-role">Guru Bidang</div>
            <div className="status-badge">
              <span
                className="status-dot"
                style={{ backgroundColor: statusColor(difference.subjectTeacherStatus) }}
              />
              <span className="status-text">{statusLabel(difference.subjectTeacherStatus)}</span>
            </div>
            {difference.subjectTeacherName && (
              <span className="teacher-name">{difference.subjectTeacherName}</span>
            )}
          </div>
        </div>

        <div className="alert-message">
          <p>
            Status kehadiran siswa tidak cocok antara guru kelas dan guru bidang. 
            Mohon koordinasikan dan sesuaikan status kehadiran.
          </p>
        </div>
      </div>

      <button
        className="alert-confirm-btn"
        onClick={onConfirm}
        title="Tutup notifikasi"
      >
        ✓ Sudah Dipahami
      </button>
    </div>
  );
};

export default AttendanceDifferenceAlert;
