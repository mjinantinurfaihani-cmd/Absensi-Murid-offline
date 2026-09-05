import Dexie,{type Table} from 'dexie';
import type {Teacher,Student,Attendance} from './types';
import {isApplyingCloudData,publishStudent,publishTeacher,removePublicStudent,removePublicTeacher,removePublicStudentAttendanceTrace,removePublicTeacherAttendanceTrace} from './firebaseStore';
class AbsensiDB extends Dexie {teachers!:Table<Teacher,string>;students!:Table<Student,string>;attendance!:Table<Attendance,string>;constructor(){super('absensi_offline_db');this.version(1).stores({teachers:'id,&nik,role,kelas,deleted,synced,updatedAt',students:'id,&nisn,kelas,deleted,synced,updatedAt',attendance:'id,studentId,tanggal,status,synced,updatedAt'});this.version(2).stores({teachers:'id,&nik,role,kelas,deleted,synced,updatedAt',students:'id,&nisn,kelas,deleted,synced,updatedAt',attendance:'id,studentId,tanggal,status,ownerId,synced,updatedAt'});for(const table of [this.teachers,this.students,this.attendance]){table.hook('creating',(_key,record)=>{const value=record as Teacher|Student|Attendance;value.deviceId??=deviceId;if(typeof value.deleted==='number')value.deleted=Boolean(value.deleted)});table.hook('updating',(changes)=>{const value=changes as Partial<Teacher>|Partial<Student>|Partial<Attendance>;value.deviceId??=deviceId;if(typeof value.deleted==='number')value.deleted=Boolean(value.deleted);if(value.deleted){if('nisn' in value)value.nisn=undefined;if('nik' in value)value.nik=undefined}})}}}
export const deviceId=localStorage.getItem('deviceId')||crypto.randomUUID();localStorage.setItem('deviceId',deviceId);
export const db=new AbsensiDB();
db.teachers.hook('updating',(changes)=>{const value=changes as Partial<Teacher>;if(value.deleted&&!value.updatedAt)value.updatedAt=new Date().toISOString()});
db.students.hook('creating',(_key,student)=>{if(!isApplyingCloudData())void publishStudent(student as Student).catch(error=>console.warn('Gagal menyimpan siswa ke Firebase',error));});
db.students.hook('updating',(_changes,primaryKey)=>{if(!isApplyingCloudData())void db.students.get(primaryKey).then(student=>{if(student)void publishStudent(student).catch(error=>console.warn('Gagal memperbarui siswa di Firebase',error));}).catch(error=>console.warn('Gagal membaca siswa setelah perubahan',error));});
db.students.hook('deleting',primaryKey=>{if(!isApplyingCloudData())void removePublicStudent(String(primaryKey)).catch(error=>console.warn('Gagal menghapus siswa di Firebase',error));});
db.teachers.hook('creating',(_key,teacher)=>{if(!isApplyingCloudData())void publishTeacher(teacher as Teacher).catch(error=>console.warn('Gagal menyimpan guru ke Firebase',error));});
db.teachers.hook('updating',(_changes,primaryKey)=>{if(!isApplyingCloudData())void db.teachers.get(primaryKey).then(teacher=>{if(teacher)void publishTeacher(teacher).catch(error=>console.warn('Gagal memperbarui guru di Firebase',error));}).catch(error=>console.warn('Gagal membaca guru setelah perubahan',error));});
db.teachers.hook('deleting',primaryKey=>{if(!isApplyingCloudData())void removePublicTeacher(String(primaryKey)).catch(error=>console.warn('Gagal menghapus guru di Firebase',error));});
export async function hardDeleteStudent(id:string, confirmDelete = false) {
  if (confirmDelete && !window.confirm('Apakah anda yakin ingin menghapus siswa ini secara permanen?')) {
    throw new Error('Penghapusan siswa dibatalkan');
  }
  const record = await db.students.get(id);
  if (!record) return;
  await db.transaction('rw', db.students, db.attendance, async () => {
    await db.attendance.where('studentId').equals(id).delete();
    await db.students.delete(id);
  });
  await Promise.allSettled([
    removePublicStudent(id),
    removePublicStudentAttendanceTrace(id)
  ]);
}
export async function hardDeleteTeacher(id:string, confirmDelete = false) {
  if (confirmDelete && !window.confirm('Apakah anda yakin ingin menghapus guru ini secara permanen?')) {
    throw new Error('Penghapusan guru dibatalkan');
  }
  const record = await db.teachers.get(id);
  if (!record) return;
  await db.transaction('rw', db.teachers, db.attendance, async () => {
    await db.attendance.where('ownerId').equals(id).delete();
    await db.teachers.delete(id);
  });
  await Promise.allSettled([
    removePublicTeacher(id),
    removePublicTeacherAttendanceTrace(id)
  ]);
}
export async function softDeleteStudent(id:string, confirmDelete = false) {
  if (confirmDelete && !window.confirm('Apakah anda yakin ingin menghapus siswa tersebut')) {
    throw new Error('Penghapusan siswa dibatalkan');
  }
  const record = await db.students.get(id);
  if (!record) return;
  await db.students.delete(id);
}
export async function softDeleteTeacher(id:string, confirmDelete = false) {
  if (confirmDelete && !window.confirm('Apakah anda yakin ingin menghapus guru tersebut')) {
    throw new Error('Penghapusan guru dibatalkan');
  }
  const record = await db.teachers.get(id);
  if (!record) return;
  await db.teachers.delete(id);
}
export async function seed(){if(await db.teachers.count())return;const baseTimestamp='2000-01-01T00:00:00.000Z';await db.teachers.bulkAdd([{id:'admin-001',nama:'Administrator',nik:'admin',password:'admin123',role:'admin',kelas:'SEMUA',deviceId,deleted:false,synced:0,updatedAt:baseTimestamp},{id:'guru-001',nama:'Guru Kelas 4A',nik:'1987001',password:'123456',role:'guru',kelas:'4A',deviceId,deleted:false,synced:0,updatedAt:baseTimestamp}]);await db.students.bulkAdd([{id:'s-001',nisn:'100001',nama:'Budi Santoso',kelas:'4A',kontak:'',deviceId,deleted:false,synced:0,updatedAt:baseTimestamp},{id:'s-002',nisn:'100002',nama:'Ani Putri',kelas:'4A',kontak:'',deviceId,deleted:false,synced:0,updatedAt:baseTimestamp},{id:'s-003',nisn:'100003',nama:'Deni Pratama',kelas:'4B',kontak:'',deviceId,deleted:false,synced:0,updatedAt:baseTimestamp}]);}
