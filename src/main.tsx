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
	try {
		console.log('Starting seed...');
		await seed();
		console.log('Seed complete');
		
		console.log('Starting initSqlStore...');
		await initSqlStore();
		console.log('initSqlStore complete');
		
		console.log('Creating React root...');
		createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
		console.log('App rendered');
		
		console.log('Starting hydrate public data...');
		void hydratePublicData();
		
		console.log('Subscribing to public data...');
		subscribePublicData((kind, data) => {
			void applyCloudData(async () => {
				if (kind === 'students') await replacePublicTable(db.students, data as Student[]);
				else await replacePublicTable(db.teachers, data as Teacher[]);
				window.dispatchEvent(new CustomEvent('public-data-updated', { detail: kind }));
			}).catch(error => console.warn('Gagal menerapkan sinkronisasi realtime', error));
		});
		console.log('All initialization complete');
		
		if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=14',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
	} catch (error) {
		console.error('Gagal menyiapkan aplikasi', error);
		// Still render app even if initialization failed - it can work with local data only
		try {
			console.log('Attempting to render app after error...');
			const root = createRoot(document.getElementById('root')!);
			root.render(<React.StrictMode><App/></React.StrictMode>);
			console.log('App rendered after error');
		} catch (renderError) {
			console.error('Gagal merender aplikasi', renderError);
			document.getElementById('root')!.innerHTML = `<div style="padding: 20px; color: red;">Gagal memulai aplikasi: ${String(error)}</div>`;
		}
	}
}

async function hydratePublicData() {
	try {
		const localStudents = await db.students.toArray();
		const localTeachers = await db.teachers.toArray();
		try {
			const cloud = await Promise.race([
				loadPublicData(),
				new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout memuat data Firebase')), 5000))
			]);
			if (cloud.students.length || cloud.teachers.length) {
				await applyCloudData(async () => {
					await replacePublicTable(db.students, cloud.students);
					await replacePublicTable(db.teachers, cloud.teachers);
				});
			} else {
				await publishInitialData(localStudents, localTeachers);
			}
		} catch (firebaseError) {
			console.warn('Firebase publik tidak tersedia; memakai data lokal', firebaseError);
			// Don't fail initialization - just use local data
		}
	} catch (error) {
		console.warn('Error preparing public data', error);
	}
}

initialize();
import "./styles/qrCards.css";