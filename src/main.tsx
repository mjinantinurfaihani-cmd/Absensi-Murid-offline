import React from'react';import{createRoot}from'react-dom/client';import App from'./App';import'./style.css';
import { db, seed } from './db';
import { initSqlStore } from './sqlStore';
import { applyCloudData, loadPublicData, publishInitialData, subscribePublicData } from './firebaseStore';
import type { Student, Teacher } from './types';

async function replacePublicTable<T extends { id: string; deleted?: boolean | number }>(table: any, rows: T[]) {
	const activeRows = rows.filter(row => !row.deleted);
	const activeIds = new Set(activeRows.map(row => row.id));
	const localRows = await table.toArray() as T[];
	await table.bulkPut(activeRows);
	const staleIds = localRows.filter(row => !activeIds.has(row.id)).map(row => row.id);
	if (staleIds.length) await table.bulkDelete(staleIds);
}

async function initialize() {
	await seed();
	try {
		const localStudents = await db.students.toArray();
		const localTeachers = await db.teachers.toArray();
		const cloud = await loadPublicData();
		if (cloud.students.length || cloud.teachers.length) {
			await applyCloudData(async () => {
				await replacePublicTable(db.students, cloud.students);
				await replacePublicTable(db.teachers, cloud.teachers);
			});
		} else {
			await publishInitialData(localStudents, localTeachers);
		}
	} catch (error) {
		console.warn('Firebase publik tidak tersedia; memakai data lokal', error);
	}
	await initSqlStore();
	let initialSnapshots = 0;
	subscribePublicData((kind, data) => {
		void applyCloudData(async () => {
			if (kind === 'students') await replacePublicTable(db.students, data as Student[]);
			else await replacePublicTable(db.teachers, data as Teacher[]);
			if (initialSnapshots < 2) initialSnapshots += 1;
			else window.location.reload();
		}).catch(error => console.warn('Gagal menerapkan sinkronisasi realtime', error));
	});
	if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=8',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
	createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
}

initialize().catch(error=>console.error('Gagal menyiapkan aplikasi', error));
import "./styles/qrCards.css";