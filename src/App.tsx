function StudentsPage({user,showToast}:any){const[refreshKey,setRefreshKey]=useState(0);return <><StudentList key={refreshKey} user={user} showToast={showToast}/>{user.role==='admin'&&<div className="heading-actions"><button className="danger" onClick={async()=>{await deleteAllStudents(showToast);setRefreshKey(value=>value+1)}}>Hapus Semua Data Siswa</button></div>}</>}
async function deleteAllStudents(showToast:any){if(!window.confirm('Apakah anda yakin ingin menghapus semua data siswa?'))return;const students=await db.students.filter(student=>!student.deleted).toArray();if(!students.length){showToast('info','Tidak ada data siswa untuk dihapus');return}await db.students.bulkDelete(students.map(student=>student.id));showToast('success','Semua data siswa berhasil dihapus')}
import{useEffect,useMemo,useRef,useState,useImperativeHandle,forwardRef}from'react';import{BrowserMultiFormatReader}from'@zxing/browser';import*as XLSX from'xlsx';import{saveAs}from'file-saver';import{db,seed,softDeleteStudent,softDeleteTeacher}from'./db';import type{Attendance,AttendanceConflict,SoundMode,Student,Teacher,UserSession}from'./types';import { getStudentsFromSql, getTeachersFromSql, sqlQuery, syncSqlToIndexedDB } from './sqlStore';import{AnimatedToast,PresetToolbar,useToast,type PresetId}from'./toast';import{notify,playGlitchSound}from'./notify';import{confirmAttendanceConflict,syncAdminDirectoryData,syncAll}from'./sync';import{downloadTemplate,exportAttendanceSnapshot,exportStudents,exportTeachers,importStudents,importTeachers}from'./excel';import QrCardsPanel from './components/QrCardsPanel';
import SqlConsole from './components/SqlConsole';
import InfobipMetrics from './components/InfobipMetrics';
import{loadPublicData,publishInitialData}from'./firebaseStore';
import BackupControls from './components/BackupControls';
import{exportAttendanceReport}from'./excel';
import{sendAttendanceInfobip}from'./infobip';
type DeliveryResultLike={sent:boolean;skipped?:boolean;messageId?:string;error?:string};
const deviceId=localStorage.getItem('deviceId')||crypto.randomUUID();localStorage.setItem('deviceId',deviceId);const today=()=>new Date().toLocaleDateString('en-CA');const uid=()=>crypto.randomUUID();const time=()=>new Date().toTimeString().slice(0,8);
type InfobipStatus='checking'|'active'|'inactive';
function useInfobipStatus(){const[status,setStatus]=useState<InfobipStatus>('checking');const[message,setMessage]=useState('Memeriksa konfigurasi...');const refresh=async()=>{setStatus('checking');setMessage('Memeriksa konfigurasi...');try{const response=await fetch('/api/health',{headers:{'Cache-Control':'no-cache'}});if(!response.ok)throw new Error('Health check gagal');const data=await response.json() as {infobipConfigured?:boolean};const active=Boolean(data.infobipConfigured);setStatus(active?'active':'inactive');setMessage(active?'Aktif dan siap kirim pesan.':'Belum aktif — atur INFOBIP_API_KEY dan INFOBIP_WHATSAPP_FROM di server.');return active}catch{setStatus('inactive');setMessage('Tidak dapat menghubungi server. Pastikan server HTTPS sedang aktif.');return false}};useEffect(()=>{void refresh();},[]);return{status,message,refresh}};
const ownsAttendance=(record:Attendance,user:UserSession)=>user.role==='admin'||record.ownerId===user.id||(record.ownerId===undefined&&record.deviceId===deviceId);
function PasswordField({value,onChange,placeholder='Kata sandi'}:{value:string;onChange:(value:string)=>void;placeholder?:string}){const[visible,setVisible]=useState(false);return <span className="password-field"><input type={visible?'text':'password'} value={value} placeholder={placeholder} onChange={event=>onChange(event.target.value)}/><button type="button" className="password-toggle" aria-label={visible?'Sembunyikan password':'Tampilkan password'} title={visible?'Sembunyikan password':'Tampilkan password'} onClick={()=>setVisible(!visible)}>{visible?'◉':'◌'}</button></span>}
const attendanceStatusLabel=(status:Attendance['status'])=>status==='IZIN'?'Ijin':status==='TERLAMBAT'?'Hadir':status.charAt(0)+status.slice(1).toLowerCase();
function getTeacherMismatchAlert(conflict:AttendanceConflict,students:Record<string,{nama:string;kelas:string}>){const student=students[conflict.studentId];if(!student)return null;const classRecord=conflict.records.find(record=>record.ownerRole==='guru');const subjectRecord=conflict.records.find(record=>record.ownerRole==='guru bidang');if(!classRecord||!subjectRecord||classRecord.status===subjectRecord.status)return null;return `PERBEDAAN KEHADIRAN: Siswa ${student.nama} (Kelas ${student.kelas}) – Guru Kelas: ${attendanceStatusLabel(classRecord.status)} | Guru Bidang: ${attendanceStatusLabel(subjectRecord.status)}.`;}
function AttendanceChart(){const user=JSON.parse(localStorage.getItem('session')||'null') as UserSession;const[students,setStudents]=useState<Student[]>([]);const[attendance,setAttendance]=useState<Attendance[]>([]);const[query,setQuery]=useState('');const[kelas,setKelas]=useState('ALL');useEffect(()=>{Promise.all([db.students.filter(s=>!s.deleted).toArray(),db.attendance.toArray()]).then(([s,a])=>{setStudents(s.sort((x,y)=>x.nama.localeCompare(y.nama)));setAttendance(a)})},[]);const start=new Date();start.setHours(0,0,0,0);start.setMonth(start.getMonth()-5,1);const startKey=start.toLocaleDateString('en-CA');const endKey=today();const assignedClasses=user.role==='admin'?null:user.kelas.split(',').map((value:string)=>value.trim()).filter(Boolean);const classes=[...new Set(students.map(s=>s.kelas))].sort();const data=students.filter(s=>(!assignedClasses||assignedClasses.includes(s.kelas))&&(kelas==='ALL'||s.kelas===kelas)&&(!query||`${s.nama} ${s.nisn}`.toLowerCase().includes(query.toLowerCase()))).map(student=>{const records=attendance.filter(row=>row.studentId===student.id&&row.tanggal>=startKey&&row.tanggal<=endKey);return{student,values:[records.filter(r=>r.status==='HADIR'||r.status==='TERLAMBAT').length,records.filter(r=>r.status==='SAKIT').length,records.filter(r=>r.status==='IZIN').length,records.filter(r=>r.status==='ALPA').length]}});const labels=['Hadir','Sakit','Izin','Alpa'];const colors=['#16a34a','#0284c7','#eab308','#dc2626'];const totals=data.reduce((result,item)=>result.map((value,index)=>value+item.values[index]),[0,0,0,0]);const total=totals.reduce((sum,value)=>sum+value,0);const slices=totals.reduce<{start:number;end:number;label:string;value:number;color:string}[]>((result,value,index)=>{const startValue=result.at(-1)?.end||0;return[...result,{start:startValue,end:startValue+(total?value/total*100:0),label:labels[index],value,color:colors[index]}]},[]);const pieBackground=total?`conic-gradient(${slices.map(slice=>`${slice.color} ${slice.start}% ${slice.end}%`).join(',')})`:'conic-gradient(#d7e7ee 0 100%)';function download(){const workbook=XLSX.utils.book_new();const summary=totals.map((value,index)=>({Status:labels[index],Jumlah:value,Persentase:total?`${((value/total)*100).toFixed(2)}%`:'0.00%'}));const details=data.flatMap(item=>item.values.map((value,index)=>({NISN:item.student.nisn,Nama:item.student.nama,Kelas:item.student.kelas,Status:labels[index],Jumlah:value})));XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(summary),'Ringkasan Grafik');XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(details),'Rincian Siswa');const array=XLSX.write(workbook,{bookType:'xlsx',type:'array'});saveAs(new Blob([array],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Grafik_Kehadiran_${today()}.xlsx`)}return <><div className="heading"><div><h1>Grafik Kehadiran</h1><p className="muted">Rekap pie chart per status selama enam bulan terakhir.</p></div><button className="primary" onClick={download} disabled={!data.length}>Download grafik XLSX</button></div><section className="card list-tools"><input placeholder="Cari nama atau NISN" value={query} onChange={e=>setQuery(e.target.value)}/><select value={kelas} onChange={e=>setKelas(e.target.value)}><option value="ALL">Semua kelas</option>{classes.map(value=><option key={value}>{value}</option>)}</select></section><section className="card chart-scroll"><div className="chart-legend">{slices.map(slice=><span key={slice.label}><i style={{background:slice.color}}/>{slice.label}: {slice.value} ({total?((slice.value/total)*100).toFixed(1):'0.0'}%)</span>)}</div><div className="attendance-pie-layout"><div className="attendance-pie" style={{background:pieBackground}} role="img" aria-label="Pie chart status kehadiran"/><div className="attendance-pie-total"><strong>{total}</strong><span>Total absensi</span></div></div>{!data.length&&<p className="empty">Data grafik tidak ditemukan.</p>}</section></>}
export default function App(){const[user,setUser]=useState<UserSession|null>(()=>JSON.parse(localStorage.getItem('session')||'null'));const[ready,setReady]=useState(false);const[conflicts,setConflicts]=useState<AttendanceConflict[]>([]);const[feedback,setFeedback]=useState('');const[fading,setFading]=useState<string|null>(null);const{toast,showToast,closeToast}=useToast();const[conflictDebugEnabled,setConflictDebugEnabled]=useState(()=>localStorage.getItem('conflictDebug')==='1');
  const[studentsMap,setStudentsMap]=useState<Record<string,{nama:string;kelas:string}>>({});
  const[studentsLoaded,setStudentsLoaded]=useState(false);
  const[bufferedConflicts,setBufferedConflicts]=useState<AttendanceConflict[]>([]);async function loadStudentsMap(){
    try{
      const arr=await db.students.toArray();
      const localMap=Object.fromEntries(arr.map(s=>[s.id,{nama:s.nama,kelas:s.kelas}]));
      setStudentsMap(localMap);
      // mark loaded even if empty — prevents indefinite buffering
      setStudentsLoaded(true);
      // flush any buffered conflicts now that students are known
      if(bufferedConflicts.length){
        try{
          const prevKeys=new Set(conflicts.map(c=>c.key));
          const assigned=getAssignedClasses(user);
          const visibleToUser=bufferedConflicts.filter(conflict=>{
            if(!user||user.role==='admin')return true;
            const student=localMap[conflict.studentId];
            if(!student)return false;
            return assigned.includes(student.kelas);
          });
          const newOnes=visibleToUser.filter(c=>!prevKeys.has(c.key));
          if(newOnes.length){
            const label=newOnes.length>1?`${newOnes.length} konflik kehadiran baru`:`1 konflik kehadiran baru`;
            showToast('info',label);
            if(typeof window!=='undefined'&&'Notification' in window){
              if(Notification.permission==='granted'){
                new Notification('Konflik Kehadiran',{body:label});
              }else if(Notification.permission!=='denied'){
                Notification.requestPermission().then(permission=>{if(permission==='granted')new Notification('Konflik Kehadiran',{body:label})});
              }
            }
          }
        }catch(_e){/* ignore */}
        setConflicts(bufferedConflicts);
        setBufferedConflicts([]);
      }
    }catch(_){
      // even if reading students failed, mark as loaded to avoid perpetual buffering
      setStudentsLoaded(true);
    }
  }
  useEffect(()=>{seed().then(()=>{setReady(true);loadStudentsMap();});const online=async()=>{const serverUrl=(localStorage.getItem('serverUrl')||'').trim();if(!serverUrl||!navigator.onLine)return;try{const result=await syncAll();const unresolved=result.conflicts.filter(conflict=>!conflict.resolved); // update state
        // compute which conflicts are visible to current user (guru kelas or guru bidang)
        const studentsArr=await db.students.toArray();
        const studentsMap=Object.fromEntries(studentsArr.map(s=>[s.id,{nama:s.nama,kelas:s.kelas}]));
        const assignedClasses=getAssignedClasses(user);
        const visibleToUser=unresolved.filter(conflict=>{
          if(!user||user.role==='admin')return true;
          const student=studentsMap[conflict.studentId];
          if(!student)return false;
          return assignedClasses.includes(student.kelas);
        });
        // determine newly appeared conflicts (avoid repeated alerts)
        try{
          const prevKeys=new Set((conflicts||[]).map(c=>c.key));
          const newOnes=visibleToUser.filter(c=>!prevKeys.has(c.key));
          if(newOnes.length){
            const label=newOnes.length>1?`${newOnes.length} konflik kehadiran baru`:`1 konflik kehadiran baru`;
            showToast('info',label);
            // browser notification (if permitted)
            if(typeof window!=='undefined'&&'Notification' in window){
              if(Notification.permission==='granted'){
                new Notification('Konflik Kehadiran', {body: label});
              }else if(Notification.permission!=='denied'){
                Notification.requestPermission().then(permission=>{if(permission==='granted')new Notification('Konflik Kehadiran',{body:label})});
              }
            }
          }
        }catch(err){/* ignore diff errors */}
        setConflicts(unresolved);
      }catch(e){showToast('error',e instanceof Error?e.message:'Sinkronisasi gagal')}};const timer=setInterval(online,5000);window.addEventListener('online',online);if(navigator.onLine)online();return()=>{clearInterval(timer);window.removeEventListener('online',online)}},[]);useEffect(()=>{localStorage.setItem('conflictDebug',conflictDebugEnabled?'1':'0')},[conflictDebugEnabled]);async function confirm(conflict:AttendanceConflict){try{const result=await confirmAttendanceConflict(conflict.key,deviceId);if(result.resolved){setFading(conflict.key);window.setTimeout(()=>{setConflicts(current=>current.filter(item=>item.key!==conflict.key));setFading(null)},350);setFeedback(`Pesan konflik kehadiran ${conflict.tanggal} sudah dikonfirmasi semua guru terkait.`)}else{setConflicts(current=>current.map(item=>item.key===conflict.key?result:item));setFeedback(`Konfirmasi Anda tersimpan. Menunggu guru lain mengonfirmasi pesan ${conflict.tanggal}.`)}}catch(error){showToast('error',error instanceof Error?error.message:'Konfirmasi gagal')}}if(!ready)return <div className="splash">Menyiapkan database lokal...</div>;if(!user)return <Login onLogin={u=>{localStorage.setItem('session',JSON.stringify(u));setUser(u)}} showToast={showToast}/>;return <><Shell user={user} logout={()=>{localStorage.removeItem('session');setUser(null)}} toast={toast} showToast={showToast} closeToast={closeToast} conflictDebugEnabled={conflictDebugEnabled} setConflictDebugEnabled={setConflictDebugEnabled}/><ConflictNotice user={user} conflicts={conflicts} fading={fading} feedback={feedback} onConfirm={confirm} onCloseFeedback={()=>setFeedback('')} debug={conflictDebugEnabled} showToast={showToast}/></>;}

function getAssignedClasses(user:UserSession|null){if(!user||user.role==='admin')return [];return user.kelas.split(',').map((value:string)=>value.trim()).filter(Boolean);}function ConflictNotice({user,conflicts,fading,feedback,onConfirm,onCloseFeedback,debug,showToast}:{user:UserSession|null;conflicts:AttendanceConflict[];fading:string|null;feedback:string;onConfirm:(conflict:AttendanceConflict)=>void;onCloseFeedback:()=>void;debug?:boolean;showToast:(type:'success'|'error'|'info',message:string)=>void}){const[students,setStudents]=useState<Record<string,{nama:string;kelas:string}>>({});const[dismissed,setDismissed]=useState<Record<string,boolean>>({});const[bufferedLocal,setBufferedLocal]=useState<AttendanceConflict[]|null>(null);useEffect(()=>{void db.students.toArray().then(items=>setStudents(Object.fromEntries(items.map(student=>[student.id,{nama:student.nama,kelas:student.kelas}]))))},[user?.id,user?.role,user?.kelas,conflicts.length]);useEffect(()=>{setDismissed({})},[user?.id,user?.role,user?.kelas,conflicts.length]);
  // Buffer incoming conflicts if students not loaded yet to avoid race-condition filter misses
  useEffect(()=>{
    const studentsLoaded = Object.keys(students).length>0;
    if(!studentsLoaded){
      // store latest conflicts until students are available
      setBufferedLocal(conflicts);
      return;
    }
    // students are loaded; if we had buffered conflicts, notify user about them
    if(bufferedLocal&&bufferedLocal.length){
      try{
        const assigned=getAssignedClasses(user);
        const visibleToUser=bufferedLocal.filter(conflict=>{
          if(!user||user.role==='admin')return true;
          const student=students[conflict.studentId];
          if(!student)return false;
          return assigned.includes(student.kelas);
        });
        if(visibleToUser.length){
          const label=visibleToUser.length>1?`${visibleToUser.length} konflik kehadiran baru`:`1 konflik kehadiran baru`;
          try{notify(label,false)}catch{}
          if(typeof window!=='undefined'&&'Notification' in window){
            if(Notification.permission==='granted')new Notification('Konflik Kehadiran',{body:label});
            else if(Notification.permission!=='denied')Notification.requestPermission().then(permission=>{if(permission==='granted')new Notification('Konflik Kehadiran',{body:label})});
          }
        }
      }catch(_e){}
      setBufferedLocal(null);
    }
  },[conflicts,students,user]);
  const assigned=getAssignedClasses(user);
  const visibleConflicts=useMemo(()=>{
    if(Object.keys(students).length===0) return [] as AttendanceConflict[];
    return conflicts.filter(conflict=>{if(!user||user.role==='admin')return true;const student=students[conflict.studentId];if(!student)return false;return assigned.includes(student.kelas)}).filter(conflict=>!dismissed[conflict.key]);
  },[assigned,conflicts,dismissed,students,user]);
  const [alertedConflicts,setAlertedConflicts]=useState<Record<string,boolean>>({});

  useEffect(()=>{
    for(const conflict of visibleConflicts){
      const key=conflict.key;
      if(alertedConflicts[key])continue;
      const message=getTeacherMismatchAlert(conflict,students);
      if(message){
        showToast('info',message);
        setAlertedConflicts(current=>({...current,[key]:true}));
      }
    }
  },[alertedConflicts,showToast,students,visibleConflicts]);

  useEffect(()=>{
    try{
      if(localStorage.getItem('conflictDebug')==='1'){
        if(debug){ console.debug('[ConflictNotice] user', user); }
        if(debug){ console.debug('[ConflictNotice] assignedClasses', assigned); }
        if(debug){ console.debug('[ConflictNotice] studentsLoaded', Object.keys(students).length); }
        if(debug){ console.debug('[ConflictNotice] allConflicts', conflicts.map(c=>c.key)); }
        if(debug){ console.debug('[ConflictNotice] visibleConflicts', visibleConflicts.map(c=>({key:c.key,studentId:c.studentId,tanggal:c.tanggal,participants:c.participants,confirmedBy:c.confirmedBy}))); }
      }
    }catch(e){console.error('Conflict debug failed',e)}
  },[visibleConflicts,assigned,students,conflicts,user,dismissed]);
  const getConflictTone=(conflict:AttendanceConflict)=>{
    const hasClassTeacher=conflict.records.some(record=>record.ownerRole==='guru');
    const hasSubjectTeacher=conflict.records.some(record=>record.ownerRole==='guru bidang');
    if(hasClassTeacher&&hasSubjectTeacher) return 'mixed';
    if(hasSubjectTeacher) return 'guru-bidang';
    if(hasClassTeacher) return 'guru-kelas';
    return 'default';
  };
  const getConflictIcon=(conflict:AttendanceConflict)=>{
    const tone=getConflictTone(conflict);
    if(tone==='guru-kelas') return '👩‍🏫';
    if(tone==='guru-bidang') return '🧑‍🏫';
    if(tone==='mixed') return '⚠️';
    return '🔔';
  };
  const getConflictLabel=(conflict:AttendanceConflict)=>{
    const tone=getConflictTone(conflict);
    if(tone==='guru-kelas') return 'Guru Kelas';
    if(tone==='guru-bidang') return 'Guru Bidang';
    if(tone==='mixed') return 'Guru Kelas & Bidang';
    return 'Kehadiran';
  };
  return <>{bufferedLocal&&bufferedLocal.length>0&&Object.keys(students).length===0&&<aside className="conflict-buffered" role="status"><p>{bufferedLocal.length} konflik tertahan hingga data siswa ter-load</p></aside>}{visibleConflicts.map(conflict=><aside key={conflict.key} className={`conflict-notice ${fading===conflict.key?'conflict-fading':''} ${getConflictTone(conflict)}`} role="alert"><div className="conflict-header"><span className="conflict-icon" aria-hidden="true">{getConflictIcon(conflict)}</span><div><strong>Perbedaan kehadiran siswa</strong><span className="conflict-role-badge">{getConflictLabel(conflict)}</span></div></div><p>{students[conflict.studentId]?.nama||conflict.studentId} pada {conflict.tanggal} memiliki status berbeda dari guru lain.</p><div className="conflict-role-list">{conflict.records.map(record=><small key={record.id} className={record.ownerRole==='guru'?'teacher-class':'teacher-subject'}>{record.ownerRole==='guru'?'Guru Kelas':'Guru Bidang'} · {record.jamMasuk} {record.status} {record.jamPulang||'-'}</small>)}</div><button className="primary" onClick={()=>{setDismissed(current=>({...current,[conflict.key]:true}));onConfirm(conflict)}}>Konfirmasi</button></aside>)}{feedback&&<aside className="conflict-feedback" role="status"><p>{feedback}</p><button className="primary" onClick={onCloseFeedback}>OK</button></aside>}</> }function Login({onLogin,showToast}:{onLogin:(u:UserSession)=>void;showToast:any}){const[role,setRole]=useState<'guru'|'guru bidang'|'admin'>('guru');const[nik,setNik]=useState('1987001');const[password,setPassword]=useState('123456');async function go(e:any){e.preventDefault();const t=await db.teachers.where('nik').equals(nik.trim()).first();if(!t||t.deleted||t.password!==password){showToast('error','NIK atau kata sandi tidak sesuai');notify('Login gagal',true);return}const storedRole=String(t.role||'').trim().toLowerCase();const teacherClasses=t.kelas.split(',').map(value=>value.trim()).filter(Boolean);const effectiveRole=storedRole==='admin'?'admin':storedRole==='guru bidang'||teacherClasses.length>1?'guru bidang':'guru';if(role!==effectiveRole){showToast('error',`Akun ini terdaftar sebagai ${effectiveRole}`);notify('Login gagal',true);return}onLogin({id:t.id,nama:t.nama,role:effectiveRole,kelas:teacherClasses.join(', ')})}return <main className="login"><section><span className="pill">PWA Offline-First</span><h1>Absensi Siswa</h1><p>Scan QR, kelola siswa, dan simpan absensi tanpa internet. Data dapat disinkronkan ke server mandiri saat jaringan tersedia.</p><ul><li>Database IndexedDB lokal</li><li>QR scanner kamera</li><li>Data guru kelas dan guru bidang</li></ul></section><form onSubmit={go} className="card login-card"><h2>Masuk</h2><div className="tabs"><button type="button" className={role==='guru'?'active':''} onClick={()=>{setRole('guru');setNik('1987001');setPassword('123456')}}>Guru kelas</button><button type="button" className={role==='guru bidang'?'active':''} onClick={()=>{setRole('guru bidang');setNik('');setPassword('')}}>Guru bidang</button><button type="button" className={role==='admin'?'active':''} onClick={()=>{setRole('admin');setNik('admin');setPassword('admin123')}}>Admin</button></div><label>NIK / Username<input value={nik} onChange={e=>setNik(e.target.value)} autoComplete="username"/></label><label>Kata sandi<PasswordField value={password} onChange={setPassword}/></label><button className="primary">Masuk Offline</button><small>{role==='guru bidang'?'Masuk menggunakan NIK dan password guru bidang yang diberikan admin.':role==='admin'?'Contoh admin: admin / admin123':'Contoh guru kelas: 1987001 / 123456'}</small></form></main>}
function Shell({user,logout,toast,showToast,closeToast,conflictDebugEnabled,setConflictDebugEnabled}:any){const[page,setPage]=useState('scan');const {status:infobipStatus,refresh}=useInfobipStatus();const nav=user.role==='admin'?['scan','siswa','guru','templates','qr','grafik','pengaturan']:['scan','siswa','templates','grafik','pengaturan'];const infobipTitle=infobipStatus==='checking'?'Memeriksa konfigurasi WhatsApp...':infobipStatus==='active'?'WhatsApp Infobip aktif':'WhatsApp Infobip belum aktif';return <><header className="top"><div><b>Absensi Siswa</b><small>{navigator.onLine?'Online':'Offline'} · {user.nama}</small></div><nav>{nav.map((n:string)=><button key={n} className={page===n?'active':''} onClick={()=>setPage(n)}>{n}</button>)}</nav><div className="header-actions"><button type="button" className={`status-pill compact ${infobipStatus}`} title={infobipTitle} onClick={()=>{void refresh();setPage('pengaturan')}} aria-label={infobipTitle}><span className="status-dot"/>{infobipStatus==='checking'?'Checking':infobipStatus==='active'?'WA Aktif':'WA Nonaktif'}</button><button className={conflictDebugEnabled?'active':''} title="Toggle conflict debug" onClick={()=>setConflictDebugEnabled((v:boolean)=>!v)}>{conflictDebugEnabled?'Debug:On':'Debug:Off'}</button><button onClick={logout}>Keluar</button></div></header><main className="container">{page==='scan'&&<Scan user={user} showToast={showToast}/>} {page==='siswa'&&<StudentsPage user={user} showToast={showToast}/>} {page==='guru'&&user.role==='admin'&&<Teachers showToast={showToast}/>} {page==='templates'&&<Templates user={user} showToast={showToast}/>} {page==='grafik'&&<AttendanceChart/>} {page === "qr" && user.role === 'admin' && (
  <QrCardsPanel
    user={user}
    showToast={showToast}
  />
)} {page==='pengaturan'&&<Settings showToast={showToast} user={user}/>}</main>{toast&&<AnimatedToast toast={toast} onClose={closeToast}/>}</>}
function ScannerBase({onScan}:{onScan:(s:string)=>void},ref:any){
  type PermissionStateEx='granted'|'denied'|'prompt'|'unsupported'|'insecure';
  const videoRef=useRef<HTMLVideoElement>(null);
  const panelRef=useRef<HTMLDivElement>(null);
  const controlsRef=useRef<any>(null);
  const mountedRef=useRef(true);
  const cameraViewRef=useRef<HTMLDivElement>(null);
  const glitchTimeoutRef=useRef<NodeJS.Timeout|null>(null);
  const[devices,setDevices]=useState<MediaDeviceInfo[]>([]);
  const[selectedDevice,setSelectedDevice]=useState(()=>localStorage.getItem('cameraDevice')||'');
  const[permission,setPermission]=useState<PermissionStateEx>(()=>window.isSecureContext?'prompt':'insecure');
  const[scanning,setScanning]=useState(false);
  const[loading,setLoading]=useState(false);
  const[status,setStatus]=useState('Periksa izin kamera untuk mulai memindai.');
  const[error,setError]=useState('');
  const[glitchActive,setGlitchActive]=useState(false);

  function stopTracks(){
    controlsRef.current?.stop?.();
    controlsRef.current=null;
    const stream=videoRef.current?.srcObject as MediaStream|null;
    stream?.getTracks().forEach(track=>track.stop());
    if(videoRef.current)videoRef.current.srcObject=null;
  }
  function stop(){stopTracks();if(mountedRef.current){setScanning(false);setLoading(false);setStatus('Kamera nonaktif.')}}

  async function inspectPermission(){
    if(!window.isSecureContext){setPermission('insecure');return'insecure' as PermissionStateEx}
    if(!navigator.mediaDevices?.getUserMedia){setPermission('unsupported');return'unsupported' as PermissionStateEx}
    try{
      const result=await navigator.permissions?.query?.({name:'camera' as PermissionName});
      if(!result){setPermission('unsupported');return'unsupported' as PermissionStateEx}
      const state=result.state as PermissionStateEx;
      setPermission(state);
      result.onchange=()=>setPermission(result.state as PermissionStateEx);
      return state;
    }catch{setPermission('unsupported');return'unsupported' as PermissionStateEx}
  }

  async function enumerate(preferred?:string){
    const cams=(await BrowserMultiFormatReader.listVideoInputDevices()).filter(d=>d.deviceId);
    setDevices(cams);
    const saved=localStorage.getItem('cameraDevice');
    const rear=cams.find(d=>/back|rear|environment|belakang|traseira|arrière/i.test(d.label));
    const chosen=(preferred&&cams.some(d=>d.deviceId===preferred)?preferred:saved&&cams.some(d=>d.deviceId===saved)?saved:rear?.deviceId)||cams[0]?.deviceId||'';
    setSelectedDevice(chosen);
    if(chosen)localStorage.setItem('cameraDevice',chosen);
    return chosen;
  }

  async function requestCameraPermission(){
    setError('');
    if(!window.isSecureContext){
      setPermission('insecure');setError('Kamera diblokir karena halaman tidak menggunakan HTTPS atau localhost.');return'';
    }
    if(!navigator.mediaDevices?.getUserMedia){
      setPermission('unsupported');setError('Browser ini tidak menyediakan API kamera. Gunakan Chrome atau Edge terbaru.');return'';
    }
    setLoading(true);setStatus('Menunggu izin kamera...');
    let temp:MediaStream|null=null;
    try{
      temp=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
      setPermission('granted');
      const current=temp.getVideoTracks()[0]?.getSettings().deviceId;
      const chosen=await enumerate(current);
      setStatus('Izin kamera diberikan. Kamera siap digunakan.');
      return chosen;
    }catch(e:any){
      const name=e?.name||'';
      if(name==='NotAllowedError'||name==='SecurityError'){
        setPermission('denied');
        setError('Izin kamera ditolak atau diblokir. Buka pengaturan situs browser, ubah Kamera menjadi Izinkan, lalu muat ulang aplikasi.');
      }else if(name==='NotFoundError'){
        setError('Tidak ada kamera yang terdeteksi pada perangkat ini.');
      }else if(name==='NotReadableError'){
        setError('Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera atau panggilan video, lalu coba lagi.');
      }else{
        setError(e?.message||'Permintaan izin kamera gagal.');
      }
      setStatus('Izin kamera belum tersedia.');return'';
    }finally{
      temp?.getTracks().forEach(track=>track.stop());
      setLoading(false);
    }
  }

  async function start(deviceId=selectedDevice){
    if(loading||scanning)return;
    setError('');setLoading(true);setStatus('Membuka kamera...');
    try{
      if(!window.isSecureContext)throw new Error('SECURE_CONTEXT_REQUIRED');
      let chosen=deviceId;
      if(permission!=='granted')chosen=await requestCameraPermission();
      if(!chosen)chosen=await enumerate();
      if(!chosen)throw new Error('NO_CAMERA');
      stopTracks();
      const reader=new BrowserMultiFormatReader();
      controlsRef.current=await reader.decodeFromConstraints({audio:false,video:{deviceId:{exact:chosen},facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},videoRef.current!,result=>{
        if(result)onScan(result.getText());
      });
      if(!mountedRef.current){controlsRef.current?.stop?.();return}
      setPermission('granted');setScanning(true);setStatus('Kamera aktif. Arahkan QR ke dalam bingkai.');
      localStorage.setItem('cameraDevice',chosen);
    }catch(e:any){
      stopTracks();setScanning(false);
      if(e?.message==='SECURE_CONTEXT_REQUIRED'){
        setPermission('insecure');setError('Akses kamera hanya diizinkan melalui HTTPS atau localhost. Jalankan npm run dev:https untuk akses dari Android/LAN.');
      }else if(e?.message==='NO_CAMERA'){
        setError('Kamera tidak ditemukan. Tekan Izinkan Kamera atau Refresh Perangkat.');
      }else if(e?.name==='NotAllowedError'){
        setPermission('denied');setError('Akses kamera diblokir browser. Ubah izin Kamera menjadi Izinkan pada pengaturan situs.');
      }else if(e?.name==='OverconstrainedError'){
        setError('Kamera yang dipilih tidak tersedia. Pilih kamera lain lalu mulai kembali.');
      }else if(e?.name==='NotReadableError'){
        setError('Kamera sedang digunakan aplikasi lain.');
      }else setError(e?.message||'Kamera gagal dibuka.');
      setStatus('Kamera gagal dibuka.');
    }finally{setLoading(false)}
  }

  function triggerGlitch(){
    if(!cameraViewRef.current)return;
    cameraViewRef.current.classList.add('glitch-trigger');
    setGlitchActive(true);
    if(glitchTimeoutRef.current)clearTimeout(glitchTimeoutRef.current);
    glitchTimeoutRef.current=setTimeout(()=>{
      if(cameraViewRef.current)cameraViewRef.current.classList.remove('glitch-trigger');
      setGlitchActive(false);
    },250);
  }

  async function changeCamera(id:string){stop();setSelectedDevice(id);localStorage.setItem('cameraDevice',id);if(id&&permission==='granted')await start(id)}
  async function refresh(){stop();setError('');if(permission!=='granted'){await requestCameraPermission();return}try{const chosen=await enumerate(selectedDevice);setStatus(chosen?'Daftar kamera diperbarui.':'Kamera tidak ditemukan.')}catch(e:any){setError(e?.message||'Gagal memperbarui kamera.')}}
  async function fullscreen(){try{await panelRef.current?.requestFullscreen?.()}catch{setError('Mode layar penuh tidak dapat diaktifkan.')}}
  function reloadForPermission(){window.location.reload()}

  useImperativeHandle(ref,()=>({triggerGlitch}),[]);

  useEffect(()=>{
    mountedRef.current=true;
    inspectPermission().then(async state=>{if(state==='granted')await enumerate()});
    const deviceChange=()=>permission==='granted'&&enumerate(selectedDevice);
    navigator.mediaDevices?.addEventListener?.('devicechange',deviceChange);
    return()=>{mountedRef.current=false;navigator.mediaDevices?.removeEventListener?.('devicechange',deviceChange);stopTracks()};
  },[]);

  const permissionLabel={granted:'Izin diberikan',denied:'Izin diblokir',prompt:'Izin belum diminta',unsupported:'Status izin tidak tersedia',insecure:'Koneksi tidak aman'}[permission];
  return <div ref={panelRef} className="scanner scanner-panel">
    <div className={`permission-panel permission-${permission}`}>
      <div><b>📷 Izin Kamera</b><span>{permissionLabel}</span></div>
      {permission!=='granted'&&<button className="primary" disabled={loading||permission==='insecure'} onClick={requestCameraPermission}>{loading?'Menunggu izin...':'Izinkan Kamera'}</button>}
      {permission==='denied'&&<button onClick={reloadForPermission}>Muat Ulang Setelah Izin</button>}
    </div>
    {permission==='insecure'&&<div className="secure-warning"><b>Kamera tidak dapat diizinkan melalui HTTP biasa.</b><span>Di komputer ini gunakan localhost. Untuk Android atau perangkat lain jalankan <code>npm run dev:https</code>, buka alamat HTTPS, terima sertifikat, lalu tekan Izinkan Kamera.</span></div>}
    {permission==='denied'&&<div className="permission-help"><b>Cara membuka izin yang diblokir:</b><ol><li>Tekan ikon gembok atau ikon kamera di bilah alamat.</li><li>Pilih Izin situs atau Site settings.</li><li>Ubah Kamera menjadi Izinkan atau Allow.</li><li>Kembali ke aplikasi dan tekan Muat Ulang Setelah Izin.</li></ol></div>}
    <div className="camera-toolbar">
      <label>Kamera<select value={selectedDevice} onChange={e=>changeCamera(e.target.value)} disabled={loading||permission!=='granted'}><option value="">Pilih kamera</option>{devices.map((d,i)=><option key={d.deviceId} value={d.deviceId}>{d.label||`Kamera ${i+1}`}</option>)}</select></label>
      {!scanning?<button className="primary" disabled={loading||permission!=='granted'} onClick={()=>start()}>{loading?'Membuka...':'▶ Mulai Scan'}</button>:<button className="danger" onClick={stop}>⏹ Stop</button>}
      <button disabled={loading||permission!=='granted'} onClick={refresh}>↻ Refresh Perangkat</button>
      <button onClick={fullscreen}>⛶ Layar Penuh</button>
    </div>
    <div ref={cameraViewRef} className="camera-view"><video ref={videoRef} autoPlay muted playsInline/><div className="scan-frame" aria-hidden="true"><span/><span/><span/><span/></div>{!scanning&&!loading&&<div className="camera-placeholder">{permission==='granted'?<>Tekan <b>Mulai Scan</b> untuk mengaktifkan kamera</>:<>Tekan <b>Izinkan Kamera</b> terlebih dahulu</>}</div>}{glitchActive&&<><div className="glitch-overlay"/><div className="glitch-box"><div className="glitch-text">✓ SUKSES</div></div></>}</div>
    <div className={`camera-status ${scanning?'active':error?'error':''}`}><i/> {status}</div>
    {error&&<div className="camera-error"><b>Kamera tidak siap.</b><span>{error}</span></div>}
  </div>
}
const Scanner=forwardRef(ScannerBase);
interface ScanHistoryRow extends Attendance {
  nama: string;
  nisn: string;
  kelas: string;
  comparisonStatus?: Attendance['status'];
}

function Scan({user,showToast}:any){
  const[rows,setRows]=useState<ScanHistoryRow[]>([]);
  const[classOptions,setClassOptions]=useState<string[]>([]);
  const[kelas,setKelas]=useState<string>(user.role==='guru'?user.kelas.split(',')[0].trim():'ALL');
  const[q,setQ]=useState('');
  const[mode,setMode]=useState<SoundMode>(()=>(localStorage.getItem('soundMode')as SoundMode)||'VOICE');
  const[autoDate,setAutoDate]=useState(true);
  const[selectedDate,setSelectedDate]=useState(today());
  const[teacherFilter,setTeacherFilter]=useState('ALL');
  const[teacherOptions,setTeacherOptions]=useState<Array<{id:string;nama:string;role:string;kelas:string}>>([]);
  const[manualIn,setManualIn]=useState('07:00');
  const[manualOut,setManualOut]=useState('13:00');
  const[busy,setBusy]=useState(false);
  const last=useRef({text:'',at:0});
  const scannerRef=useRef<any>(null);

  async function load(){
    const activeDate=autoDate?today():selectedDate;
    const all=await db.attendance.where('tanggal').equals(activeDate).toArray();
    const students=await db.students.toArray();
    const teachers=await db.teachers.filter(student=>!student.deleted).toArray();
    setClassOptions([...new Set(students.filter(student=>!student.deleted).map(student=>student.kelas.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})));
    setTeacherOptions(teachers.sort((a,b)=>a.nama.localeCompare(b.nama)).map(teacher=>({id:teacher.id,nama:teacher.nama,role:teacher.role,kelas:teacher.kelas})));
    const map=new Map(students.map(student=>[student.id,student]));
    const query=q.trim().toLowerCase();

    const history:ScanHistoryRow[]=all.flatMap(attendance=>{
      const student=map.get(attendance.studentId);
      if(!student||student.deleted)return[];
      return [{
        ...attendance,
        nama:student.nama,
        nisn:student.nisn,
        kelas:student.kelas
      }];
    });

    const scoped=history.filter(row=>(user.role==='guru bidang'?(user.kelas.split(',').map((value:string)=>value.trim()).includes(row.kelas)&&(kelas==='ALL'||row.kelas===kelas)):(kelas==='ALL'||row.kelas===kelas))&&(!query||row.nama.toLowerCase().includes(query)||row.nisn.toLowerCase().includes(query))&& (teacherFilter==='ALL'||row.ownerId===teacherFilter || (user.role !== 'admin' && row.ownerId===user.id)));
    if(user.role==='guru bidang'){
      const grouped=new Map<string,ScanHistoryRow[]>();
      for(const row of scoped){const group=grouped.get(row.studentId)||[];group.push(row);grouped.set(row.studentId,group)}
      setRows([...grouped.values()].map(group=>{const own=group.find(row=>ownsAttendance(row,user));const classRecord=group.find(row=>!ownsAttendance(row,user)&&row.ownerRole==='guru');return {...(own||classRecord||group[0]),comparisonStatus:own&&classRecord&&own.status!==classRecord.status?classRecord.status:undefined}}).sort((a,b)=>b.jamMasuk.localeCompare(a.jamMasuk)));
    }else setRows((user.role==='admin'?scoped:scoped.filter(row=>ownsAttendance(row,user))).sort((a,b)=>b.jamMasuk.localeCompare(a.jamMasuk)));
  }

  useEffect(()=>{if(user.role!=='admin'&&teacherFilter==='ALL'){setTeacherFilter(user.id)}},[user.id,user.role]);
  useEffect(()=>{void load()},[kelas,q,autoDate,selectedDate,teacherFilter]);

  async function scan(text:string){
    if(busy||(last.current.text===text&&Date.now()-last.current.at<3000))return;
    last.current={text,at:Date.now()};
    setBusy(true);
    try{
      const data=JSON.parse(text) as {app?:string;id?:string};
      if(data.app!=='ABSENSI-SISWA'||!data.id)throw Error('QR bukan milik aplikasi');
      const student=await db.students.get(data.id);
      if(!student||student.deleted)throw Error('Siswa tidak ditemukan');
      const activeDate=autoDate?today():selectedDate;
      const existing=await db.attendance.where('studentId').equals(student.id).filter(item=>item.tanggal===activeDate&&ownsAttendance(item,user)).first();
      if(existing)throw Error(`${student.nama} sudah absen hari ini`);
      const now=new Date();
      const terlambat=now.getHours()>7||(now.getHours()===7&&now.getMinutes()>0);
      const attendance:Attendance={
        id:uid(),studentId:student.id,tanggal:activeDate,jamMasuk:manualIn||time(),jamPulang:'',
        ownerId:user.id,ownerRole:user.role,status:terlambat?'TERLAMBAT':'HADIR',deviceId,deleted:false,updatedAt:now.toISOString(),synced:0
      };
      await db.attendance.add(attendance);
      scannerRef.current?.triggerGlitch?.();
      if(mode!=='MUTE')playGlitchSound();
      const delivery=await sendAttendanceInfobip(student,attendance,'hadir',user);
      if(!delivery.skipped){showToast(delivery.sent?'success':'error',delivery.sent?`Notifikasi hadir ${student.nama} berhasil dikirim`:`Notifikasi hadir ${student.nama} gagal: ${delivery.error}`);if(delivery.sent)showToast('success',`${student.nama} tercatat ${attendance.status.toLowerCase()}; notifikasi berhasil dikirim`)}
      if(!delivery.skipped)notify(`${student.nama}, kelas ${student.kelas}, ${attendance.status.toLowerCase()}`);
      await load();
    }catch(error:unknown){
      const message=error instanceof Error?error.message:'QR tidak valid';
      showToast('error',message);
      notify(message,true);
    }finally{setBusy(false)}
  }

  async function getScopedStudents(){
    const assigned=user.kelas.split(',').map((value:string)=>value.trim()).filter(Boolean);
    const students=await db.students.filter(student=>!student.deleted).toArray();
    return students.filter(student=>user.role==='admin'||assigned.includes(student.kelas)).filter(student=>kelas==='ALL'||student.kelas===kelas);
  }

  async function markAllPresent(){
    if(busy)return;
    setBusy(true);
    try{
      const activeDate=autoDate?today():selectedDate;
      const students=await getScopedStudents();
      const now=new Date().toISOString();
      const records:Attendance[]=[];
      for(const student of students){
        const existing=await db.attendance.where('studentId').equals(student.id).filter(item=>item.tanggal===activeDate&&ownsAttendance(item,user)).first();
        if(!existing)records.push({id:uid(),studentId:student.id,tanggal:activeDate,jamMasuk:manualIn||time(),jamPulang:'',ownerId:user.id,ownerRole:user.role,status:manualIn>'07:00'?'TERLAMBAT':'HADIR',deviceId,deleted:false,updatedAt:now,synced:0});
      }
      if(records.length)await db.attendance.bulkAdd(records);
      const deliveryResults:DeliveryResultLike[]=await Promise.all(records.map(async record=>{const student=students.find(item=>item.id===record.studentId);return student?sendAttendanceInfobip(student,record,'hadir',user):{sent:false,skipped:false,error:'Data siswa tidak ditemukan'}}));
      const skippedDeliveries=deliveryResults.filter(result=>Boolean(result.skipped)).length;
      const failedDeliveries=deliveryResults.filter(result=>!result.sent&&!result.skipped).length;
      if(skippedDeliveries&&records.length===skippedDeliveries){/* notifikasi WhatsApp belum dikonfigurasi: abaikan tanpa toast */}else if(failedDeliveries)showToast('error',`${records.length} siswa ditandai hadir, ${failedDeliveries} notifikasi gagal dikirim`);else if(records.length)showToast('success',`${records.length} siswa ditandai hadir dan notifikasinya berhasil dikirim`);else showToast('info','Tidak ada siswa baru yang ditandai hadir');await load();
    }catch(error){showToast('error',error instanceof Error?error.message:'Gagal menandai kehadiran')}finally{setBusy(false)}
  }

  async function dismissAll(){
    if(busy)return;
    setBusy(true);
    try{
      const activeDate=autoDate?today():selectedDate;
      const students=await getScopedStudents();
      const ids=new Set(students.map(student=>student.id));
      const records=await db.attendance.where('tanggal').equals(activeDate).toArray();
      const updates=records.filter(record=>ids.has(record.studentId)&&ownsAttendance(record,user)&&!record.jamPulang);
      const departureTime=manualOut||time();
      await db.transaction('rw',db.attendance,async()=>{for(const record of updates)await db.attendance.update(record.id,{jamPulang:departureTime,updatedAt:new Date().toISOString(),synced:0})});
      const allStudents=await db.students.toArray();
      const deliveryResults:DeliveryResultLike[]=await Promise.all(updates.map(async record=>{const student=allStudents.find(item=>item.id===record.studentId);return student?sendAttendanceInfobip(student,{...record,jamPulang:departureTime},'pulang',user):{sent:false,skipped:false,error:'Data siswa tidak ditemukan'}}));
      const skippedDeliveries=deliveryResults.filter(result=>Boolean(result.skipped)).length;
      const failedDeliveries=deliveryResults.filter(result=>!result.sent&&!result.skipped).length;
      if(skippedDeliveries&&updates.length===skippedDeliveries){/* notifikasi WhatsApp belum dikonfigurasi: abaikan tanpa toast */}else if(failedDeliveries)showToast('error',`${updates.length} siswa dipulangkan, ${failedDeliveries} notifikasi gagal dikirim`);else if(updates.length)showToast('success',`${updates.length} siswa dipulangkan dan notifikasinya berhasil dikirim`);else showToast('info','Tidak ada siswa yang perlu dipulangkan');await load();
    }catch(error){showToast('error',error instanceof Error?error.message:'Gagal memproses jam pulang')}finally{setBusy(false)}
  }

  async function updateStatus(row:ScanHistoryRow,status:Attendance['status']){
    const automaticStatus=status==='HADIR'&&row.jamMasuk>'07:00'?'TERLAMBAT':status;
    const attendance=ownsAttendance(row,user)
      ? {...row,status:automaticStatus,ownerId:user.id,ownerRole:user.role}
      : {...row,id:uid(),status:automaticStatus,ownerId:user.id,ownerRole:user.role,deviceId};
    if(ownsAttendance(row,user))await db.attendance.update(row.id,{status:automaticStatus,ownerId:user.id,ownerRole:user.role,updatedAt:new Date().toISOString(),synced:0});
    else await db.attendance.add({...attendance,updatedAt:new Date().toISOString(),synced:0});
    if(automaticStatus==='HADIR'||automaticStatus==='TERLAMBAT'){
      const student=await db.students.get(row.studentId);
      if(student){const delivery=await sendAttendanceInfobip(student,attendance,'hadir',user);if(!delivery.skipped)showToast(delivery.sent?'success':'error',delivery.sent?`Notifikasi hadir ${student.nama} berhasil dikirim`:`Notifikasi hadir ${student.nama} gagal: ${delivery.error}`)}
    }
    await load();
  }

  function setSound(value:SoundMode){
    setMode(value);localStorage.setItem('soundMode',value);showToast('info',`Mode suara: ${value}`);
  }

  function exportExcel(){
    const output=rows.map((row,index)=>({
      No:index+1,NISN:row.nisn,Nama:row.nama,Kelas:row.kelas,
      Hari:new Date(`${row.tanggal}T00:00:00`).toLocaleDateString('id-ID',{weekday:'long'}),Tanggal:row.tanggal,
      'Jam Masuk':row.jamMasuk,'Jam Pulang':row.jamPulang||'-',Status:row.status,
      'Hari Download':new Date().toLocaleDateString('id-ID',{weekday:'long'}),'Tanggal Download':new Date().toLocaleDateString('id-ID'),'Waktu Download':new Date().toLocaleTimeString('id-ID')
    }));
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(output),'Absensi');
    const array=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
    saveAs(new Blob([array]),`Rekap_${kelas}_${today()}.xlsx`);
    showToast('success','File Excel berhasil dibuat');
  }

  const hadir=rows.filter(row=>row.status==='HADIR').length;
  const exportScopeDate=autoDate?today():selectedDate;
  const exportScopeTeacher=teacherOptions.find(item=>item.id===teacherFilter)?.nama||'Semua Guru';
  const exportScopeClass=(user.role==='guru'?user.kelas.split(',')[0].trim():kelas)==='ALL'?'Semua Kelas':(user.role==='guru'?user.kelas.split(',')[0].trim():kelas);

  async function exportFilteredReport(mode:'date'|'class'|'teacher'){const targetDate=autoDate?today():selectedDate;const currentClass=user.role==='guru'?user.kelas.split(',')[0].trim():kelas;const exportClass=mode==='class'?(currentClass==='ALL'?'ALL':currentClass):currentClass;const exportTeacher=mode==='teacher'?teacherFilter:'ALL';const rowCount=await exportAttendanceSnapshot({date:mode==='date'?targetDate:targetDate,kelas:exportClass,teacherId:exportTeacher,teacherName:mode==='teacher'?exportScopeTeacher:'Semua Guru'});showToast('success',`Ekspor ${mode==='date'?'per tanggal':mode==='class'?'per kelas':'per guru'} berhasil: ${rowCount} baris`);} 

  return <>
    <section className="toolbar card">
      <div className="sound">
        <button className={mode==='VOICE'?'active':''} onClick={()=>setSound('VOICE')} title="Beep dan suara">🔊</button>
        <button className={mode==='BEEP'?'active':''} onClick={()=>setSound('BEEP')} title="Bunyi saja">🔔</button>
        <button className={mode==='MUTE'?'active':''} onClick={()=>setSound('MUTE')} title="Senyap">🔇</button>
        <button onClick={()=>setSound('VOICE')}>Reset suara</button>
      </div>
      {user.role==='admin'&&<button disabled={busy} onClick={async()=>{setBusy(true);try{const result=await syncAdminDirectoryData();showToast('success',`${result.students} siswa dan ${result.teachers} guru tersinkron`);await load()}catch(error:unknown){showToast('error',error instanceof Error?error.message:'Sinkronisasi gagal')}finally{setBusy(false)}}}>Sinkronkan</button>}
    </section>
    <section className="card attendance-settings">
      <label><input type="checkbox" checked={autoDate} onChange={event=>setAutoDate(event.target.checked)}/> Tanggal otomatis ({today()})</label>
      {!autoDate&&<label>Tanggal<input type="date" value={selectedDate} onChange={event=>setSelectedDate(event.target.value)}/></label>}
      <label>Jam masuk<input type="time" value={manualIn} onChange={event=>setManualIn(event.target.value)}/></label>
      <label>Jam pulang<input type="time" value={manualOut} onChange={event=>setManualOut(event.target.value)}/></label>
      <button className="primary" disabled={busy} onClick={markAllPresent}>Hadir semua siswa</button>
      <button disabled={busy} onClick={dismissAll}>Pulangkan semua siswa</button>
    </section>
    <h1>Scan QR Absensi</h1>
    <Scanner ref={scannerRef} onScan={scan}/>
    <div className="stats">
      <article><span>Hadir</span><b>{hadir}</b></article>
      <article><span>Terlambat</span><b>{rows.length-hadir}</b></article>
      <article><span>Total scan</span><b>{rows.length}</b></article>
    </div>
    <section className="card">
      <div className="filters" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'.75rem',alignItems:'end'}}>
        <label style={{display:'grid',gap:'.35rem',fontSize:'.8rem',fontWeight:700,color:'#1e3a5f'}}>
          <span>Tanggal</span>
          <input type="date" value={selectedDate} onChange={event=>setSelectedDate(event.target.value)} disabled={autoDate} />
        </label>
        <label style={{display:'grid',gap:'.35rem',fontSize:'.8rem',fontWeight:700,color:'#1e3a5f'}}>
          <span>Kelas</span>
          <select value={kelas} onChange={event=>setKelas(event.target.value)}>
            <option value="ALL">Semua Kelas</option>
            {(user.role==='guru bidang'?user.kelas.split(',').map((value:string)=>value.trim()).filter(Boolean):classOptions).map((value:string)=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label style={{display:'grid',gap:'.35rem',fontSize:'.8rem',fontWeight:700,color:'#1e3a5f'}}>
          <span>Guru</span>
          <select value={teacherFilter} onChange={event=>setTeacherFilter(event.target.value)}>
            <option value="ALL">Semua Guru</option>
            {teacherOptions.map((teacher)=><option key={teacher.id} value={teacher.id}>{teacher.nama} ({teacher.role})</option>)}
          </select>
        </label>
        <label style={{display:'grid',gap:'.35rem',fontSize:'.8rem',fontWeight:700,color:'#1e3a5f'}}>
          <span>Pencarian</span>
          <input placeholder="Cari nama / NISN" value={q} onChange={event=>setQ(event.target.value)}/>
        </label>
      </div>
      <div className="filters" style={{marginTop:'.9rem',display:'flex',gap:'.6rem',flexWrap:'wrap'}}>
        <button onClick={() => exportFilteredReport('date')}>Ekspor Per Tanggal</button>
        <button onClick={() => exportFilteredReport('class')}>Ekspor Per Kelas</button>
        <button onClick={() => exportFilteredReport('teacher')}>Ekspor Per Guru</button>
        <button className="primary" onClick={()=>exportAttendanceReport().then(n=>showToast('success',`${n} rekap siswa diekspor`)).catch((error:unknown)=>showToast('error',error instanceof Error?error.message:'Export gagal'))}>Ekspor Rekap Formal</button>
      </div>
      <table>
        <thead><tr><th>Jam</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}><td>{row.jamMasuk}</td><td>{row.nisn}</td><td>{row.nama}</td><td>{row.kelas}</td><td><select className="row-status" value={row.status==='TERLAMBAT'?'HADIR':row.status} onChange={event=>updateStatus(row,event.target.value as Attendance['status'])}><option value="HADIR">Hadir</option><option value="SAKIT">Sakit</option><option value="IZIN">Ijin</option><option value="ALPA">Alpa</option></select>{row.status==='TERLAMBAT'&&<small className="status-auto">Terlambat otomatis</small>}{row.comparisonStatus&&<small className="status-auto">Guru kelas: {attendanceStatusLabel(row.comparisonStatus)}</small>}</td></tr>)}</tbody>
      </table>
      {!rows.length&&<p className="empty">Belum ada riwayat scan.</p>}
    </section>
  </>;
}

function StudentList({user,showToast}:any){const[list,setList]=useState<Student[]>([]);const[query,setQuery]=useState('');const[kelas,setKelas]=useState('ALL');const[page,setPage]=useState(1);const[edit,setEdit]=useState<Partial<Student>>({kelas:user.role==='guru'?user.kelas:'4A'});const[open,setOpen]=useState(false);const pageSize=10;const assignedClasses=user.role==='admin'?null:user.kelas.split(',').map((value:string)=>value.trim()).filter(Boolean);const classes=[...new Set([...list.map(s=>s.kelas),edit.kelas||'4A'])].filter(value=>!assignedClasses||assignedClasses.includes(value)).sort();async function load(){
    try{
      let a = await db.students.filter(s=>!s.deleted).toArray();
      if(assignedClasses) a = a.filter(s=>assignedClasses.includes(s.kelas));
      setList(a.sort((a,b)=>a.nama.localeCompare(b.nama)));
    }catch(e){
      console.warn('Failed to load students from SQL store, falling back to IndexedDB', e);
      let a = await db.students.filter(s=>!s.deleted).toArray();
      if(assignedClasses) a = a.filter(s=>assignedClasses.includes(s.kelas));
      setList(a.sort((a,b)=>a.nama.localeCompare(b.nama)));
    }
  }
  useEffect(()=>{void load()},[]);useEffect(()=>{setPage(1)},[query,kelas]);function openNew(){setEdit({kelas:user.role==='guru'?user.kelas:'4A'});setOpen(true)}function openEdit(student:Student){setEdit(student);setOpen(true)}async function save(e:any){e.preventDefault();if(!edit.nisn||!edit.nama)return;const old=edit.id?await db.students.get(edit.id):null;const s:Student={id:edit.id||uid(),nisn:edit.nisn,nama:edit.nama,kelas:edit.kelas||'4A',kontak:edit.kontak||'',deleted:0,synced:0,updatedAt:new Date().toISOString()};try{await db.students.put(s);showToast('success',old?'Siswa diperbarui':'Siswa ditambahkan');setOpen(false);setEdit({kelas:user.role==='guru'?'4A':'4A'});load()}catch{showToast('error','NISN sudah digunakan')}}const visible=list.filter(s=>(kelas==='ALL'||s.kelas===kelas)&&(!query||`${s.nama} ${s.nisn}`.toLowerCase().includes(query.toLowerCase())));const pageCount=Math.max(1,Math.ceil(visible.length/pageSize));const pageRows=visible.slice((page-1)*pageSize,page*pageSize);return <><div className="heading"><h1>Data Siswa</h1>{user.role==='admin'&&<div className="heading-actions"><button className="primary" onClick={openNew}>Tambah Siswa</button><ExcelActions kind="siswa" showToast={showToast} after={load}/></div>}</div><section className="card list-tools"><input placeholder="Cari nama atau NISN" value={query} onChange={e=>setQuery(e.target.value)}/><select value={kelas} onChange={e=>setKelas(e.target.value)}><option value="ALL">Semua kelas</option>{classes.map(k=><option key={k}>{k}</option>)}</select></section>{user.role==='admin'&&<dialog open={open} className="edit-dialog"><form className="card form" onSubmit={save}><div className="dialog-heading"><h2>{edit.id?'Edit Siswa':'Tambah Siswa'}</h2><button type="button" onClick={()=>setOpen(false)}>Tutup</button></div><input placeholder="NISN" value={edit.nisn||''} onChange={e=>setEdit({...edit,nisn:e.target.value})}/><input placeholder="Nama siswa" value={edit.nama||''} onChange={e=>setEdit({...edit,nama:e.target.value})}/><select value={edit.kelas||'4A'} onChange={e=>setEdit({...edit,kelas:e.target.value})}>{classes.map(k=><option key={k}>{k}</option>)}</select><input placeholder="Kontak" value={edit.kontak||''} onChange={e=>setEdit({...edit,kontak:e.target.value})}/><button className="primary">{edit.id?'Simpan Perubahan':'Tambah Siswa'}</button></form></dialog>}<section className="card"><table><thead><tr><th>NISN</th><th>Nama</th><th>Kelas</th>{user.role==='admin'&&<th>Aksi</th>}</tr></thead><tbody>{pageRows.map(s=><tr key={s.id}><td>{s.nisn}</td><td>{s.nama}</td><td>{s.kelas}</td>{user.role==='admin'&&<td><button onClick={()=>openEdit(s)}>Edit</button> <button className="danger" onClick={async()=>{await db.students.update(s.id,{deleted:1,synced:0,updatedAt:new Date().toISOString()});load()}}>Hapus</button></td>}</tr>)}</tbody></table>{!visible.length&&<p className="empty">Data siswa tidak ditemukan.</p>}{visible.length>pageSize&&<div className="pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Sebelumnya</button><span>Halaman {page} dari {pageCount}</span><button disabled={page===pageCount} onClick={()=>setPage(page+1)}>Berikutnya</button></div>}</section></>}
function Teachers({showToast}:any){const[list,setList]=useState<Teacher[]>([]);const[query,setQuery]=useState('');const[kelas,setKelas]=useState('ALL');const[role,setRole]=useState('ALL');const[edit,setEdit]=useState<Partial<Teacher>>({role:'guru',kelas:'4A'});const[open,setOpen]=useState(false);const classes=[...new Set([...list.flatMap(t=>t.kelas.split(',').map(k=>k.trim()).filter(Boolean)),edit.kelas||'4A'])].filter(Boolean).sort();async function load(){
    try{
      const a = await db.teachers.filter(t=>!t.deleted).toArray();
      setList(a.sort((a,b)=>a.nama.localeCompare(b.nama)));
    }catch(e){
      console.warn('Failed to load teachers from SQL store, falling back to IndexedDB', e);
      const a = await db.teachers.filter(t=>!t.deleted).toArray();
      setList(a.sort((a,b)=>a.nama.localeCompare(b.nama)));
    }
  }
  useEffect(()=>{void load()},[]);function openNew(){setEdit({role:'guru',kelas:''});setOpen(true)}async function save(e:any){e.preventDefault();if(!edit.nama||!edit.nik||!edit.password)return;const teacherClasses=[...new Set((edit.kelas||'').split(',').map(value=>value.trim()).filter(Boolean))];if(!teacherClasses.length)return;const selectedRole=edit.role==='admin'?'admin':edit.role==='guru bidang'?'guru bidang':'guru';const teacherRole=selectedRole==='guru'||selectedRole==='admin'?selectedRole:teacherClasses.length>1?'guru bidang':'guru bidang';const t:Teacher={id:edit.id||uid(),nama:edit.nama,nik:edit.nik,role:teacherRole,kelas:teacherClasses.join(', '),password:edit.password,deleted:0,synced:0,updatedAt:new Date().toISOString()};try{await db.teachers.put(t);showToast('success',edit.id?'Data guru diperbarui':'Data guru disimpan');setOpen(false);setEdit({role:'guru',kelas:''});load()}catch{showToast('error','NIK sudah digunakan')}}const visible=list.filter(t=>(kelas==='ALL'||t.kelas.split(',').map(value=>value.trim()).includes(kelas))&&(role==='ALL'||role===t.role)&&(!query||`${t.nama} ${t.nik}`.toLowerCase().includes(query.toLowerCase())));return <><div className="heading"><h1>Data Guru</h1><div className="heading-actions"><button className="primary" onClick={openNew}>Tambah Guru</button><ExcelActions kind="guru" showToast={showToast} after={load}/></div></div><section className="card list-tools"><input placeholder="Cari nama atau NIK" value={query} onChange={e=>setQuery(e.target.value)}/><select value={kelas} onChange={e=>setKelas(e.target.value)}><option value="ALL">Semua kelas</option>{classes.map(k=><option key={k}>{k}</option>)}</select><select value={role} onChange={e=>setRole(e.target.value)}><option value="ALL">Semua role</option><option value="guru">Guru</option><option value="guru bidang">Guru bidang</option><option value="admin">Admin</option></select></section><dialog open={open} className="edit-dialog"><form className="card form" onSubmit={save}><div className="dialog-heading"><h2>{edit.id?'Edit Guru':'Tambah Guru'}</h2><button type="button" onClick={()=>setOpen(false)}>Tutup</button></div><input placeholder="Nama" value={edit.nama||''} onChange={e=>setEdit({...edit,nama:e.target.value})}/><input placeholder="NIK" value={edit.nik||''} onChange={e=>setEdit({...edit,nik:e.target.value})}/><input placeholder="Password" value={edit.password||''} onChange={e=>setEdit({...edit,password:e.target.value})}/><select value={edit.role||'guru'} onChange={e=>setEdit({...edit,role:e.target.value as any})}><option value="guru">Guru kelas</option><option value="guru bidang">Guru bidang</option><option value="admin">Admin</option></select><label>Kelas (pisahkan dengan koma)<input placeholder="Contoh: 1A, 2A, 3B" value={edit.kelas||''} onChange={e=>setEdit({...edit,kelas:e.target.value})}/></label><small className="muted">Guru bidang dapat memiliki satu atau beberapa kelas.</small><button className="primary">{edit.id?'Simpan Perubahan':'Simpan'}</button></form></dialog><section className="card"><table><thead><tr><th>Nama</th><th>NIK</th><th>Role</th><th>Kelas</th><th>Aksi</th></tr></thead><tbody>{visible.map(t=><tr key={t.id}><td>{t.nama}</td><td>{t.nik}</td><td>{t.role}</td><td>{t.kelas}</td><td><button onClick={()=>{setEdit(t);setOpen(true)}}>Edit</button> {t.id!=='admin-001'&&<button className="danger" onClick={async()=>{await db.teachers.update(t.id,{deleted:1,synced:0});load()}}>Hapus</button>}</td></tr>)}</tbody></table>{!visible.length&&<p className="empty">Data guru tidak ditemukan.</p>}</section></>}
function ExcelActions({kind,showToast,after}:{kind:'siswa'|'guru';showToast:any;after:()=>void}){const input=useRef<HTMLInputElement>(null);async function change(e:any){const file=e.target.files?.[0];if(!file)return;try{const result=kind==='siswa'?await importStudents(file):await importTeachers(file);showToast('success',`Import selesai: ${result.added} baru, ${result.updated} diperbarui, ${result.skipped} dilewati`);await after()}catch(err:any){showToast('error',err.message||'Import Excel gagal')}finally{e.target.value=''}}return <div className="excel-actions"><input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={change}/><button type="button" onClick={()=>downloadTemplate(kind)}>Template</button><button type="button" onClick={()=>input.current?.click()}>Import .xlsx</button><button type="button" className="primary" onClick={()=>{const action=kind==='siswa'?exportStudents():exportTeachers();action.then(n=>showToast('success',`${n} data berhasil diekspor`)).catch((e:any)=>showToast('error',e.message))}}>Export .xlsx</button></div>}
function Templates({user,showToast}:any){return <><h1>Templates & Excel</h1><p className="muted">Unduh template resmi, isi tanpa mengubah nama kolom, lalu import dari menu Data Siswa atau Data Guru.</p><div className="template-grid"><article className="card template-card"><span className="template-icon">👨‍🎓</span><div><h2>Template Siswa</h2><p>Kolom NISN, Nama, Kelas, dan Kontak. Termasuk validasi pilihan kelas.</p></div><button className="primary" onClick={()=>downloadTemplate('siswa')}>Download template-siswa.xlsx</button><button onClick={()=>exportStudents().then(n=>showToast('success',`${n} siswa diekspor`))}>Export Data Siswa</button></article>{user.role==='admin'&&<article className="card template-card"><span className="template-icon">👩‍🏫</span><div><h2>Template Guru</h2><p>Kolom NIK, Nama, Role, Kelas, dan Password. Role dibatasi guru atau admin.</p></div><button className="primary" onClick={()=>downloadTemplate('guru')}>Download template-guru.xlsx</button><button onClick={()=>exportTeachers().then(n=>showToast('success',`${n} guru diekspor`))}>Export Data Guru</button></article>}</div><section className="card"><h2>Aturan Import</h2><ol><li>Gunakan file template agar nama kolom sesuai.</li><li>NISN dan NIK harus unik.</li><li>Data dengan NISN atau NIK yang sudah ada akan diperbarui.</li><li>Baris yang tidak lengkap akan dilewati dan dilaporkan.</li><li>Import dan export bekerja secara lokal tanpa internet.</li></ol></section></>}

function Settings({user,showToast}:any){const[preset,setPreset]=useState<PresetId>(()=>(localStorage.getItem('toastPreset')as PresetId)||'school');const[testPhone,setTestPhone]=useState('');const[passwordForm,setPasswordForm]=useState({currentPassword:'',newPassword:'',confirmPassword:''});const[passwordBusy,setPasswordBusy]=useState(false);const {status:infobipStatus,message:infobipMessage,refresh}=useInfobipStatus();async function checkInfobip(){const active=await refresh();if(active)showToast('success','Koneksi Infobip aktif');else showToast('info','Infobip belum aktif. Absensi masih berjalan normal.')}async function testInfobip(){const phone=testPhone.trim();if(!phone){showToast('error','Masukkan nomor WhatsApp tujuan untuk uji kirim');return}try{const response=await fetch('/api/infobip/attendance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,text:'Tes kirim WhatsApp dari Absensi Siswa.\n\nIni adalah pesan uji koneksi Infobip.\n\nTerima kasih.',event:'hadir',studentName:'Uji Coba',className:'Demo',time:'08:00'})});const data=await response.json() as {ok?:boolean;skipped?:boolean;error?:string;messageId?:string};if(!response.ok){if(data.skipped){showToast('info','Infobip belum aktif. Absensi tetap berjalan normal.');return}showToast('error',data.error||'Tes kirim gagal');return}showToast('success',data.messageId?`Tes kirim berhasil. ID: ${data.messageId}`:'Tes kirim berhasil');}catch(error){showToast('error',error instanceof Error?error.message:'Tes kirim gagal')}}async function changePassword(event:any){event.preventDefault();if(!user){showToast('error','Sesi tidak valid');return}const currentPassword=passwordForm.currentPassword.trim();const newPassword=passwordForm.newPassword.trim();const confirmPassword=passwordForm.confirmPassword.trim();if(!currentPassword||!newPassword||!confirmPassword){showToast('error','Semua kolom password harus diisi');return}if(newPassword.length<6){showToast('error','Password baru minimal 6 karakter');return}if(newPassword!==confirmPassword){showToast('error','Konfirmasi password baru tidak cocok');return}try{setPasswordBusy(true);const teacher=await db.teachers.get(user.id);if(!teacher){showToast('error','Akun guru tidak ditemukan');return}if(teacher.password!==currentPassword){showToast('error','Password saat ini tidak sesuai');return}await db.teachers.update(user.id,{password:newPassword,updatedAt:new Date().toISOString()});showToast('success','Password berhasil diperbarui');setPasswordForm({currentPassword:'',newPassword:'',confirmPassword:''});}catch(error){showToast('error',error instanceof Error?error.message:'Gagal memperbarui password');}finally{setPasswordBusy(false)}}useEffect(()=>{const runBtn=document.getElementById('sql-run') as HTMLButtonElement|null;const clearBtn=document.getElementById('sql-clear') as HTMLButtonElement|null;const syncBtn=document.getElementById('sql-sync') as HTMLButtonElement|null;const textarea=document.getElementById('sql-console-textarea') as HTMLTextAreaElement|null;const resultDiv=document.getElementById('sql-result') as HTMLDivElement|null;function runHandler(){if(!textarea||!resultDiv){return}const q=textarea.value.trim();if(!q){resultDiv.innerText='Masukkan query SQL.';return}Promise.resolve(sqlQuery(q)).then(res=>{try{if(Array.isArray(res))resultDiv.innerText=JSON.stringify(res,null,2);else if(typeof res==='object')resultDiv.innerText=JSON.stringify(res,null,2);else resultDiv.innerText=String(res)}catch(e:any){resultDiv.innerText=String(e)}}).catch(err=>{resultDiv.innerText=err?.message||String(err)})}function clearHandler(){if(textarea)textarea.value='';if(resultDiv)resultDiv.innerText='';}async function syncHandler(){try{await syncSqlToIndexedDB();showToast('success','Sinkronisasi SQL → IndexedDB selesai')}catch(e:any){showToast('error',e?.message||'Sinkronisasi gagal')}}runBtn?.addEventListener('click',runHandler);clearBtn?.addEventListener('click',clearHandler);syncBtn?.addEventListener('click',syncHandler);return ()=>{runBtn?.removeEventListener('click',runHandler);clearBtn?.removeEventListener('click',clearHandler);syncBtn?.removeEventListener('click',syncHandler)}},[]);return <><h1>Pengaturan</h1><section className="card"><h2>Preset Animasi Toast</h2><PresetToolbar value={preset} onChange={p=>{setPreset(p);localStorage.setItem('toastPreset',p);showToast('success',`Preset ${p} diterapkan`)}}/><p className="muted">Pilihan disimpan lokal dan tetap aktif ketika offline.</p></section><section className="card form"><h2>Ubah Password</h2><form onSubmit={changePassword}><label>Kata sandi saat ini<PasswordField value={passwordForm.currentPassword} onChange={value=>setPasswordForm(current=>({...current,currentPassword:value}))}/></label><label>Password baru<PasswordField value={passwordForm.newPassword} onChange={value=>setPasswordForm(current=>({...current,newPassword:value}))}/></label><label>Konfirmasi password baru<PasswordField value={passwordForm.confirmPassword} onChange={value=>setPasswordForm(current=>({...current,confirmPassword:value}))}/></label><button type="submit" className="primary" disabled={passwordBusy}>{passwordBusy?'Menyimpan...':'Simpan Password'}</button></form></section><section className="card form"><h2>Notifikasi WhatsApp Infobip</h2><div className={`status-pill ${infobipStatus}`}><span className="status-dot"/> {infobipMessage}</div><button type="button" className="primary" onClick={()=>void checkInfobip()}>Tes koneksi Infobip</button><label>Nomor tujuan uji kirim<input type="tel" value={testPhone} onChange={e=>setTestPhone(e.target.value)} placeholder="628123456789"/></label><button type="button" onClick={()=>void testInfobip()}>Kirim test WhatsApp</button><div className="config-help"><strong>Contoh variabel server:</strong><pre>INFOBIP_API_KEY=your_infobip_api_key</pre></div></section>

<section className="card">
  <h2>Metrik Infobip</h2>
  <InfobipMetrics />
</section>

      <section className="card">
        <h2>SQL Console (Alasql)</h2>
        <SqlConsole showToast={showToast} />
      </section>
      <div className="config-help"><strong>Contoh variabel server:</strong><pre>INFOBIP_WHATSAPP_FROM=6288211912087
INFOBIP_TEMPLATE_HADIR=notifikasi_kehadiran
INFOBIP_TEMPLATE_PULANG=notifikasi_pulang
INFOBIP_TEMPLATE_LANGUAGE=id</pre></div><p className="muted">Saat status non-aktif, absensi tetap berjalan normal dan notifikasi WhatsApp akan otomatis dilewati.</p><section className="card form"><h2>Server Sinkronisasi Opsional</h2><label>URL server<input defaultValue={localStorage.getItem('serverUrl')||''} placeholder="https://server-anda/api" onBlur={e=>localStorage.setItem('serverUrl',e.target.value.trim())}/></label><button onClick={()=>showToast('info','URL server tersimpan')}>Simpan</button></section></>}