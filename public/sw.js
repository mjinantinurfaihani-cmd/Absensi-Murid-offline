const CACHE='absensi-shell-v14';
const SHELL=['./','./index.html','./manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(e.request.mode==='navigate'||url.pathname.endsWith('/index.html')){e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html').then(hit=>hit||new Response('Offline', {status: 503}))));return;}e.respondWith(fetch(e.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));}return response;}).catch(()=>caches.match(e.request).then(hit=>hit||new Response('',{status:504,statusText:'Offline'}))));});
