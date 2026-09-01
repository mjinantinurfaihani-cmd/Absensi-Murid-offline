const fs = require('fs');
const path = 'd:\\SDN 268 PANYILEUKAN\\eksperimen\\absensi-siswa-offline-https-typescript-fixed\\absensi-siswa-offline\\src\\App.tsx';
const oldText = "const t=await db.teachers.where('nik').equals(nik.trim()).first();if(!t||t.deleted||t.password!==password){showToast('error','NIK atau kata sandi tidak sesuai');notify('Login gagal',true);return}const storedRole=String(t.role||'').trim().toLowerCase();const teacherClasses=t.kelas.split(',').map(value=>value.trim()).filter(Boolean);const effectiveRole=storedRole==='guru bidang'?'guru bidang':storedRole==='admin'?'admin':'guru';";
const newText = "const normalizedNik=nik.trim();let teacher=await db.teachers.where('nik').equals(normalizedNik).first();if(!teacher){try{teacher=await fetchTeacherByNik(normalizedNik);if(teacher){await db.teachers.put({...teacher,synced:1,updatedAt:teacher.updatedAt||new Date().toISOString()});}}catch(error){console.warn('Login cloud fallback failed',error);}}if(!teacher||teacher.deleted||teacher.password!==password){showToast('error','NIK atau kata sandi tidak sesuai');notify('Login gagal',true);return}const storedRole=String(teacher.role||'').trim().toLowerCase();const teacherClasses=String(teacher.kelas??'').split(',').map(value=>value.trim()).filter(Boolean);const effectiveRole=storedRole==='guru bidang'||storedRole==='admin'||storedRole==='guru'?storedRole:'guru';";
const content = fs.readFileSync(path, 'utf8');
if (!content.includes(oldText)) {
  console.error('Old login snippet not found.');
  process.exit(1);
}
fs.writeFileSync(path, content.replace(oldText, newText));
console.log('Login fallback patch applied.');
