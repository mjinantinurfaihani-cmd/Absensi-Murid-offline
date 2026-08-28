import { useEffect, useState } from 'react';
import { db } from '../db';
import type { Student, UserSession } from '../types';
import {
  createAllStudentCardsPdf,
  createSingleStudentCardPdf,
  downloadAllStudentCardsPdf,
  downloadSingleStudentCardPdf
} from '../services/studentCardPdf';

type Props = {
  user: UserSession;
  showToast: (type: 'success' | 'error' | 'info', message: string) => void;
};

export default function QrCardsPanel({ user, showToast }: Props) {
  const [students, setStudents] = useState<Student[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState('Preview kartu QR');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [kelas, setKelas] = useState('ALL');
  const assignedClasses = user.role === 'admin'
    ? null
    : user.kelas.split(',').map((value) => value.trim()).filter(Boolean);

  useEffect(() => {
    db.students
      .filter((student) => !student.deleted && (!assignedClasses || assignedClasses.includes(student.kelas)))
      .toArray()
      .then((items) => setStudents(items.sort((a, b) => a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama))));
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  function showBlob(blob: Blob, title: string) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(blob));
    setPreviewTitle(title);
  }

  const classes = [...new Set(students.map((student) => student.kelas))].sort();
  const visibleStudents = students.filter((student) =>
    (kelas === 'ALL' || student.kelas === kelas) &&
    (!query || `${student.nama} ${student.nisn}`.toLowerCase().includes(query.toLowerCase()))
  );

  async function previewOne(student: Student) {
    try {
      setBusy(true);
      showBlob(await createSingleStudentCardPdf(student), `Preview - ${student.nama}`);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Preview kartu gagal');
    } finally {
      setBusy(false);
    }
  }

  async function previewAll() {
    try {
      setBusy(true);
      showBlob(await createAllStudentCardsPdf(visibleStudents), 'Preview hasil filter - F4 portrait');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Preview PDF gagal');
    } finally {
      setBusy(false);
    }
  }

  async function downloadAll() {
    try {
      setBusy(true);
      await downloadAllStudentCardsPdf(visibleStudents);
      showToast('success', `${visibleStudents.length} kartu disatukan dalam PDF F4`);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Unduhan PDF gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="heading qr-heading">
        <div>
          <h1>Kartu QR Siswa</h1>
          <p className="muted">Kartu lanskap 85,6 x 53,98 mm. PDF gabungan memakai halaman F4 portrait 215,9 x 330 mm.</p>
        </div>
        <div className="qr-main-actions">
          <button disabled={!students.length || busy} onClick={previewAll}>Preview semua</button>
          <button className="primary" disabled={!students.length || busy} onClick={downloadAll}>
            {busy ? 'Menyiapkan PDF...' : 'Download semua PDF'}
          </button>
        </div>
      </div>

      <div className="qr-layout">
        <section className="qr-card-list">
          <div className="card list-tools qr-filters">
            <input placeholder="Cari nama atau NISN siswa" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select value={kelas} onChange={(event) => setKelas(event.target.value)}>
              <option value="ALL">Semua kelas</option>
              {classes.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          {visibleStudents.map((student) => (
            <article className="student-card-preview" key={student.id}>
              <div className="card-preview-copy">
                <small>KARTU QR ABSENSI SISWA</small>
                <strong>{student.nama}</strong>
                <span>NISN</span>
                <b>{student.nisn}</b>
              </div>
              <div className="card-preview-qr">QR</div>
              <div className="student-card-actions">
                <button disabled={busy} onClick={() => previewOne(student)}>Preview</button>
                <button className="primary" disabled={busy} onClick={() => downloadSingleStudentCardPdf(student)}>Download PDF</button>
              </div>
            </article>
          ))}
          {!visibleStudents.length && <p className="empty">Siswa tidak ditemukan.</p>}
        </section>

        <aside className="card pdf-preview-panel">
          <div className="pdf-preview-head">
            <strong>{previewTitle}</strong>
            {previewUrl && <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }}>Tutup</button>}
          </div>
          {previewUrl ? (
            <iframe title={previewTitle} src={previewUrl} className="pdf-preview-frame" />
          ) : (
            <div className="pdf-preview-empty">Pilih Preview pada kartu atau Preview semua.</div>
          )}
        </aside>
      </div>
    </>
  );
}
