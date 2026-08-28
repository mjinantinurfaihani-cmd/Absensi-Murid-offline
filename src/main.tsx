import React from'react';import{createRoot}from'react-dom/client';import App from'./App';import'./style.css';
import { db, seed } from './db';
import { initSqlStore } from './sqlStore';
import { applyCloudData, loadPublicData, publishInitialData, subscribePublicData } from './firebaseStore';
import type { Student, Teacher } from './types';

async function replacePublicTable<T extends { id: string; deleted?: boolean | number; updatedAt?: string; nisn?: string; nik?: string }>(table: any, rows: T[]) {
	const byKey = new Map<string, T>();
	for (const row of rows) {
		if (row.deleted) continue;
		const key = row.nisn || row.nik || row.id;
		const current = byKey.get(key);
		if (!current || String(row.updatedAt || '') >= String(current.updatedAt || '')) byKey.set(key, row);
	}
	await table.clear();
	await table.bulkPut([...byKey.values()]);
}

async function initialize() {
	await seed();
	await initSqlStore();
	createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
	void hydratePublicData();
	subscribePublicData((kind, data) => {
		void applyCloudData(async () => {
			if (kind === 'students') await replacePublicTable(db.students, data as Student[]);
			else await replacePublicTable(db.teachers, data as Teacher[]);
			window.dispatchEvent(new CustomEvent('public-data-updated', { detail: kind }));
		}).catch(error => console.warn('Gagal menerapkan sinkronisasi realtime', error));
	});
	if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=14',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
}

async function hydratePublicData() {
	try {
		const localStudents = await db.students.toArray();
		const localTeachers = await db.teachers.toArray();
		const cloud = await Promise.race([
			loadPublicData(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout memuat data Firebase')), 8000))
		]);
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
}

initialize().catch(error=>console.error('Gagal menyiapkan aplikasi', error));
import "./styles/qrCards.css";