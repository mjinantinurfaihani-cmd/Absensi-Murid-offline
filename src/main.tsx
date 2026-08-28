import React from'react';import{createRoot}from'react-dom/client';import App from'./App';import'./style.css';
import { initSqlStore } from './sqlStore';

// Initialize SQL-like in-memory store and sync with IndexedDB
initSqlStore().catch(err=>{console.warn('Failed to init SQL store',err)});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=6',{updateViaCache:'none'}).catch(error=>{if(import.meta.env.DEV)console.warn('Service Worker tidak dapat didaftarkan:',error)}));
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
import "./styles/qrCards.css";