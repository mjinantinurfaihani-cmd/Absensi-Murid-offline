import{db}from'./db';import{applyCloudData,loadAllPublicData,loadPublicData,publishAllData,publishInitialData}from'./firebaseStore';import type{Attendance,AttendanceConflict,Student,Teacher}from'./types';

function resolvedApiBase(){
	const configured=(localStorage.getItem('serverUrl')||'').trim();
	if(configured)return configured.replace(/\/$/,'');
	if(typeof window!=='undefined'&&window.location.hostname==='localhost'&&window.location.port==='9005')return window.location.origin;
	return 'https://localhost:9005';
}

const requestOptions=()=>({signal:AbortSignal.timeout(5000)});

function toTimestamp(value?:string){
	const parsed=Date.parse(String(value||''));
	return Number.isFinite(parsed)?parsed:0;
}

function isNewer(left:{updatedAt?:string},right:{updatedAt?:string}){
	return toTimestamp(left.updatedAt)>=toTimestamp(right.updatedAt);
}

async function isServerAvailable(){
	const api=resolvedApiBase();
	if(!navigator.onLine||!api)return false;
	try{
		const response=await fetch(`${api}/health`,requestOptions());
		return response.ok;
	}catch{
		return false;
	}
}

function uniqueRows(name:string,rows:any[]){
	const key=name==='students'?'nisn':name==='teachers'?'nik':'id';
	const byKey=new Map<string,any>();
	for(const row of rows){
		if(row?.deleted===1||row?.deleted===true) continue;
		const value=String(row[key]||row.id);
		const current=byKey.get(value);
		if(!current||isNewer(row,current))byKey.set(value,row);
	}
	return [...byKey.values()];
}

async function syncTable(name:string,table:any){
	if(!await isServerAvailable())return 0;
	const pending=await table.where('synced').equals(0).toArray();
	if(pending.length){
		const response=await fetch(`${resolvedApiBase()}/api/sync/${name}`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
		if(!response.ok)throw new Error(`Sinkronisasi ${name} gagal`);
		for(const row of pending){
			const current=await table.get(row.id);
			if(current&&current.updatedAt===row.updatedAt)await table.update(row.id,{synced:1});
		}
	}

	const response=await fetch(`${resolvedApiBase()}/api/data/${name}`,requestOptions());
	if(!response.ok)throw new Error(`Pengambilan data ${name} gagal`);
	const remote=await response.json() as Array<{id:string;updatedAt?:string;synced?:number}>;
	const local=await table.toArray();
	const localById=new Map(local.map((row:any)=>[row.id,row]));
	const merged=remote.map(row=>{
		const current=localById.get(row.id);
		if(current&&isNewer(current,row))return current;
		return {...row,synced:1};
	});
	for(const current of local){
		if(!remote.some(row=>row.id===current.id))merged.push(current);
	}
	const normalized=uniqueRows(name,merged);
	await db.transaction('rw',table,async()=>{
		await table.clear();
		await table.bulkPut(normalized);
	});
	return pending.length;
}

type SyncRow=Student|Teacher|Attendance;

function mergeRows<T extends SyncRow>(local:T[],remote:T[]){
	const merged=new Map(local.map(row=>[row.id,row]));
	for(const row of remote){
		if(row?.deleted===1||row?.deleted===true) {
			merged.delete(row.id);
			continue;
		}
		const current=merged.get(row.id);
		if(!current||isNewer(row,current))merged.set(row.id,row);
	}
	return [...merged.values()].filter(row => !(row?.deleted===1 || row?.deleted===true));
}

async function mergeWithFirebase(){
	const cloud=await loadAllPublicData();
	const local={
		students:await db.students.toArray(),
		teachers:await db.teachers.toArray(),
		attendance:await db.attendance.toArray()
	};
	const merged={
		students:mergeRows(local.students,cloud.students),
		teachers:mergeRows(local.teachers,cloud.teachers),
		attendance:mergeRows(local.attendance,cloud.attendance)
	};
	await applyCloudData(async()=>{
		await db.transaction('rw',[db.students,db.teachers,db.attendance],async()=>{
			await db.students.bulkPut(merged.students.map(row=>({...row,synced:1})));
			await db.teachers.bulkPut(merged.teachers.map(row=>({...row,synced:1})));
			await db.attendance.bulkPut(merged.attendance.map(row=>({...row,synced:1})));
		});
	});
	await publishAllData(merged.students,merged.teachers,merged.attendance);
	return merged;
}

export async function syncAdminDirectoryData(){
	const serverAvailable=await isServerAvailable();
	if(serverAvailable){
		for(const [name,table] of [['teachers',db.teachers],['students',db.students]] as const)await syncTable(name,table);
	}
	const cloud=await loadPublicData();
	const localStudents=await db.students.toArray();
	const localTeachers=await db.teachers.toArray();
	const students=mergeRows(localStudents,cloud.students);
	const teachers=mergeRows(localTeachers,cloud.teachers);
	await applyCloudData(async()=>{
		await db.transaction('rw',[db.students,db.teachers],async()=>{
			await db.students.bulkPut(students.map(row=>({...row,synced:1})));
			await db.teachers.bulkPut(teachers.map(row=>({...row,synced:1})));
		});
	});
	await publishInitialData(students,teachers);
	if(serverAvailable){
		for(const [name,rows] of [['teachers',teachers],['students',students]] as const){
			const response=await fetch(`${resolvedApiBase()}/api/sync/${name}`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rows)});
			if(!response.ok)throw new Error(`Pengiriman ${name} ke server gagal`);
		}
	}
	localStorage.setItem('lastSync',new Date().toISOString());
	return{students:students.length,teachers:teachers.length,total:students.length+teachers.length};
}

export async function syncAll(){
	let sent=0;
	const serverAvailable=await isServerAvailable();
	if(serverAvailable){
		for(const [name,table] of [['teachers',db.teachers],['students',db.students],['attendance',db.attendance]] as const)sent+=await syncTable(name,table);
	}
	const merged=await mergeWithFirebase();
	if(serverAvailable){
		for(const [name,rows] of [['teachers',merged.teachers],['students',merged.students],['attendance',merged.attendance]] as const){
			// Filter soft-deleted before sending to server (only send active records)
			const nonDeleted=rows.filter(r=>r.deleted!==1);
			if(nonDeleted.length>0){
				const response=await fetch(`${resolvedApiBase()}/api/sync/${name}`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(nonDeleted)});
				if(!response.ok)throw new Error(`Pengiriman ${name} ke server gagal`);
			}
		}
	}
	localStorage.setItem('lastSync',new Date().toISOString());
	const conflicts=await getAttendanceConflicts();
	return{sent:Math.max(sent,merged.students.length+merged.teachers.length+merged.attendance.length),conflicts};
}

export async function getAttendanceConflicts(){
	if(!resolvedApiBase()||!await isServerAvailable())return [] as AttendanceConflict[];
	const response=await fetch(`${resolvedApiBase()}/api/attendance-conflicts`,requestOptions());
	if(!response.ok)throw new Error('Pemeriksaan konflik kehadiran gagal');
	return await response.json() as AttendanceConflict[];
}

export async function confirmAttendanceConflict(key:string,deviceId:string){
	if(!resolvedApiBase()||!await isServerAvailable())throw new Error('Server sinkronisasi tidak tersedia');
	const response=await fetch(`${resolvedApiBase()}/api/attendance-conflicts/${encodeURIComponent(key)}/confirm`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId})});
	if(!response.ok)throw new Error('Konfirmasi konflik gagal');
	return await response.json() as AttendanceConflict;
}
