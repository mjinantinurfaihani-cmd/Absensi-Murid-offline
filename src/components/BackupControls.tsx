import React, { useState } from 'react';
import { db } from '../db';

async function exportDbPayload() {
  const teachers = await db.teachers.toArray();
  const students = await db.students.toArray();
  const attendance = await db.attendance.toArray();
  return {
    meta: { exportedAt: new Date().toISOString() },
    data: { teachers, students, attendance }
  };
}

async function importPayloadToDb(payload: any) {
  const data = payload?.data || {};
  if (!data) throw new Error('Invalid payload');
  await db.transaction('rw', db.teachers, db.students, db.attendance, async () => {
    const mapPut = async (table: any, arr: any[]) => {
      if (!Array.isArray(arr)) return;
      for (const rec of arr) {
        if (!rec || !rec.id) continue;
        const existing = await table.get(rec.id);
        if (!existing || (rec.updatedAt && existing.updatedAt && String(rec.updatedAt) >= String(existing.updatedAt))) {
          await table.put(rec);
        }
      }
    };
    await mapPut(db.teachers, data.teachers);
    await mapPut(db.students, data.students);
    await mapPut(db.attendance, data.attendance);
  });
}

export default function BackupControls({ showToast }: { showToast: (type: string, message: string) => void }) {
  const [loading, setLoading] = useState(false);

  const saveToServer = async () => {
    setLoading(true);
    try {
      const payload = await exportDbPayload();
      const res = await fetch('/api/db/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      showToast('success', 'Backup berhasil disimpan ke server');
    } catch (e: any) {
      showToast('error', e?.message || 'Gagal menyimpan backup');
    } finally {
      setLoading(false);
    }
  };

  const restoreFromServer = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db/backup');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      await importPayloadToDb(payload);
      showToast('success', 'Data berhasil dipulihkan dari server (merge)');
    } catch (e: any) {
      showToast('error', e?.message || 'Gagal memulihkan backup');
    } finally {
      setLoading(false);
    }
  };

  const deleteServerBackup = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db/backup', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      showToast('success', 'Backup server dihapus');
    } catch (e: any) {
      showToast('error', e?.message || 'Gagal menghapus backup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backup-controls">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="primary" onClick={saveToServer} disabled={loading}>Simpan ke server</button>
        <button type="button" onClick={restoreFromServer} disabled={loading}>Pulihkan dari server</button>
        <button type="button" onClick={deleteServerBackup} disabled={loading}>Hapus backup server</button>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>Gunakan fungsi ini untuk menyimpan/pulihkan data saat berpindah host atau port lokal.</p>
    </div>
  );
}
