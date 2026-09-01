import React from'react';import{createRoot}from'react-dom/client';import App from'./App';import'./style.css';
import { db, seed } from './db';
import { initSqlStore } from './sqlStore';
import { applyCloudData, loadPublicData, publishInitialData, subscribePublicData } from './firebaseStore';
import type { Student, Teacher } from './types';

async function mergePublicTable<T extends { id: string; deleted?: boolean | number; updatedAt?: string; nisn?: string; nik?: string }>(table: any, rows: T[]) {
	const local = await table.toArray() as T[];
	const byKey = new Map<string, T>();
	for (const row of local) {
		const key = row.nisn || row.nik || row.id;
		if (!key) continue;
		if (row.deleted === 1 || row.deleted === true) {
			byKey.delete(key);
			continue;
		}
		byKey.set(key, row);
	}
	for (const row of rows) {
		const key = row.nisn || row.nik || row.id;
		if (!key) continue;
		if (row.deleted === 1 || row.deleted === true) {
			byKey.delete(key);
			continue;
		}
		const current = byKey.get(key);
		const currentTs = current && current.updatedAt ? String(current.updatedAt) : '';
		const nextTs = row.updatedAt ? String(row.updatedAt) : '';
		if (!current || nextTs > currentTs) {
			byKey.set(key, { ...row, synced: 1 } as T);
		}
	}
	await table.clear();
	if (byKey.size) await table.bulkPut([...byKey.values()]);
}

async function replacePublicTable<T extends { id: string; deleted?: boolean | number; updatedAt?: string; nisn?: string; nik?: string }>(table: any, rows: T[]) {
	const normalized = rows
		.filter(row => !(row.deleted === 1 || row.deleted === true))
		.map(row => ({ ...row, synced: 1 } as T));
	await table.clear();
	if (normalized.length) await table.bulkPut(normalized);
}

async function initialize() {
	await seed();
	await initSqlStore();
	await hydratePublicData();
	createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
	subscribePublicData((kind, data) => {
		void applyCloudData(async () => {
			if (kind === 'students') await mergePublicTable(db.students, data as Student[]);
			else await mergePublicTable(db.teachers, data as Teacher[]);
			window.dispatchEvent(new CustomEvent('public-data-updated', { detail: kind }));
		}).catch(error => console.warn('Gagal menerapkan sinkronisasi realtime', error));
	});
	if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=14',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
}

async function hydratePublicData() {
	try {
		const localStudents = await db.students.toArray();
		const localTeachers = await db.teachers.toArray();
		if (import.meta.env.DEV) {
			console.log(`[Hydrate] Local: ${localTeachers.length} teachers, ${localStudents.length} students`);
		}
		const cloud = await Promise.race([
			loadPublicData(),
			new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout memuat data Firebase')), 8000))
		]);
		if (import.meta.env.DEV) {
			console.log(`[Hydrate] Cloud: ${cloud.teachers.length} teachers, ${cloud.students.length} students`);
		}
		if (cloud.students.length || cloud.teachers.length) {
			if (import.meta.env.DEV) {
				console.log('[Hydrate] Merging latest local and cloud data...');
			}
			await applyCloudData(async () => {
				await mergePublicTable(db.students, cloud.students);
				await mergePublicTable(db.teachers, cloud.teachers);
			});
			if (import.meta.env.DEV) {
				console.log('[Hydrate] Latest shared data applied');
			}
		} else {
			if (import.meta.env.DEV) {
				console.log('[Hydrate] Cloud empty, publishing local data to Firebase...');
			}
			await publishInitialData(localStudents, localTeachers);
			if (import.meta.env.DEV) {
				console.log('[Hydrate] Published');
			}
		}
	} catch (error) {
		console.warn('Firebase publik tidak tersedia; memakai data lokal', error instanceof Error ? error.message : error);
	}
}

initialize().catch(error=>console.error('Gagal menyiapkan aplikasi', error));
import "./styles/qrCards.css";