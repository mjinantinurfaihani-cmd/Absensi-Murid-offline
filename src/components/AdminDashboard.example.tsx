/**
 * Example Admin Page Component
 * Demonstrates how to use the dataFilters utilities to display and manage
 * student and teacher data with filtering by class
 */

import { useEffect, useState } from 'react';
import type { Teacher, Student } from '../types';
import {
  loadAdminDashboardData,
  getAllClasses,
  getStudentsForTeacher,
  getGuruBidangForStudent,
  getStatistics
} from '../dataFilters';

interface AdminDashboardData {
  students: Student[];
  guruKelas: Teacher[];
  guruBidang: Teacher[];
  classes: string[];
  selectedKelas: string;
}

/**
 * Admin Dashboard Component - Example usage of data filters
 */
export default function AdminDashboard({ showToast }: { showToast?: any }) {
  const [selectedKelas, setSelectedKelas] = useState('ALL');
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [expandedTeacher, setExpandedTeacher] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const dashboardData = await loadAdminDashboardData(selectedKelas);
        const statistics = await getStatistics();
        setData(dashboardData);
        setStats(statistics);
      } catch (error) {
        console.error('Error loading data:', error);
        showToast?.('error', 'Gagal memuat data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [selectedKelas, showToast]);

  if (loading) {
    return <div className="loading">Memuat data...</div>;
  }

  if (!data) {
    return <div className="error">Gagal memuat data</div>;
  }

  return (
    <div className="admin-dashboard">
      {/* Header with Statistics */}
      {stats && (
        <section className="statistics">
          <h2>Statistik</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.totalStudents}</div>
              <div className="stat-label">Total Siswa</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalGuruKelas}</div>
              <div className="stat-label">Guru Kelas</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalGuruBidang}</div>
              <div className="stat-label">Guru Bidang</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalClasses}</div>
              <div className="stat-label">Jumlah Kelas</div>
            </div>
          </div>
        </section>
      )}

      {/* Class Filter */}
      <section className="filter-section">
        <label htmlFor="kelas-filter">Filter Kelas:</label>
        <select
          id="kelas-filter"
          value={selectedKelas}
          onChange={(e) => setSelectedKelas(e.target.value)}
        >
          <option value="ALL">Semua Kelas</option>
          {data.classes.map((kelas) => (
            <option key={kelas} value={kelas}>
              {kelas}
            </option>
          ))}
        </select>
      </section>

      {/* Students Section */}
      <section className="students-section">
        <h2>
          Data Siswa {selectedKelas !== 'ALL' && `- Kelas ${selectedKelas}`}
        </h2>
        {data.students.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>NISN</th>
                  <th>Nama</th>
                  <th>Kelas</th>
                  <th>Kontak</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((student, index) => (
                  <tr key={student.id}>
                    <td>{index + 1}</td>
                    <td>{student.nisn}</td>
                    <td>{student.nama}</td>
                    <td>{student.kelas}</td>
                    <td>{student.kontak || '-'}</td>
                    <td>
                      <button
                        className="btn-small"
                        onClick={() =>
                          setExpandedTeacher(
                            expandedTeacher === student.id ? null : student.id
                          )
                        }
                      >
                        Lihat Guru
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Tidak ada siswa untuk kelas ini.</p>
        )}

        {/* Teacher details for expanded student */}
        {expandedTeacher && (
          <StudentTeacherDetails
            studentId={expandedTeacher}
            onClose={() => setExpandedTeacher(null)}
          />
        )}
      </section>

      {/* Guru Kelas Section */}
      <section className="teachers-section">
        <h2>
          Guru Kelas {selectedKelas !== 'ALL' && `- Kelas ${selectedKelas}`}
        </h2>
        {data.guruKelas.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama</th>
                  <th>NIK</th>
                  <th>Kelas</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.guruKelas.map((guru, index) => (
                  <tr key={guru.id}>
                    <td>{index + 1}</td>
                    <td>{guru.nama}</td>
                    <td>{guru.nik}</td>
                    <td>{guru.kelas}</td>
                    <td>
                      <button
                        className="btn-small"
                        onClick={() =>
                          setExpandedTeacher(
                            expandedTeacher === guru.id ? null : guru.id
                          )
                        }
                      >
                        Lihat Siswa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Tidak ada guru kelas untuk kelas ini.</p>
        )}

        {/* Students for expanded guru kelas */}
        {expandedTeacher && (
          <TeacherStudentsDetails
            teacherId={expandedTeacher}
            onClose={() => setExpandedTeacher(null)}
          />
        )}
      </section>

      {/* Guru Bidang Section */}
      <section className="teachers-section">
        <h2>
          Guru Bidang {selectedKelas !== 'ALL' && `- Kelas ${selectedKelas}`}
        </h2>
        {data.guruBidang.length > 0 ? (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No</th>
                  <th>Nama</th>
                  <th>NIK</th>
                  <th>Kelas yang Diajar</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.guruBidang.map((guru, index) => (
                  <tr key={guru.id}>
                    <td>{index + 1}</td>
                    <td>{guru.nama}</td>
                    <td>{guru.nik}</td>
                    <td>{guru.kelas}</td>
                    <td>
                      <button
                        className="btn-small"
                        onClick={() =>
                          setExpandedTeacher(
                            expandedTeacher === guru.id ? null : guru.id
                          )
                        }
                      >
                        Lihat Siswa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Tidak ada guru bidang untuk kelas ini.</p>
        )}

        {/* Students for expanded guru bidang */}
        {expandedTeacher && (
          <TeacherStudentsDetails
            teacherId={expandedTeacher}
            onClose={() => setExpandedTeacher(null)}
          />
        )}
      </section>
    </div>
  );
}

/**
 * Component to show students for a teacher
 */
function TeacherStudentsDetails({
  teacherId,
  onClose
}: {
  teacherId: string;
  onClose: () => void;
}) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const studentList = await getStudentsForTeacher(teacherId);
        setStudents(studentList);
      } catch (error) {
        console.error('Error loading students:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [teacherId]);

  return (
    <div className="expanded-details">
      <h3>Daftar Siswa</h3>
      {loading ? (
        <p>Memuat...</p>
      ) : students.length > 0 ? (
        <ul className="student-list">
          {students.map((student) => (
            <li key={student.id}>
              {student.nama} ({student.nisn}) - {student.kelas}
            </li>
          ))}
        </ul>
      ) : (
        <p>Tidak ada siswa</p>
      )}
      <button onClick={onClose} className="btn-close">
        Tutup
      </button>
    </div>
  );
}

/**
 * Component to show teachers for a student
 */
function StudentTeacherDetails({
  studentId,
  onClose
}: {
  studentId: string;
  onClose: () => void;
}) {
  const [guruBidang, setGuruBidang] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const teachers = await getGuruBidangForStudent(studentId);
        setGuruBidang(teachers);
      } catch (error) {
        console.error('Error loading teachers:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [studentId]);

  return (
    <div className="expanded-details">
      <h3>Guru Bidang</h3>
      {loading ? (
        <p>Memuat...</p>
      ) : guruBidang.length > 0 ? (
        <ul className="teacher-list">
          {guruBidang.map((guru) => (
            <li key={guru.id}>
              {guru.nama} ({guru.nik}) - Kelas: {guru.kelas}
            </li>
          ))}
        </ul>
      ) : (
        <p>Tidak ada guru bidang</p>
      )}
      <button onClick={onClose} className="btn-close">
        Tutup
      </button>
    </div>
  );
}
