// Guarda o app no celular para funcionar sem internet + lembrete diário da gatinha
const CACHE = 'gatinha-v63';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './badge-96.png',
               './gatinha.js', './gatinha_doutora.png', './gatinha_doutora.glb'];
// three.js (CDN) para a gatinha 3D funcionar sem internet; se a CDN falhar, o app instala mesmo assim
const CDN = ['https://unpkg.com/three@0.170.0/build/three.module.js',
             'https://unpkg.com/three@0.170.0/examples/jsm/loaders/GLTFLoader.js',
             'https://unpkg.com/three@0.170.0/examples/jsm/utils/BufferGeometryUtils.js',
             'https://unpkg.com/three@0.170.0/examples/jsm/controls/OrbitControls.js',
             'https://unpkg.com/three@0.170.0/examples/jsm/environments/RoomEnvironment.js'];
const STATE = 'gatinha-state', STATE_URL = './__estado__';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).then(() => Promise.allSettled(CDN.map(u => c.add(u))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== STATE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('__estado__')) return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;   // abre na hora pelo que está guardado e atualiza em segundo plano
    })
  );
});

/* ---------- lembrete diário ---------- */
const MSGS = [
  ['Hora do inglês! 📚', 'Vamos estudar um pouquinho, {N}? A gatinha está te esperando!'],
  ['Miau! 🐱', 'Que tal 5 minutinhos de inglês hoje, {N}?'],
  ["Let's study! ✨", 'Um joguinho rápido e você já aprende palavras novas!'],
  ['Saudades, {N}! 💕', 'A gatinha quer treinar inglês com você hoje.'],
  ['Desafio do dia 🏆', 'Será que você bate seu recorde hoje? Bora tentar!'],
  ['Practice makes perfect! 🌟', 'Um pouquinho por dia faz milagre. Vamos estudar?'],
  ['Hello, {N}! 👋', 'Sua dose diária de inglês está te esperando.'],
  ['Hora da consulta! 🩺', 'A doutora gatinha separou palavras novas pra você!'],
  ['Hora de brilhar! ✨', 'Abre o app e mostra pra gatinha o que você já sabe.'],
  ['Did you know? 🤓', 'Quem treina todo dia aprende muito mais rápido. Vamos?'],
  ['A gatinha te chamou! 🐾', 'Ela está com saudade e quer uma partidinha.'],
  ['Good day, {N}! ☀️', 'Que tal uma conversa em inglês com a gatinha hoje?'],
];
const STREAK = ['Não perde sua sequência! 🔥', 'Você está com {S} dias seguidos. Bora manter hoje também, {N}?'];
const HUNGRY = ['A gatinha está com fome! 🍣', 'Passa na Casinha pra dar comidinha e depois treina um pouquinho?'];
const dayStr = d => `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
async function readState(){ try{ const c=await caches.open(STATE); const r=await c.match(STATE_URL); return r ? await r.json() : {}; }catch(e){ return {}; } }
async function writeState(s){ try{ const c=await caches.open(STATE); await c.put(STATE_URL, new Response(JSON.stringify(s), {headers:{'Content-Type':'application/json'}})); }catch(e){} }
async function remind(force){
  const s=await readState(), now=new Date(), today=dayStr(now), h=now.getHours();
  if(!force){
    if(s.on===false) return;
    if(s.notified===today) return;            // no máximo uma por dia
    if(s.lastDay===today) return;             // já treinou hoje: não incomoda
    if(h<9 || h>=21) return;                  // nada de madrugada
  }
  const name=s.name||'Anandrya';
  let m;
  const food = typeof s.food==='number' ? s.food - Math.max(0,(Date.now()-(s.at||Date.now()))/36e5)*2.5 : 100;
  if(!force && s.streak>=2 && Math.random()<.5) m=STREAK;
  else if(!force && food<35 && Math.random()<.5) m=HUNGRY;
  else { let i; do{ i=Math.floor(Math.random()*MSGS.length); } while(MSGS.length>1 && i===s.lastMsg); s.lastMsg=i; m=MSGS[i]; }
  const fill=t=>t.replace(/\{N\}/g,name).replace(/\{S\}/g,s.streak||0);
  await self.registration.showNotification(fill(m[0]), {body:fill(m[1]), icon:'./icon-192.png', badge:'./badge-96.png', tag:'gatinha-lembrete', renotify:true, data:{url:'./'}});
  if(!force){ s.notified=today; await writeState(s); }
}
self.addEventListener('periodicsync', e => { if(e.tag==='gatinha-lembrete') e.waitUntil(remind(false)); });
self.addEventListener('message', e => { if(e.data && e.data.type==='testar-lembrete') e.waitUntil(remind(true)); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(ws => {
    for(const w of ws){ if('focus' in w) return w.focus(); }
    return self.clients.openWindow('./');
  }));
});
