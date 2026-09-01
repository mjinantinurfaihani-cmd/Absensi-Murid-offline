from pathlib import Path

path = Path(r'd:\SDN 268 PANYILEUKAN\eksperimen\absensi-siswa-offline-https-typescript-fixed\absensi-siswa-offline\src\App.tsx')
text = path.read_text(encoding='utf-8')
old = "const t=await db.teachers.where('nik').equals(nik.trim()).first();if(!t||t.deleted||t.password!==password){showToast('error','NIK atau kata sandi tidak sesuai');notify('Login gagal',true);return}const storedRole=String(t.role||'').trim().toLowerCase();const teacherClasses=t.kelas.split(',').map(value=>value.trim()).filter(Boolean);const effectiveRole=storedRole==='guru bidang'?'guru bidang':storedRole==='admin'?'admin':'guru';"
new = "const normalizedNik=nik.trim();let teacher=await db.teachers.where('nik').equals(normalizedNik).first();if(!teacher){try{teacher=await fetchTeacherByNik(normalizedNik);if(teacher){await db.teachers.put({...teacher,synced:1,updatedAt:teacher.updatedAt||new Date().toISOString()});}}catch(error){console.warn('Login cloud fallback failed',error);}}if(!teacher||teacher.deleted||teacher.password!==password){showToast('error','NIK atau kata sandi tidak sesuai');notify('Login gagal',true);return}const storedRole=String(teacher.role||'').trim().toLowerCase();const teacherClasses=String(teacher.kelas??'').split(',').map(value=>value.trim()).filter(Boolean);const effectiveRole=storedRole==='guru bidang'||storedRole==='admin'||storedRole==='guru'?storedRole:'guru';"
if old not in text:
    raise SystemExit('Old login snippet was not found.')
updated = text.replace(old, new, 1)
path.write_text(updated, encoding='utf-8')
print('Login snippet updated successfully.')
