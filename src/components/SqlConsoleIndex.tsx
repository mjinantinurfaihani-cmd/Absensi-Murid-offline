import React, { useState } from 'react';
import { sqlQuery, syncSqlToIndexedDB } from '../sqlStore';

type ShowToastFn = (type: 'success' | 'error' | 'info', message: string) => void;

const destructiveRegex = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i;

export default function SqlConsole({ showToast }: { showToast: ShowToastFn }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState('');
  const [running, setRunning] = useState(false);
  const [readOnly, setReadOnly] = useState(true); // non-destructive by default

  async function runQuery() {
    if (!query.trim()) {
      setResult('Masukkan query SQL.');
      return;
    }
    if (readOnly && destructiveRegex.test(query)) {
      setResult('Query diblokir dalam mode read-only. Matikan "Read-only" untuk mengeksekusi query yang mengubah data.');
      showToast('info', 'Query diblokir di mode read-only');
      return;
    }
    setRunning(true);
    setResult('Menjalankan...');
    try {
      const res = await sqlQuery(query);
      if (Array.isArray(res) || typeof res === 'object') setResult(JSON.stringify(res, null, 2));
      else setResult(String(res));
    } catch (e: any) {
      setResult(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  function clear() {
    setQuery('');
    setResult('');
  }

  async function doSync() {
    const ok = window.confirm(
      'Sinkronisasi SQL → IndexedDB akan menimpa data IndexedDB berbasis hasil SQL in-memory. Pastikan Anda memahami perubahan. Lanjutkan?'
    );
    if (!ok) return;
    try {
      await syncSqlToIndexedDB();
      showToast('success', 'Sinkronisasi SQL → IndexedDB selesai');
    } catch (e: any) {
      showToast('error', e?.message || 'Sinkronisasi gagal');
    }
  }

  return (
    <section className="card form">
      <h2>SQL Console (Ad-hoc)</h2>
      <p className="muted">Jalankan query SQL ad-hoc terhadap tabel in-memory (students, teachers). Hasil tidak otomatis disimpan kembali ke IndexedDB kecuali Anda menekan "Sync SQL → IndexedDB".</p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
        <span>Read-only (non-destructive) — default: ON</span>
      </label>

      <label>
        Query
        <textarea
          style={{ width: '100%', minHeight: 120 }}
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="primary" onClick={() => void runQuery()} disabled={running}>{running ? 'Menjalankan...' : 'Jalankan'}</button>
        <button onClick={clear} type="button">Bersihkan</button>
        <button onClick={() => void doSync()} type="button">Sync SQL → IndexedDB</button>
      </div>
      <div id="sql-result" style={{ marginTop: 12, maxHeight: 280, overflow: 'auto', background: '#fafafa', padding: 8, borderRadius: 8, border: '1px solid #e6efe6', whiteSpace: 'pre-wrap' }}>{result}</div>
    </section>
  );
}
