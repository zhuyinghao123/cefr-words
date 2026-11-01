// build 5 (v5-28)
const V='vocab-v5-28',AUD='vocab-audio',DATA='vocab-data';
const A=['./','index.html','app.css','app.js','parse.js','enrich.js','cefr.js','manifest.json','icon-192.png','icon-512.png','favicon.ico'];
// install: cache each file independently so one failure can't abort the install
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.all(A.map(u=>c.add(new Request(u,{cache:'reload'})).catch(()=>{}))))) });
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('vocab-v')&&x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
const isAudio=u=>u.hostname==='dict.youdao.com'&&u.pathname==='/dictvoice'||u.hostname==='translate.google.com'&&u.pathname==='/translate_tts';
const tfetch=(req,ms)=>new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),ms);fetch(req).then(r=>{clearTimeout(t);res(r)},e=>{clearTimeout(t);rej(e)})});
// network-first with timeout, falling back to any cached copy (old versions included) so the app always opens
async function netFirst(req,ms){try{const r=await tfetch(req,ms);if(r&&r.ok){const c=r.clone();caches.open(V).then(x=>x.put(req,c))}return r}catch(e){
  const hit=await caches.match(req,{ignoreSearch:true})||(req.mode==='navigate'?await caches.match('index.html',{ignoreSearch:true})||await caches.match('./'):null);if(hit)return hit;return fetch(req)}}
const safe=(req,p)=>Promise.resolve().then(()=>p).then(r=>r||Promise.reject()).catch(()=>caches.match(req,{ignoreSearch:true})).then(r=>r||fetch(req)).catch(()=>Response.error());
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  if(isAudio(u)){if(e.request.headers.has('range'))return;e.respondWith(safe(e.request,caches.open(AUD).then(c=>c.match(u.href,{ignoreVary:true}).then(r=>r||fetch(u.href,{mode:'no-cors',referrerPolicy:'no-referrer'}).then(n=>{c.put(u.href,n.clone());return n})))));return}
  if(u.origin!==location.origin||!u.pathname.includes('/vocab/')||u.pathname.includes('/packs/'))return;
  if(u.pathname.endsWith('cmu-ipa.txt')||u.pathname.endsWith('ecdict.tsv.gz')){e.respondWith(safe(e.request,caches.open(DATA).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n})))));return}
  e.respondWith(safe(e.request,netFirst(e.request,e.request.mode==='navigate'?3500:5000)))});
