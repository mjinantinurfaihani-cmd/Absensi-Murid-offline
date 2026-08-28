export type Role='admin'|'guru'|'guru bidang';
export type SoundMode='VOICE'|'BEEP'|'MUTE';
export type ToastType='success'|'error'|'info';
export type ToastAnimation='pop'|'slide-right'|'slide-down'|'bounce'|'fade'|'shake'|'glow'|'flip'|'pulse'|'zoom'|'rotate'|'float';
export interface Teacher {id:string; nama:string; nik:string; role:Role; kelas:string; password:string; deviceId?:string; deleted?:boolean|number; updatedAt:string; synced:number;}
export interface Student {id:string; nisn:string; nama:string; kelas:string; kontak:string; deviceId?:string; deleted?:boolean|number; updatedAt:string; synced:number;}
export interface Attendance {id:string; studentId:string; tanggal:string; jamMasuk:string; jamPulang:string; status:'HADIR'|'SAKIT'|'IZIN'|'ALPA'|'TERLAMBAT'; ownerId?:string; ownerRole?:Role; deviceId?:string; deleted?:boolean|number; updatedAt:string; synced:number;}
export interface AttendanceConflict {key:string;studentId:string;tanggal:string;records:Attendance[];participants?:string[];confirmedBy?:string[];confirmedAt?:string;resolved?:boolean;}
export interface UserSession {id:string;nama:string;role:Role;kelas:string;}
