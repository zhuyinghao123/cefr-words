const V='vocab-v5-10',AUD='vocab-audio';
const A=['./','index.html','app.css','app.js','parse.js','enrich.js','cefr.js','ecdict.tsv.gz','manifest.json','icon-192.png','icon-512.png','favicon.ico'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(A)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x.startsWith('vocab-v')&&x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
const isAudio=u=>u.hostname==='dict.youdao.com'&&u.pathname==='/dictvoice'||u.hostname==='translate.google.com'&&u.pathname==='/translate_tts';
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  if(isAudio(u)){e.respondWith(caches.open(AUD).then(c=>c.match(u.href,{ignoreVary:true}).then(r=>r||fetch(u.href,{mode:'no-cors',referrerPolicy:'no-referrer'}).then(n=>{c.put(u.href,n.clone());return n}))));return}
  if(u.origin!==location.origin||!u.pathname.includes('/vocab/'))return;
  if(u.pathname.endsWith('cmu-ipa.txt')||u.pathname.endsWith('ecdict.tsv.gz')){e.respondWith(caches.open(V).then(c=>c.match(e.request).then(r=>r||fetch(e.request).then(n=>{c.put(e.request,n.clone());return n}))));return}
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('index.html'))))});
