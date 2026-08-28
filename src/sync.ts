import{db}from'./db';import type{AttendanceConflict}from'./types';

function resolvedApiBase(){
	const configured=(localStorage.getItem('serverUrl')||'').trim();
	if(!configured)return '';
	return configured.replace(/\/$/,'');
}

const API=resolvedApiBase();
const requestOptions=()=>({signal:AbortSignal.timeout(5000)});

function isNewer(left:{updatedAt?:string},right:{updatedAt?:string}){
	return String(left.updatedAt||'')>=String(right.updatedAt||'');
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
		const response=await fetch(`${API}/sync/${name}`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});
		if(!response.ok)throw new Error(`Sinkronisasi ${name} gagal`);
		for(const row of pending){
			const current=await table.get(row.id);
			if(current&&current.updatedAt===row.updatedAt)await table.update(row.id,{synced:1});
		}
	}

	const response=await fetch(`${API}/data/${name}`,requestOptions());
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

export async function syncAll(){
	if(!resolvedApiBase()||!await isServerAvailable())return{sent:0,conflicts:[]};
	let sent=0;
	for(const [name,table] of [['teachers',db.teachers],['students',db.students],['attendance',db.attendance]] as const){
		sent+=await syncTable(name,table);
	}
	localStorage.setItem('lastSync',new Date().toISOString());
	const conflicts=await getAttendanceConflicts();
	return{sent,conflicts};
}

export async function getAttendanceConflicts(){
	if(!resolvedApiBase()||!await isServerAvailable())return [] as AttendanceConflict[];
	const response=await fetch(`${API}/attendance-conflicts`,requestOptions());
	if(!response.ok)throw new Error('Pemeriksaan konflik kehadiran gagal');
	return await response.json() as AttendanceConflict[];
}

export async function confirmAttendanceConflict(key:string,deviceId:string){
	if(!resolvedApiBase()||!await isServerAvailable())throw new Error('Server sinkronisasi tidak tersedia');
	const response=await fetch(`${API}/attendance-conflicts/${encodeURIComponent(key)}/confirm`,{...requestOptions(),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deviceId})});
	if(!response.ok)throw new Error('Konfirmasi konflik gagal');
	return await response.json() as AttendanceConflict;
}
