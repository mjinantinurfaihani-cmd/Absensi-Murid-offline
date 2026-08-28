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
  const students: Student[] = a('SELECT * FROM students');
  const teachers: Teacher[] = a('SELECT * FROM teachers');
  if (Array.isArray(students) && students.length) {
    await db.students.bulkPut(students.map(s => ({...s, deleted: Boolean(s.deleted)})));
  }
  if (Array.isArray(teachers) && teachers.length) {
    await db.teachers.bulkPut(teachers.map(t => ({...t, deleted: Boolean(t.deleted)})));
  }
}

async function insertOrReplaceStudent(s: Student) {
  const a = await ensureAlasql();
  // delete existing then insert
  try { a('DELETE FROM students WHERE id = ?', [s.id]); } catch (e) {}
  try {
    a('INSERT INTO students VALUES(?,?,?,?,?,?,?,?,?)', [s.id, s.nisn, s.nama, s.kelas, s.kontak||'', s.deviceId||'', Boolean(s.deleted), Number(s.synced||0), s.updatedAt||new Date().toISOString()]);
  } catch (e) { console.warn('SQL insert student failed', e); }
}

async function removeStudentFromSql(id: string) {
  const a = await ensureAlasql();
  try { a('DELETE FROM students WHERE id = ?', [id]); } catch (e) { console.warn('SQL delete student failed', e); }
}

async function insertOrReplaceTeacher(t: Teacher) {
  const a = await ensureAlasql();
  try { a('DELETE FROM teachers WHERE id = ?', [t.id]); } catch (e) {}
  try {
    a('INSERT INTO teachers VALUES(?,?,?,?,?,?,?,?,?,?)', [t.id, t.nama, t.nik||'', t.password||'', t.role||'', t.kelas||'', t.deviceId||'', Boolean(t.deleted), Number(t.synced||0), t.updatedAt||new Date().toISOString()]);
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
  return a('SELECT * FROM students');
}
export async function getTeachersFromSql(): Promise<Teacher[]> {
  const a = await ensureAlasql();
  return a('SELECT * FROM teachers');
}

export default {
  initSqlStore,
  syncIndexedDBToSql,
  syncSqlToIndexedDB,
  sqlQuery,
  getStudentsFromSql,
  getTeachersFromSql
};
