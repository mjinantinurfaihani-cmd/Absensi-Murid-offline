import type {Student, Teacher} from './types';
import {db} from './db';

let alasql: any = null;
let ready = false;

async function ensureAlasql() {
  if (alasql) return alasql;
  // dynamic import to avoid build-time errors if package not installed yet
  const mod = await import('alasql');
  alasql = (mod as any).default || mod;
  return alasql;
}

export async function initSqlStore() {
  const a = await ensureAlasql();
  // create tables in memory
  try {
    a('CREATE TABLE IF NOT EXISTS students (id STRING, nisn STRING, nama STRING, kelas STRING, kontak STRING, deviceId STRING, deleted BOOLEAN, synced NUMBER, updatedAt STRING)');
    a('CREATE TABLE IF NOT EXISTS teachers (id STRING, nama STRING, nik STRING, password STRING, role STRING, kelas STRING, deviceId STRING, deleted BOOLEAN, synced NUMBER, updatedAt STRING)');
  } catch (e) {
    console.warn('Alasql create table failed', e);
  }

  // initial sync from IndexedDB
  await syncIndexedDBToSql();

  // hook db changes to keep SQL in sync
  try {
    db.students.hook('creating', (_primKey, obj) => { insertOrReplaceStudent(obj).catch(console.error); });
    db.students.hook('updating', (_mods, primKey) => { db.students.get(primKey).then(s => s && insertOrReplaceStudent(s)).catch(console.error); });
    db.students.hook('deleting', (primKey) => { removeStudentFromSql(String(primKey)).catch(console.error); });

    db.teachers.hook('creating', (_primKey, obj) => { insertOrReplaceTeacher(obj).catch(console.error); });
    db.teachers.hook('updating', (_mods, primKey) => { db.teachers.get(primKey).then(t => t && insertOrReplaceTeacher(t)).catch(console.error); });
    db.teachers.hook('deleting', (primKey) => { removeTeacherFromSql(String(primKey)).catch(console.error); });
  } catch (e) {
    // if hooks already exist or adding fails, just log
    console.warn('Failed to attach dexie hooks for sql store', e);
  }

  ready = true;
  return true;
}

export async function syncIndexedDBToSql() {
  const a = await ensureAlasql();
  // clear existing
  try {
    a('DELETE FROM students');
    a('DELETE FROM teachers');
  } catch (e) { /* ignore */ }

  const students: Student[] = await db.students.toArray();
  for (const s of students) {
    await insertOrReplaceStudent(s);
  }
  const teachers: Teacher[] = await db.teachers.toArray();
  for (const t of teachers) {
    await insertOrReplaceTeacher(t);
  }
}

export async function syncSqlToIndexedDB() {
  const a = await ensureAlasql();
  const students: Student[] = (a('SELECT * FROM students') || []).map(normalizeStudentRow);
  const teachers: Teacher[] = (a('SELECT * FROM teachers') || []).map(normalizeTeacherRow);
  if (Array.isArray(students) && students.length) {
    await db.students.bulkPut(students.map(s => ({...s, deleted: Boolean(s.deleted)})));
  }
  if (Array.isArray(teachers) && teachers.length) {
    await db.teachers.bulkPut(teachers.map(t => ({...t, deleted: Boolean(t.deleted)})));
  }
}

function normalizeStudentRow(row: Partial<Student> | null | undefined): Student {
  const record = row ?? {} as Partial<Student>;
  return {
    id: String(record.id ?? ''),
    nisn: String(record.nisn ?? ''),
    nama: String(record.nama ?? ''),
    kelas: String(record.kelas ?? ''),
    kontak: String(record.kontak ?? ''),
    deviceId: typeof record.deviceId === 'string' ? record.deviceId : undefined,
    deleted: Boolean(record.deleted),
    synced: Number(record.synced ?? 0),
    updatedAt: String(record.updatedAt ?? new Date().toISOString())
  };
}

function normalizeTeacherRow(row: Partial<Teacher> | null | undefined): Teacher {
  const record = row ?? {} as Partial<Teacher>;
  return {
    id: String(record.id ?? ''),
    nama: String(record.nama ?? ''),
    nik: String(record.nik ?? ''),
    password: String(record.password ?? ''),
    role: (record.role === 'guru' || record.role === 'guru bidang' || record.role === 'admin') ? record.role : 'guru',
    kelas: String(record.kelas ?? 'SEMUA'),
    deviceId: typeof record.deviceId === 'string' ? record.deviceId : undefined,
    deleted: Boolean(record.deleted),
    synced: Number(record.synced ?? 0),
    updatedAt: String(record.updatedAt ?? new Date().toISOString())
  };
}

async function insertOrReplaceStudent(s: Student) {
  const a = await ensureAlasql();
  const safe = normalizeStudentRow(s);
  try { a('DELETE FROM students WHERE id = ?', [safe.id]); } catch (e) {}
  try {
    a('INSERT INTO students VALUES(?,?,?,?,?,?,?,?,?)', [safe.id, safe.nisn, safe.nama, safe.kelas, safe.kontak||'', safe.deviceId||'', Boolean(safe.deleted), Number(safe.synced||0), safe.updatedAt||new Date().toISOString()]);
  } catch (e) { console.warn('SQL insert student failed', e); }
}

async function removeStudentFromSql(id: string) {
  const a = await ensureAlasql();
  try { a('DELETE FROM students WHERE id = ?', [id]); } catch (e) { console.warn('SQL delete student failed', e); }
}

async function insertOrReplaceTeacher(t: Teacher) {
  const a = await ensureAlasql();
  const safe = normalizeTeacherRow(t);
  try { a('DELETE FROM teachers WHERE id = ?', [safe.id]); } catch (e) {}
  try {
    a('INSERT INTO teachers VALUES(?,?,?,?,?,?,?,?,?,?)', [safe.id, safe.nama, safe.nik||'', safe.password||'', safe.role||'', safe.kelas||'', safe.deviceId||'', Boolean(safe.deleted), Number(safe.synced||0), safe.updatedAt||new Date().toISOString()]);
  } catch (e) { console.warn('SQL insert teacher failed', e); }
}

async function removeTeacherFromSql(id: string) {
  const a = await ensureAlasql();
  try { a('DELETE FROM teachers WHERE id = ?', [id]); } catch (e) { console.warn('SQL delete teacher failed', e); }
}

export async function sqlQuery(query: string, params?: any[]) {
  const a = await ensureAlasql();
  try { return a(query, params || []); } catch (e) { console.warn('SQL query failed', e); return []; }
}

export async function getStudentsFromSql(): Promise<Student[]> {
  const a = await ensureAlasql();
  return (a('SELECT * FROM students') || []).map(normalizeStudentRow);
}
export async function getTeachersFromSql(): Promise<Teacher[]> {
  const a = await ensureAlasql();
  return (a('SELECT * FROM teachers') || []).map(normalizeTeacherRow);
}

export default {
  initSqlStore,
  syncIndexedDBToSql,
  syncSqlToIndexedDB,
  sqlQuery,
  getStudentsFromSql,
  getTeachersFromSql
};
