import React from'react';import{createRoot}from'react-dom/client';import App from'./App';import'./style.css';
import { db, seed } from './db';
import { initSqlStore } from './sqlStore';
import { loadPublicData, publishInitialData } from './firebaseStore';

async function initialize() {
	await seed();
	try {
		const localStudents = await db.students.toArray();
		const localTeachers = await db.teachers.toArray();
		const cloud = await loadPublicData();
		if (cloud.students.length || cloud.teachers.length) {
			await db.students.bulkPut(cloud.students.filter(student => !student.deleted));
			await db.teachers.bulkPut(cloud.teachers.filter(teacher => !teacher.deleted));
		} else {
			await publishInitialData(localStudents, localTeachers);
		}
	} catch (error) {
		console.warn('Firebase publik tidak tersedia; memakai data lokal', error);
	}
	await initSqlStore();
	if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=7',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
	createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
}

initialize().catch(error=>console.error('Gagal menyiapkan aplikasi', error));
import "./styles/qrCards.css";