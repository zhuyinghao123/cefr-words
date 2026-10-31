'use strict';
const $=s=>document.querySelector(s),uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(m,ms=2200){const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',ms)}
const ICON={spk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.2a4 4 0 010 5.6M18.2 6.8a7.5 7.5 0 010 10.4"/></svg>',
 l:'<svg viewBox="0 0 24 24" fill="none" stroke="#1d1b18" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 6l-6 6 6 6"/></svg>',
 r:'<svg viewBox="0 0 24 24" fill="none" stroke="#1d1b18" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6l6 6-6 6"/></svg>'};
// ================= IndexedDB (same DB name 'vocabdb'; v2 adds dict + keeps kv/state) =================
let S={cats:[],cur:null,idx:0};
const dbp=new Promise((ok,no)=>{const r=indexedDB.open('vocabdb',2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('kv'))d.createObjectStore('kv');if(!d.objectStoreNames.contains('dict'))d.createObjectStore('dict')};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function idbGet(st,k){const db=await dbp;return new Promise(ok=>{const q=db.transaction(st).objectStore(st).get(k);q.onsuccess=()=>ok(q.result??null);q.onerror=()=>ok(null)})}
async function idbSet(st,k,v){const db=await dbp;return new Promise(ok=>{const t=db.transaction(st,'readwrite');t.objectStore(st).put(v,k);t.oncomplete=ok;t.onerror=ok})}
let saveT=null;function save(){clearTimeout(saveT);saveT=setTimeout(()=>idbSet('kv','state',JSON.parse(JSON.stringify(S))),150)}
if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});
Enrich.setCache({get:k=>idbGet('dict',k),set:(k,v)=>idbSet('dict',k,v)});
// ================= model =================
const LIBC={id:'__lib',lib:true,name:'未归类单词',parent:null,get words(){return S.lib||(S.lib=[])},set words(v){S.lib=v}};
const cat=id=>id==='__lib'?LIBC:S.cats.find(c=>c.id===id),kids=id=>S.cats.filter(c=>c.parent===id);
const count=c=>c.words.length+(c.parent?0:kids(c.id).reduce((a,k)=>a+k.words.length,0));
const studyWords=()=>{if(S.cur==='__all')return[...(S.lib||[]),...ordered().flatMap(c=>c.words)];const c=cat(S.cur);if(!c)return[];return c.parent?c.words:[...c.words,...kids(c.id).flatMap(k=>k.words)]};
const allWords=()=>[...(S.lib||[]),...S.cats.flatMap(c=>c.words)];
function ordered(){const r=[];S.cats.filter(c=>!c.parent).forEach(p=>{r.push(p);kids(p.id).forEach(k=>r.push(k))});return r}
function newCat(name,parent=null){const c={id:uid(),name,parent,words:[]};S.cats.push(c);return c}
function moveIn(arr,item,ni){arr.splice(arr.indexOf(item),1);arr.splice(ni,0,item)}
function lvBadge(w,cls='lv'){const l=Enrich.level(w.word||'');if(!l.lv)return'';const u='https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(l.lemma||w.word);
  return `<a class="${cls}" href="${u}" target="_blank" rel="noopener" title="来源 ${esc(l.src||'')}，点开剑桥词典核对" onclick="event.stopPropagation()">${l.lv}</a><small class="lvsrc">${esc(l.src||'')} · 点等级看剑桥</small>`}
// ================= audio =================
const wordURL=w=>'https://dict.youdao.com/dictvoice?type=1&audio='+encodeURIComponent(w.trim());
const sentURL=s=>'https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q='+encodeURIComponent(s.trim().slice(0,200));
const pool=new Map();let unlocked=false,lastLatency=null;const player=new Audio();player.preload='auto';
function getA(url){let a=pool.get(url);if(!a){a=new Audio();a.preload='auto';a.src=url;a.load();pool.set(url,a)}return a}
function keepPool(urls){for(const [u,a] of pool)if(!urls.includes(u)){a.removeAttribute('src');a.load();pool.delete(u)}urls.forEach(getA)}
const hasSS='speechSynthesis'in window;window.__log=[];const LOG=(seq,k,e)=>{__log.push({seq,k,e,t:Math.round(performance.now())});if(__log.length>300)__log.shift()};
let voice=null,voicePicked=false;function pickVoice(){if(voicePicked)return;const v=speechSynthesis.getVoices();if(!v.length)return;voice=v.find(x=>/en[-_]US/.test(x.lang)&&/Samantha|Google|Aria|Jenny|Alex/.test(x.name))||v.find(x=>/en[-_]GB/.test(x.lang)&&/Daniel|Serena|Google UK|Kate|Arthur/.test(x.name))||v.find(x=>/en[-_](US|GB)/.test(x.lang))||v.find(x=>/^en/.test(x.lang))||null;voicePicked=true}
if(hasSS){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
// speech fallback: global utterance ref, cancel + 80ms gap when busy, onstart watchdog 700ms with one retry
let curU=null,ttsT=0,ttsWd=0;
function tts(t,my){if(!hasSS||!t)return;clearTimeout(ttsT);clearTimeout(ttsWd);let busy=false;try{busy=speechSynthesis.speaking||speechSynthesis.pending;speechSynthesis.cancel()}catch(e){}
  const go=retry=>{if(my!==undefined&&my!==playSeq)return;try{pickVoice();const u=new SpeechSynthesisUtterance(t);u.lang=voice?voice.lang:'en-US';if(voice)u.voice=voice;u.rate=.9;curU=u;let st=false;
    u.onstart=()=>{st=true;LOG(my,'tts','start')};u.onend=()=>{LOG(my,'tts','end');if(curU===u)curU=null};u.onerror=e=>LOG(my,'tts','err:'+(e&&e.error));
    speechSynthesis.speak(u);speechSynthesis.resume();
    ttsWd=setTimeout(()=>{if(!st&&curU===u&&!retry&&(my===undefined||my===playSeq)){LOG(my,'tts','retry');try{speechSynthesis.cancel()}catch(e){}setTimeout(()=>go(true),80)}},700)}catch(e){}};
  if(busy)ttsT=setTimeout(()=>go(false),80);else go(false)}
function stopAll(){clearTimeout(ttsT);clearTimeout(ttsWd);pool.forEach(a=>{if(!a.paused)a.pause()});if(!player.paused)player.pause();if(hasSS)try{speechSynthesis.cancel()}catch(e){}curU=null}
// primary: youdao mp3 (reachable in China) once canplaythrough; if not ready within 300ms -> speech
const AUD_WAIT=300;let playSeq=0;
function play(url,text){stopAll();const my=++playSeq;const t0=performance.now();const a=getA(url);LOG(my,'req',text);
  const start=()=>{if(my!==playSeq)return Promise.resolve(false);try{a.currentTime=0}catch(e){}
    a.addEventListener('playing',()=>{if(my!==playSeq){a.pause();return}lastLatency=Math.round(performance.now()-t0);window.__lat=lastLatency;LOG(my,'aud','playing')},{once:true});
    a.addEventListener('ended',()=>LOG(my,'aud','ended'),{once:true});
    return a.play().then(()=>{unlocked=true;return true}).catch(err=>{if(err&&err.name==='NotAllowedError')throw err;if(my===playSeq)tts(text,my);return false})};
  if(a.readyState>=4)return start();
  cacheAudio([url]);
  return new Promise((res,rej)=>{let done=false;const on=()=>{if(done)return;done=true;clearTimeout(tm);start().then(res,rej)};a.addEventListener('canplaythrough',on,{once:true});
    const tm=setTimeout(()=>{if(done)return;done=true;a.removeEventListener('canplaythrough',on);LOG(my,'aud','timeout->tts');if(my===playSeq)tts(text,my);res(false)},AUD_WAIT)})}
const sayWord=w=>w?play(wordURL(w.word),w.word).catch(()=>false):Promise.resolve(false);
const saySent=w=>w&&w.sentence&&play(sentURL(w.sentence),w.sentence).catch(()=>false);
// first touch anywhere unlocks media + speech (silent utterance), then reads the current word
function unlockAll(){if(unlocked)return;unlocked=true;$('#hint').style.display='none';
  pool.forEach(a=>{a.muted=true;const p=a.play();p&&p.then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false})});
  try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}
  setTimeout(()=>{if(view==='study')sayWord(curWord())},60)}
['touchend','pointerup','keydown'].forEach(ev=>document.addEventListener(ev,unlockAll,{capture:true,once:false}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){if(view==='study'&&unlocked)setTimeout(()=>sayWord(curWord()),150)}else stopAll()});
// pre-download all audio into Cache Storage (served offline by sw.js)
let dlRunning=false;const dlQueue=new Set();
async function cacheAudio(urls){urls.forEach(u=>dlQueue.add(u));if(dlRunning||!('caches'in window))return;dlRunning=true;const c=await caches.open('vocab-audio');
  const worker=async()=>{while(dlQueue.size){const u=dlQueue.values().next().value;dlQueue.delete(u);try{if(!(await c.match(u,{ignoreVary:true}))){const r=await fetch(u,{mode:'no-cors',referrerPolicy:'no-referrer'});await c.put(u,r)}}catch(e){}}};
  await Promise.all([worker(),worker(),worker()]);dlRunning=false}
function prefetchAll(){const u=[];allWords().forEach(w=>{u.push(wordURL(w.word));if(w.sentence)u.push(sentURL(w.sentence))});cacheAudio(u)}
// ================= views =================
let view='study';const hist=[];
function go(v,push=true){if(push&&view!==v)hist.push(view);view=v;document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));
  $('#tabStudy').classList.toggle('on',v==='study');$('#tabLib').classList.toggle('on',v!=='study');$('#pop').style.display='none';window.scrollTo(0,0)}
function back(){const v=hist.pop()||'lib';go(v,false);if(v==='lib')renderLib();if(v==='study')renderStudy();if(v==='words')renderWords()}
document.querySelectorAll('[data-back]').forEach(b=>b.onclick=back);
$('#tabStudy').onclick=()=>{hist.length=0;go('study',false);renderStudy(true)};
$('#tabLib').onclick=()=>{hist.length=0;renderLib();go('lib',false)};
$('#camBtn').onclick=()=>{renderThumbs();go('photo')};
$('#closeBtn').onclick=()=>{renderLib();go('lib')};
// ================= study =================
const curWord=()=>{const ws=studyWords();if(S.idx>=ws.length)S.idx=0;return ws[S.idx]};
const stemRe=w=>new RegExp('^'+w.toLowerCase().replace(/(ation|ion|e|y)$/,'').slice(0,Math.max(4,w.length-3)).replace(/[^a-z]/g,''),'i');
function sentHTML(s,word){const re=stemRe(word);return esc(s).split(/(\s+)/).map(tok=>{if(/^\s+$/.test(tok))return' ';const m=tok.match(/^([^A-Za-z’']*)([A-Za-z’'-]+)(.*)$/);if(!m)return tok;
  return `${m[1]}<span class="w${re.test(m[2])?' t':''}" data-w="${m[2].toLowerCase().replace(/[’'].*$/,'')}">${m[2]}</span>${m[3]}`}).join('')}
const ST={new:'新词',learning:'学习中',known:'已掌握'};
function renderStudy(speak){const ws=studyWords(),C=$('#card');const cc=cat(S.cur);$('#catName').textContent=(S.cur==='__all'?'全部单词':cc?cc.name:'全部单词')+' ▾';
  $('#fixbar').style.visibility=ws.length?'visible':'hidden';if(!ws.length){$('#cnt').textContent='';C.innerHTML=`<div class="acc"></div><div class="head" style="padding:60px 24px"><div class="word" style="font-size:34px">还没有单词</div><p class="muted" style="margin-top:16px">点下方红色相机按钮拍照导入，<br>或在「词库」里手动添加。</p></div>`;return}
  const w=curWord();const ipa=w.ipaUK||w.ipaUS?[w.ipaUK&&`<span><small>英</small>/${esc(w.ipaUK)}/</span>`,w.ipaUS&&`<span><small>美</small>/${esc(w.ipaUS)}/</span>`].filter(Boolean).join(''):esc(w.ipa||'');
  C.innerHTML=`<div class="acc"></div><div class="head"><div class="word"><span class="wt">${esc(w.word)}</span>${lvBadge(w)}</div><div class="ipa">${ipa}</div>
   <div class="mean">${w.pos?`<span class="pos">${esc(w.pos)}</span>`:''}${esc(w.meaning)}</div>${w.hint?`<span class="pill">谐音 ${esc(w.hint)}</span>`:''}</div>
   <div class="ex"><div class="exh"><span>例句 · 点不认识的词${w.filled?'<span class="tag">补全</span>':''}</span><button class="gbtn" id="spS" aria-label="读例句">${ICON.spk}</button></div>
   <div class="sent">${sentHTML(w.sentence||'',w.word)}</div>${w.sentence?`<div class="trans" id="trans">${w.trans?esc(w.trans):'<span class="muted">翻译中…</span>'}</div>`:''}
   ${w.extra?`<div class="extra"><b>书上还写了</b>${esc(w.extra)}</div>`:''}</div>`;$('#cnt').innerHTML=`<b>${S.idx+1}/${ws.length}</b><i>${ST[w.status||'new']}</i>`;requestAnimationFrame(fitCard);$('#spS').onclick=()=>saySent(w);
  if(w.sentence&&!w.trans)autoTrans(w);
  C.querySelectorAll('.sent .w').forEach(s=>s.onclick=e=>{e.stopPropagation();wordPop(s)});
  const n=ws.length,nx=ws[(S.idx+1)%n],pv=ws[(S.idx-1+n)%n];
  keepPool([wordURL(w.word),w.sentence&&sentURL(w.sentence),wordURL(nx.word),nx.sentence&&sentURL(nx.sentence),wordURL(pv.word)].filter(Boolean));
  if(speak)sayWord(w)}
const trBusy=new Set();async function autoTrans(w){if(trBusy.has(w.id))return;trBusy.add(w.id);let t='';try{t=await Enrich.translate(w.sentence)}catch(e){}trBusy.delete(w.id);
  if(t&&!w.trans){w.trans=t;save()}if(curWord()!==w||!$('#trans'))return;if(w.trans)return $('#trans').innerHTML=esc(w.trans);
  let g='';try{g=await Enrich.gloss(w.sentence)}catch(e){}if(curWord()===w&&$('#trans'))$('#trans').innerHTML=g?`<span class="tag">离线逐词释义 · 非整句翻译</span> <span class="gl">${esc(g)}</span>`:'<span class="muted">翻译暂时失败，联网后会自动重试</span>'}
$('#spW').innerHTML=ICON.spk;$('#prev').innerHTML=ICON.l;$('#next').innerHTML=ICON.r;
$('#spW').onclick=()=>sayWord(curWord());['prev','next'].forEach((id,k)=>{const b=$('#'+id),d=k?1:-1;let viaPtr=0;b.addEventListener('pointerup',e=>{if(e.pointerType==='mouse'&&e.button)return;viaPtr=Date.now();step(d)});b.onclick=()=>{if(Date.now()-viaPtr<700)return;step(d)}});
function step(d){const n=studyWords().length;if(!n)return;S.idx=(S.idx+d+n)%n;save();renderStudy(true)}
function mark(st){const w=curWord();if(!w)return;w.status=st;save();step(1)}
$('#dunno').onclick=()=>mark('learning');$('#gotit').onclick=()=>mark('known');
async function wordPop(span){document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'));span.classList.add('on');const raw=span.dataset.w;const lem=CEFR.lemma(raw);
  play(wordURL(raw),raw);const P=$('#pop');P.style.display='block';P.innerHTML=`<span class="pw">${esc(raw)}</span><span class="pi" id="pi"></span> ${lvBadge({word:raw},'tag')}<div class="muted" id="pm" style="margin-top:6px">查询中…</div>`;
  const known=allWords().find(x=>x.word.toLowerCase()===raw||x.word.toLowerCase()===lem);
  if(known&&known.meaning){$('#pi').textContent=(known.ipaUK||known.ipaUS)?'/'+(known.ipaUK||known.ipaUS)+'/':'';$('#pm').innerHTML=`<div class="pz">${esc((known.pos?known.pos+' ':'')+known.meaning)}</div>`;return}
  const live=()=>P.style.display!=='none'&&span.classList.contains('on');
  Enrich.ipa(lem).then(ip=>{if(live()&&ip&&$('#pi'))$('#pi').textContent='/'+(ip.uk||ip.us)+'/'}).catch(()=>{});
  const m=await Enrich.meaning(lem).catch(()=>'')||await Enrich.meaning(raw).catch(()=>'');if(!live())return;
  $('#pm').innerHTML=`<div class="pz">${esc(m||'暂无释义')}</div>`+(lem!==raw?`<div class="muted" style="font-size:13px">原形 ${esc(lem)}</div>`:'')}
document.addEventListener('click',e=>{if(!e.target.closest('#pop')&&!e.target.closest('.sent .w')){$('#pop').style.display='none';document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'))}});
// ================= sheet menu =================
function sheet(items,title=''){$('#sheetT').innerHTML=title;const I=$('#sheetIn');I.innerHTML=items.map((it,i)=>`<button class="item${it[2]?' danger':''}" data-i="${i}">${it[0]}</button>`).join('')+'<button class="item" style="text-align:center;border:0;color:#8b857a">取消</button>';
  $('#sheet').classList.add('on');I.querySelectorAll('.item').forEach(b=>b.onclick=()=>{$('#sheet').classList.remove('on');const it=items[b.dataset.i];it&&it[1]()})}
$('#sheet').onclick=e=>{if(e.target.id==='sheet')$('#sheet').classList.remove('on')};
try{if(!localStorage.getItem('ctlV2')){const o=+localStorage.getItem('ctlTop');if(!o||o===53||o===55)localStorage.setItem('ctlTop',45);localStorage.setItem('ctlV2',1)}}catch(_){}
const ctlGet=()=>{const v=+localStorage.getItem('ctlTop');return v>=35&&v<=70?v:45};const ctlSet=v=>{if(ctlSet.r&&localStorage.getItem('ctlPos')){localStorage.removeItem('ctlPos');setTimeout(ctlApply)}v=Math.max(35,Math.min(70,Math.round(v)));document.documentElement.style.setProperty('--ctl-top',v+'dvh');localStorage.setItem('ctlTop',v);return v};ctlSet(ctlGet());
// long-press (0.5s) the control group to drag it anywhere; saved as viewport fractions, clamped on screen
const ctlPosGet=()=>{try{const o=JSON.parse(localStorage.getItem('ctlPos'));return o&&isFinite(o.x)&&isFinite(o.y)?o:null}catch(e){return null}};
function ctlApply(){const F=$('#fixbar');if(!F)return;const o=ctlPosGet();if(!o){F.style.left=F.style.top='';F.classList.remove('moved');return}
  const w=F.offsetWidth,h=F.offsetHeight,x=Math.max(4,Math.min(innerWidth-w-4,o.x*innerWidth)),y=Math.max(4,Math.min(innerHeight-h-4,o.y*innerHeight));F.style.setProperty('left',x+'px','important');F.style.setProperty('top',y+'px','important');F.classList.add('moved')}
function ctlReset(){localStorage.removeItem('ctlPos');ctlSet(45);ctlApply();toast('按钮已恢复默认位置')}
addEventListener('resize',()=>requestAnimationFrame(ctlApply));
(()=>{const F=$('#fixbar');if(!F)return;let tm=0,drag=false,eat=false,sx=0,sy=0,ox=0,oy=0,pid=null;
  F.addEventListener('pointerdown',e=>{eat=false;sx=e.clientX;sy=e.clientY;pid=e.pointerId;clearTimeout(tm);
    tm=setTimeout(()=>{drag=true;eat=true;const r=F.getBoundingClientRect();ox=sx-r.left;oy=sy-r.top;F.classList.add('dragging');try{F.setPointerCapture(pid)}catch(_){}navigator.vibrate&&navigator.vibrate(15)},500)});
  F.addEventListener('pointermove',e=>{if(!drag){if(Math.hypot(e.clientX-sx,e.clientY-sy)>10)clearTimeout(tm);return}e.preventDefault();
    const w=F.offsetWidth,h=F.offsetHeight,x=Math.max(4,Math.min(innerWidth-w-4,e.clientX-ox)),y=Math.max(4,Math.min(innerHeight-h-4,e.clientY-oy));
    F.style.setProperty('left',x+'px','important');F.style.setProperty('top',y+'px','important');F.classList.add('moved')});
  const end=e=>{clearTimeout(tm);if(drag){drag=false;F.classList.remove('dragging');localStorage.setItem('ctlPos',JSON.stringify({x:F.offsetLeft/innerWidth,y:F.offsetTop/innerHeight}));toast('已保存按钮位置（⋯ 菜单可恢复默认）')}if(eat){e.stopPropagation();e.preventDefault()}};
  F.addEventListener('pointerup',end,true);F.addEventListener('pointercancel',end,true);
  F.addEventListener('click',e=>{if(eat){eat=false;e.stopPropagation();e.preventDefault()}},true);
  F.addEventListener('contextmenu',e=>e.preventDefault());requestAnimationFrame(ctlApply);ctlSet.r=true})();
function ctlPanel(){go('study',false);renderStudy(false);let p=$('#ctlP');if(!p){p=document.createElement('div');p.id='ctlP';document.body.appendChild(p)}
  const draw=()=>{const v=ctlGet();p.innerHTML=`<b>按钮高度</b> <span>${v}%</span><div class="ctlr"><button class="pb" data-d="-2">▲ 上移</button><input type="range" min="35" max="70" step="2" value="${v}"><button class="pb" data-d="2">▼ 下移</button></div><div class="ctlr"><button class="pb" data-r>恢复默认 45%</button><button class="pb r" data-x>完成</button></div>`;
    p.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{ctlSet(ctlGet()+ +b.dataset.d);draw()});p.querySelector('input').oninput=e=>{ctlSet(+e.target.value);p.querySelector('span').textContent=ctlGet()+'%'};p.querySelector('input').onchange=draw;
    p.querySelector('[data-r]').onclick=()=>{ctlSet(45);draw()};p.querySelector('[data-x]').onclick=()=>{p.remove();toast('已保存按钮高度 '+ctlGet()+'%')}};draw()}
const commonMenu=()=>[['↕️ 按钮高度',ctlPanel],['📍 恢复默认位置',ctlReset],['📷 拍照导入（可多张）',()=>{renderThumbs();go('photo')}],['✍️ 手动添加单词',()=>openManual()],['⚙️ 识别设置（AI / API Key）',openSet],['⬇️ 备份数据（导出 JSON）',backup],['⬆️ 恢复数据（导入 JSON）',()=>$('#restoreFile').click()]];
$('#moreBtn').onclick=()=>{const w=curWord(),c=cat(S.cur);sheet([...(w?[['✏️ 编辑这个单词',()=>openManual(w)],['🔊 读例句',()=>saySent(w)]]:[]),...(c?[['📋 管理本分类单词',()=>openWords(c.id)]]:[]),...commonMenu()])};
$('#libMore').onclick=()=>sheet(commonMenu());
// ================= library =================
function renderLib(){const L=$('#catList');L.innerHTML='';const all=ordered();
  
  all.forEach(c=>{const d=document.createElement('div');d.className='row'+(c.parent?' child':'')+(c.id===S.cur?' sel':'');d.dataset.id=c.id;
    d.innerHTML=`<span class="drag">☰</span><div class="t"><b>${esc(c.name)}</b><small>${count(c)} 词</small></div>
    <button class="pb r" style="height:34px;padding:0 10px;font-size:13px" data-a="study">学这个类</button><button class="mini" data-a="up">↑</button><button class="mini" data-a="dn">↓</button>${c.parent?'':'<button class="mini" data-a="sub" title="新建子类">＋</button>'}<button class="mini" data-a="more">⋯</button>`;
    d.querySelector('.t').onclick=()=>{S.cur=c.id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)};
    d.querySelectorAll('button').forEach(b=>b.onclick=()=>catAct(c,b.dataset.a));L.appendChild(d)});
  const OL=document.createElement('div');OL.id='outList';const ms=libSel!==null;
  OL.innerHTML=S.lib.length?`<div class="olh"><span>未归类的单词</span><button class="olb" id="olMs">${ms?'取消':'多选'}</button></div>${ms?`<div class="olact"><button class="pb" id="olAll">全选</button><button class="pb${libAct==='del'?' r':''}" id="olDel">删除</button><button class="pb${libAct==='move'?' r':''}" id="olMove">加入分类</button><span class="muted">已选 ${libSel.size}，点右上 ✓ 确认</span></div>`:''}<ul class="ol">${S.lib.map(w=>`<li data-w="${w.id}">${ms?`<span class="chk${libSel.has(w.id)?' on':''}">✓</span>`:''}<div class="sw"><b>${esc(w.word)}</b> <span>${esc(w.pos||'')} ${esc(w.meaning||'')}</span></div><button class="swdel">删除</button></li>`).join('')}</ul>`:'';
  L.appendChild(OL);$('#libOkWrap').innerHTML=ms?'<button class="ok" id="libOk">✓</button>':'';if(ms)$('#libOk').onclick=libFinish;
  const q=s=>OL.querySelector(s);if(q('#olMs'))q('#olMs').onclick=()=>{libSel=ms?null:new Set();libAct='del';renderLib()};
  if(ms){q('#olAll').onclick=()=>{libSel=libSel.size===S.lib.length?new Set():new Set(S.lib.map(w=>w.id));renderLib()};q('#olDel').onclick=()=>{libAct='del';renderLib()};q('#olMove').onclick=()=>{libAct='move';renderLib()}}
  OL.querySelectorAll('li').forEach(li=>{const id=li.dataset.w;swipe(li,()=>delWords(S.lib,[id]));li.querySelector('.swdel').onclick=ev=>{ev.stopPropagation();delWords(null,[id])};
    li.querySelector('.sw').onclick=()=>{if(li.classList.contains('open'))return li.classList.remove('open');if(ms){libSel.has(id)?libSel.delete(id):libSel.add(id);return renderLib()}const k=S.lib.findIndex(w=>w.id===id);if(k<0)return;S.cur='__all';S.idx=k;save();hist.length=0;go('study',false);renderStudy(true)};
    if(ms)li.querySelector('.chk').onclick=li.querySelector('.sw').onclick});
  enableDrag(L,(from,to)=>{const a=cat(from),b=cat(to);if(!a||!b||a.lib||b.lib||(a.parent||null)!==(b.parent||null))return toast('只能在同级内拖动');moveIn(S.cats,a,S.cats.indexOf(b));save();renderLib()})}
function studyCat(id){S.cur=id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)}
function catAct(c,a){if(a==='study')return studyCat(c.id);
  if(a==='up'||a==='dn'){const sib=S.cats.filter(x=>(x.parent||null)===(c.parent||null));const i=sib.indexOf(c),j=i+(a==='up'?-1:1);if(j<0||j>=sib.length)return;moveIn(S.cats,c,S.cats.indexOf(sib[j]));save();renderLib()}
  else if(a==='sub'){const n=prompt('子类名称');if(n&&n.trim()){newCat(n.trim(),c.id);save();renderLib()}}
  else if(a==='more')sheet([['📋 管理单词',()=>openWords(c.id)],['✏️ 重命名',()=>{const n=prompt('新名称',c.name);if(n){c.name=n;save();renderLib()}}],
    ['🗑 删除分类',()=>delCat(c),1]])}
function delCat(c){const ks=c.parent?[]:kids(c.id);const n=count(c);
  const title=`<b>删除「${esc(c.name)}」？</b>`+(ks.length?`这是大类，下面的 ${ks.length} 个子类（${ks.map(k=>esc(k.name)).join('、')}）也会一起删除。`:'')+`共 ${n} 个单词。`;
  const go2=keep=>{const ids=[c.id,...ks.map(k=>k.id)];if(keep){[c,...ks].forEach(x=>S.lib.push(...x.words))}S.cats=S.cats.filter(x=>!ids.includes(x.id));if(ids.includes(S.cur))S.cur='__all';S.idx=0;save();renderLib();toast(keep?`已删除分类，${n} 个单词回到外面（未归类）`:`已删除分类和 ${n} 个单词`)};
  sheet([[ks.length?'只删分类（含子类），保留单词':'只删分类，保留单词',()=>go2(true)],[ks.length?'分类和单词一起删（含子类）':'分类和单词一起删',()=>{if(confirm(`确定永久删除 ${n} 个单词？`))go2(false)},1]],title)}
$('#addParent').onclick=()=>{const n=prompt('大类名称');if(n&&n.trim()){const c=newCat(n.trim());if(!S.cur)S.cur=c.id;save();renderLib()}};
function enableDrag(list,done){list.querySelectorAll('.drag').forEach(h=>{h.onpointerdown=e=>{const row=h.closest('.row');row.style.opacity=.5;h.setPointerCapture(e.pointerId);
  h.onpointerup=ev=>{row.style.opacity='';h.onpointerup=null;const el=document.elementFromPoint(ev.clientX,ev.clientY);const t=el&&el.closest('.row');if(t&&t!==row)done(row.dataset.id,t.dataset.id)}}})}
function catOptions(sel){sel.innerHTML='<option value="__lib">不分类（放在外面）</option>'+ordered().map(c=>`<option value="${c.id}">${c.parent?'　└ ':''}${esc(c.name)}</option>`).join('');sel.value=cat(S.cur)?S.cur:'__lib'}
// ================= words of a category =================
let libSel=null,libAct='del';
function swipe(el,_){let x0=null,y0=0;el.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});el.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)){document.querySelectorAll('.open').forEach(o=>o!==el&&o.classList.remove('open'));el.classList.toggle('open',dx<0)}})}
function delWords(_,ids){const set=new Set(ids);if(!confirm(`删除 ${set.size} 个单词？`))return false;S.lib=S.lib.filter(w=>!set.has(w.id));S.cats.forEach(c=>c.words=c.words.filter(w=>!set.has(w.id)));S.idx=0;save();if(view==='words')renderWords();renderLib();toast(`已删除 ${set.size} 个单词`);return true}
function libFinish(){if(!libSel.size){libSel=null;return renderLib()}const ids=[...libSel];
  if(libAct==='del'){if(delWords(null,ids))libSel=null;return renderLib()}
  const targets=ordered();if(!targets.length)return toast('请先新建分类');sheet(targets.map(t=>[(t.parent?'　└ ':'')+esc(t.name),()=>{const mv=S.lib.filter(w=>libSel.has(w.id));S.lib=S.lib.filter(w=>!libSel.has(w.id));t.words.push(...mv);libSel=null;save();renderLib();toast(`已把 ${mv.length} 个词加入「${t.name}」`)}]),'<b>加入到哪个分类？</b>')}
let wCat=null,wMode=null,wSel=new Set();
function openWords(id){wCat=id;wMode=null;wSel.clear();renderWords();go('words')}
function renderWords(){const c=cat(wCat);if(!c)return;$('#wTitle').textContent=c.lib?'未归类的单词':c.name;const L=$('#wList');$('#wAddMode').style.display=c.lib?'none':'';$('#wOutMode').style.display=c.lib?'none':'';$('#wAddMode').classList.toggle('r',wMode==='add');$('#wOutMode').classList.toggle('r',wMode==='out');
  const list=wMode==='add'?S.lib:c.words;L.innerHTML=wMode==='add'?'<p class="muted">只列出外面（未归类）的单词；已在其他分类里的单词不能选。</p>'+(S.lib.length?'':'<p class="muted">外面没有未归类的单词</p>'):(c.words.length?'':(c.lib?'<p class="muted">导入的单词会放在这里。点「多选加入分类」把它们放进分类，放进去后就不再显示在外面。</p>':'<p class="muted">这个分类自身没有单词（子类单词请到子类里管理）</p>'));
  $('#wOkWrap').innerHTML=wMode?'<button class="ok" id="wOk">✓</button>':'';if(wMode)$('#wOk').onclick=wFinish;
  $('#wDelMode').classList.toggle('r',wMode==='del');$('#wMoveMode').classList.toggle('r',wMode==='move');$('#wEditMode').classList.toggle('r',wMode==='edit');
  list.forEach((w,i)=>{if(wMode==='edit'){const d=document.createElement('div');d.className='ecard';d.innerHTML=`<div class="f">${editorHTML(w)}</div>`;L.appendChild(d);bindEditor(d,w,true);return}
    const d=document.createElement('div');d.className='row'+(wSel.has(w.id)?' sel':'');d.dataset.id=w.id;
    d.innerHTML=`${wMode&&wMode!=='edit'?`<span class="chk${wSel.has(w.id)?' on':''}">✓</span>`:'<span class="drag">☰</span>'}<div class="t"><b>${esc(w.word)}</b> ${lvBadge(w,'tag')}<div class="sub">${esc(w.pos)} ${esc(w.meaning)}${w.hint?'　谐音 '+esc(w.hint):''}</div></div>${wMode?'':'<button class="mini" data-a="-1">↑</button><button class="mini" data-a="1">↓</button>'}`;
    if(!wMode){d.insertAdjacentHTML('beforeend','<button class="swdel">删除</button>');swipe(d);d.querySelector('.swdel').onclick=ev=>{ev.stopPropagation();delWords(null,[w.id])}}
    if(wMode&&wMode!=='edit')d.onclick=()=>{wSel.has(w.id)?wSel.delete(w.id):wSel.add(w.id);renderWords()};
    d.querySelectorAll('button.mini').forEach(b=>b.onclick=()=>{const j=i+ +b.dataset.a;if(j<0||j>=c.words.length)return;moveIn(c.words,w,j);save();renderWords()});L.appendChild(d)});
  if(!wMode)enableDrag(L,(f,t)=>{const a=c.words.find(x=>x.id===f),b=c.words.find(x=>x.id===t);moveIn(c.words,a,c.words.indexOf(b));save();renderWords()})}
$('#wMoveMode').onclick=()=>{wMode=wMode==='move'?null:'move';wSel.clear();renderWords()};
$('#wAddMode').onclick=()=>{wMode=wMode==='add'?null:'add';wSel.clear();renderWords()};
$('#wOutMode').onclick=()=>{wMode=wMode==='out'?null:'out';wSel.clear();renderWords()};
$('#wDelMode').onclick=()=>{wMode=wMode==='del'?null:'del';wSel.clear();renderWords()};
$('#wEditMode').onclick=()=>{wMode=wMode==='edit'?null:'edit';renderWords()};
$('#wFix').onclick=async()=>{const c=cat(wCat);toast('正在补全…',60000);for(const w of c.words)await lite(w,true);save();renderWords();toast('已补全音标、谐音和等级')};
function wFinish(){const c=cat(wCat);if(wMode==='move'&&wSel.size){const targets=ordered().filter(x=>x.id!==c.id);if(!targets.length)return toast('请先在词库新建分类');
  return sheet(targets.map(t=>[(t.parent?'　└ ':'')+esc(t.name),()=>{const mv=c.words.filter(w=>wSel.has(w.id));c.words=c.words.filter(w=>!wSel.has(w.id));t.words.push(...mv);wMode=null;wSel.clear();save();renderWords();toast(`已把 ${mv.length} 个词加入「${t.name}」`)}]),'<b>加入到哪个分类？</b>')}if(wMode==='add'&&wSel.size){const mv=S.lib.filter(w=>wSel.has(w.id));S.lib=S.lib.filter(w=>!wSel.has(w.id));c.words.push(...mv);wMode=null;wSel.clear();save();renderWords();return toast(`已把 ${mv.length} 个词加入「${c.name}」`)}
  if(wMode==='out'&&wSel.size){const mv=c.words.filter(w=>wSel.has(w.id));c.words=c.words.filter(w=>!wSel.has(w.id));S.lib.push(...mv);wMode=null;wSel.clear();save();renderWords();return toast(`已把 ${mv.length} 个词移回外面`)}
  if(wMode==='del'&&wSel.size){if(!confirm(`删除选中的 ${wSel.size} 个单词？`))return;c.words=c.words.filter(w=>!wSel.has(w.id))}wMode=null;wSel.clear();save();renderWords();toast('已完成')}
// ================= shared editor =================
function editorHTML(w){return `<div class="two"><input class="w" data-k="word" placeholder="单词" value="${esc(w.word)}"><span data-lv style="align-self:center">${lvBadge(w,'tag')}</span></div>
 <div class="two"><div style="flex:1"><label>英式音标</label><input data-k="ipaUK" value="${esc(w.ipaUK||'')}"></div><div style="flex:1"><label>美式音标</label><input data-k="ipaUS" value="${esc(w.ipaUS||'')}"></div></div>
 <div class="two"><div style="width:70px"><label>词性</label><input data-k="pos" value="${esc(w.pos)}"></div><div style="flex:1"><label>中文释义</label><input data-k="meaning" value="${esc(w.meaning)}"></div></div>
 <label>谐音</label><input data-k="hint" value="${esc(w.hint)}">
 <label>例句${w.filled?' <span class="tag">补全</span>':''}</label><textarea data-k="sentence">${esc(w.sentence)}</textarea>
 <label>例句翻译</label><textarea data-k="trans">${esc(w.trans)}</textarea>
 <label>书上还写了（派生词等，可选）</label><input data-k="extra" value="${esc(w.extra||'')}">`}
function bindEditor(d,w,live){d.querySelectorAll('[data-k]').forEach(i=>i.oninput=()=>{w[i.dataset.k]=i.value;if(i.dataset.k==='word'){d.querySelector('[data-lv]').innerHTML=lvBadge(w,'tag')}if(i.dataset.k==='sentence')w.filled=false;if(live)save()})}
// ================= enrichment helpers =================
async function lite(w,force){const ip=await Enrich.ipa(w.word.toLowerCase());if(ip&&(force||!w.ipaUK&&!w.ipaUS)){w.ipaUK=ip.uk;w.ipaUS=ip.us}
  if(!w.hint||/[A-Za-z]/.test(w.hint)||force&&w.hintAuto!==false)w.hint=Enrich.xieyinW(w.word,w.ipaUK||w.ipaUS)||w.hint;if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);w.v=6}
// ================= photo import =================
let shots=[];
$('#pickBtn').onclick=()=>$('#pick').click();$('#shootBtn').onclick=()=>$('#shoot').click();
['pick','shoot'].forEach(id=>$('#'+id).onchange=e=>{for(const f of e.target.files)shots.push({f,url:URL.createObjectURL(f)});e.target.value='';renderThumbs()});
function renderThumbs(){showMode();const T=$('#thumbs');T.innerHTML=shots.map((s,i)=>`<div class="th"><img src="${s.url}"><span class="n">${i+1}</span><button class="x" data-x="${i}">✕</button><div class="mv"><button data-m="${i}" data-d="-1">‹</button><button data-m="${i}" data-d="1">›</button></div></div>`).join('');
  T.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{URL.revokeObjectURL(shots[b.dataset.x].url);shots.splice(+b.dataset.x,1);renderThumbs()});
  T.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const i=+b.dataset.m,j=i+ +b.dataset.d;if(j<0||j>=shots.length)return;[shots[i],shots[j]]=[shots[j],shots[i]];renderThumbs()});
  $('#runOcr').style.display=shots.length?'block':'none';$('#runOcr').textContent=`开始识别（${shots.length} 张）`}
let pending=null;
function prog(t,p){$('#progT').textContent=t;$('#progB').style.width=Math.round(p*100)+'%'}
async function prep(f){const bmp=await createImageBitmap(f);const m=Math.max(bmp.width,bmp.height);if(m<=6400&&m>=900)return f;const k=m>6400?6400/m:1600/m;
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return c}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('脚本加载失败'));document.head.appendChild(s)})}
// ================= settings (xAI key lives only in IndexedDB 'kv'/'settings') =================
let CFG={ai:false,key:'',model:'grok-4.7'};
idbGet('kv','settings').then(v=>{if(v)CFG={...CFG,...v};showMode()}).catch(()=>{});
function showMode(){const el=$('#ocrMode');if(el)el.textContent=CFG.ai&&CFG.key?`识别方式：AI（${CFG.model}），失败自动改用本地识别`:'识别方式：本地 Tesseract（可在 ⋯ → 识别设置 开启 AI）'}
function openSet(){$('#setAI').checked=CFG.ai;$('#setKey').value=CFG.key;$('#setModel').value=CFG.model;$('#setMsg').textContent='';go('set')}
function readSet(){return{ai:$('#setAI').checked,key:$('#setKey').value.trim(),model:$('#setModel').value.trim()||'grok-4.7'}}
$('#setOk').onclick=async()=>{CFG=readSet();if(CFG.ai&&!CFG.key)CFG.ai=false;await idbSet('kv','settings',CFG);showMode();toast('已保存');back()};
$('#setClear').onclick=async()=>{CFG={...CFG,key:'',ai:false};await idbSet('kv','settings',CFG);openSet();toast('已清除 Key')};
$('#setTest').onclick=async()=>{const c=readSet();$('#setMsg').textContent='测试中…';try{const r=await xai(c,[{type:'input_text',text:'Reply with OK'}]);$('#setMsg').textContent='✅ 可用：'+r.slice(0,40)}catch(e){$('#setMsg').textContent='❌ '+e.message}};
async function xai(c,content){const r=await fetch('https://api.x.ai/v1/responses',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.key},
  body:JSON.stringify({model:c.model,store:false,input:[{role:'user',content}]})});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error((j.error&&(j.error.message||j.error))||j.message||('HTTP '+r.status));
  if(j.output_text)return j.output_text;const t=[];(j.output||[]).forEach(o=>(o.content||[]).forEach(x=>{if(x.type==='output_text'&&x.text)t.push(x.text)}));return t.join('')}
async function toJpegURL(f){const bmp=await createImageBitmap(f);const k=Math.min(1,2400/Math.max(bmp.width,bmp.height));const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.88)}
const AI_PROMPT=`This is a photo of an English vocabulary book page. Extract every printed headword entry in page order (top to bottom, left column before right column).
Return STRICT JSON only, no markdown, in this shape: {"entries":[{"word":"","pos":"","meaning_zh":"","sentence_en":"","sentence_zh":""}]}
Rules: pos like "n." "v." "adj."; meaning_zh is the printed Chinese meaning; sentence_en is the printed example sentence for that word, complete and correctly spelled; sentence_zh is a natural Simplified Chinese translation of sentence_en.
Ignore handwriting, pen marks, highlighter and text bleeding through from the other side of the paper. If printed text is partly covered or cut off, reconstruct it from context. Skip anything that is not a headword entry.`;
async function aiOCR(f){const url=await toJpegURL(f);const txt=await xai(CFG,[{type:'input_image',image_url:url,detail:'high'},{type:'input_text',text:AI_PROMPT}]);
  const a=txt.indexOf('{'),b=txt.lastIndexOf('}');const j=JSON.parse(txt.slice(a,b+1));const arr=Array.isArray(j)?j:j.entries||[];
  return arr.filter(x=>x&&x.word&&/^[A-Za-z][A-Za-z' -]*$/.test(String(x.word).trim())).map(x=>({word:String(x.word).trim(),pos:x.pos||'',meaning:x.meaning_zh||'',sentence:x.sentence_en||'',trans:x.sentence_zh||'',hint:'',extra:'',filled:false}))}
// ================= photo import: straight into 未分类 / 全部单词 =================
let tessW=null;async function tessOCR(f,cur,N){if(!window.Tesseract){prog('正在加载本地识别引擎（首次约 20MB）…',cur/N);await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')}
  if(!tessW)tessW=await Tesseract.createWorker(['eng','chi_sim'],1,{logger:m=>{if(m.status==='recognizing text')prog(`第${tessW._cur+1}/${tessW._N}张 · 本地识别 ${Math.round(m.progress*100)}%`,(tessW._cur+m.progress*.6)/tessW._N)}});
  tessW._cur=cur;tessW._N=N;const r=await tessW.recognize(await prep(f));const ents=parseOCR(r.data.lines.map(l=>({t:l.text,c:l.confidence})));
  for(let i=0;i<ents.length;i++){prog(`第${cur+1}/${N}张 · 查词典补全 ${i+1}/${ents.length}（${ents[i].word}）`,(cur+.6+.4*i/ents.length)/N);await Enrich.enrich(ents[i],{ocr:true})}Enrich.linkDerived(ents);return ents}
let importing=false;
$('#runOcr').onclick=async()=>{if(!shots.length||importing)return;importing=true;$('#runOcr').style.display='none';$('#prog').style.display='block';const list=shots.slice(),N=list.length;const got=[];let usedAI=0,fellBack=0,lastErr='';
  try{for(let cur=0;cur<N;cur++){let ents=null;
      if(CFG.ai&&CFG.key){prog(`第${cur+1}/${N}张 · AI 识别中…`,cur/N);try{ents=await aiOCR(list[cur].f);usedAI++;
          try{await Enrich.dict();ents.forEach(e=>{if(e.sentence)e.sentence=Enrich.ocrFix(e.sentence,e.word)})}catch(_){}
          for(let i=0;i<ents.length;i++){prog(`第${cur+1}/${N}张 · 补全音标/谐音 ${i+1}/${ents.length}`,(cur+.5+.5*i/ents.length)/N);await lite(ents[i]);if(!ents[i].meaning)ents[i].meaning=await Enrich.meaning(ents[i].word.toLowerCase()).catch(()=>'')}}
        catch(e){lastErr=e.message;fellBack++;ents=null}}
      if(!ents)ents=await tessOCR(list[cur].f,cur,N);
      ents.forEach(e=>{const{flags,photo,ocrSentence,_sel,...x}=e;x.id=uid();x.status='new';x.v=2;got.push(x)})}
    const before=allWords().length;const[gw,gm]=addNew(got),gn=gw.length;S.cur='__all';S.idx=Math.min(before,Math.max(0,allWords().length-1));save();
    shots.forEach(s=>URL.revokeObjectURL(s.url));shots=[];renderThumbs();$('#prog').style.display='none';
    toast(impMsg(gn,gm)+(fellBack?`（AI 失败 ${fellBack} 张，已改用本地识别：${lastErr.slice(0,40)}）`:''),fellBack?5000:2600);prefetchAll();hist.length=0;renderLib();go('lib',false)}
  catch(err){prog('识别失败：'+(err&&err.message||err)+'。请检查网络后重试，或手动添加。',0);$('#runOcr').style.display='block'}
  finally{importing=false;if(tessW){tessW.terminate().catch(()=>{});tessW=null}}};

// ================= import by link / code =================
function b64uDec(s){s=s.replace(/[^A-Za-z0-9+/_-]/g,'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';if(s.length%4===1)s=s.slice(0,-1);
  const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new TextDecoder('utf-8',{fatal:false}).decode(u)}
function cleanTxt(t){return String(t||'').normalize('NFKC').replace(/[\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g,'').trim()}
function mapItems(arr){if(!Array.isArray(arr))arr=arr.entries||arr.words||[];
  const out=arr.filter(x=>x&&x.word&&String(x.word).trim()).map(x=>({word:String(x.word).trim(),pos:x.pos||'',meaning:x.meaning_zh||x.meaning||'',sentence:x.sentence_en||x.sentence||'',trans:x.sentence_zh||x.trans||'',hint:'',extra:'',filled:false,src:'import'}));
  if(!out.length)throw new Error('没有找到单词');return out}
const PACK_RE=/^(?:PZ[:：]\s*)?([A-Za-z0-9_-]{1,32})$/i;
async function fetchPack(id){const r=await fetch('packs/'+encodeURIComponent(id.toLowerCase())+'.json?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error(`找不到词包「${id}」`);return mapItems(await r.json())}
async function parseImport(txt){txt=cleanTxt(txt);if(!txt)throw new Error('内容为空');
  const pk=txt.replace(/\s+/g,'').match(PACK_RE);if(pk&&!/^PZCK1/i.test(txt)&&txt.replace(/\s+/g,'').length<=35)return fetchPack(pk[1]);
  let d=txt;const m=txt.match(/#import=([\s\S]+)/);if(m)d=m[1];try{d=decodeURIComponent(d)}catch(e){}d=d.replace(/^\s*PZCK1\s*[:：]?/i,'').trim();
  if(/^[\[{]/.test(d))return mapItems(JSON.parse(d));let j;try{j=JSON.parse(b64uDec(d))}catch(e){throw new Error('代码不完整或被改动了，请改用短码（如 p4）')}return mapItems(j)}
const wkey=w=>(w.word||'').trim().toLowerCase();
function addNew(arr){const have=new Set(allWords().map(wkey)),ws=[];let skip=0;for(const x of arr){const k=wkey(x);if(!k||have.has(k)){skip++;continue}have.add(k);ws.push(x)}S.lib.push(...ws);return[ws,skip]}
const impMsg=(n,m)=>`已导入 ${n} 个`+(m?`，跳过 ${m} 个重复`:'');
let impBusy=false;
async function importItems(items,msg){if(impBusy)return;impBusy=true;setTimeout(()=>impBusy=false,1500);const before=allWords().length;const[ws,m]=addNew(items.map(x=>({...x,id:uid(),status:'new',v:2}))),n=ws.length;S.cur='__all';S.idx=Math.min(before,Math.max(0,allWords().length-1));save();
  toast(impMsg(n,m),3000);hist.length=0;renderLib();go('lib',false);
  for(const w of ws){try{await lite(w);if(!w.meaning)w.meaning=await Enrich.meaning(w.word.toLowerCase())}catch(e){}save()}prefetchAll();if(view==='study')renderStudy(false);if(view==='lib')renderLib();return ws.length}
$('#pasteBtn').onclick=async()=>{if(impBusy)return;try{const items=await parseImport($('#pasteBox').value);$('#pasteBox').value='';await importItems(items)}catch(e){toast('无法识别：'+e.message,3500)}};
let hashDone='';async function hashImport(){if(!/#import=/.test(location.hash))return;const raw=location.hash;if(hashDone===raw||sessionStorage.getItem('imp:'+raw))return history.replaceState(null,'',location.pathname+location.search);hashDone=raw;try{sessionStorage.setItem('imp:'+raw,1)}catch(_){}history.replaceState(null,'',location.pathname+location.search);
  try{const items=await parseImport(raw);const code='PZCK1:'+raw.split('#import=')[1];await importItems(items);
    if(!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches)sheet([['📋 复制导入代码（到主屏幕 App 里粘贴）',()=>{navigator.clipboard&&navigator.clipboard.writeText(code).then(()=>toast('已复制，打开主屏幕 App → 拍照 → 粘贴导入'),()=>prompt('长按复制这段代码',code))}]],`<b>已导入 ${items.length} 个词</b>如果你平时用的是主屏幕上的「拍照词库」，它和 Safari 的数据是分开的。复制下面的代码，到主屏幕 App 的拍照页「粘贴导入链接/代码」里粘贴即可。`)}
  catch(e){toast('导入链接无效：'+e.message,4000)}}
window.addEventListener('hashchange',hashImport);
// ================= manual =================
let mWord=null,mEdit=false;
function openManual(w){mEdit=!!w;mWord=w||{id:uid(),word:'',ipaUK:'',ipaUS:'',pos:'',meaning:'',hint:'',sentence:'',trans:'',extra:'',status:'new',v:2};
  $('#mTitle').textContent=mEdit?'编辑单词':'手动添加';$('#mForm').innerHTML=(mEdit?'':'<div class="fm"><label>分类</label><select id="mCat"></select></div>')+editorHTML(mWord);if(!mEdit)catOptions($('#mCat'));bindEditor($('#mForm'),mWord,mEdit);go('manual')}
$('#manualBtn').onclick=()=>openManual();
$('#mAuto').onclick=async()=>{const w=mWord;if(!w.word.trim())return toast('先输入单词');const b=$('#mAuto');b.textContent='补全中…';
  const e=await Enrich.enrich({...w,word:w.word.trim()});['ipaUK','ipaUS','hint','meaning','sentence','trans','filled'].forEach(k=>{if(!w[k]||k==='ipaUK'||k==='ipaUS')w[k]=e[k]});if(!w.pos&&e.pos)w.pos=e.pos;
  const sel=$('#mCat')&&$('#mCat').value;$('#mForm').innerHTML=(mEdit?'':'<div class="fm"><label>分类</label><select id="mCat"></select></div>')+editorHTML(w);if(!mEdit){catOptions($('#mCat'));$('#mCat').value=sel}bindEditor($('#mForm'),w,mEdit);b.textContent='自动补全音标 / 谐音 / 释义 / 翻译';if(mEdit)save()};
$('#mOk').onclick=async()=>{const w=mWord;if(!w.word.trim())return toast('请输入单词');w.word=w.word.trim();
  if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);if(!w.hint&&(w.ipaUK||w.ipaUS))w.hint=Enrich.xieyinW(w.word,w.ipaUK||w.ipaUS);
  if(!mEdit){(cat($('#mCat').value)||LIBC).words.push(w);toast('已添加，可继续输入');save();prefetchAll();openManual();hist.pop()}else{save();toast('已保存');back()}};
// ================= backup / restore =================
function backup(){const b=new Blob([JSON.stringify({app:'paizhaociku',v:2,date:new Date().toISOString(),data:S},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='拍照词库备份-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
$('#restoreFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const j=JSON.parse(await f.text());const d=j.data||j;if(!Array.isArray(d.cats))throw 0;
  if(!confirm('恢复会覆盖当前全部数据，确定？'))return;S=d;fixData();await idbSet('kv','state',S);migrate();renderLib();toast('恢复成功')}catch(_){toast('文件格式不正确')}};
// ================= migration from v1 =================
// v5: no 未分类 category; each word in at most one category; uncategorized words live in S.lib
function fixData(){S.lib=Array.isArray(S.lib)?S.lib:[];const L=S.cats.filter(c=>c.loose||c.id==='__loose');L.forEach(c=>S.lib.push(...c.words));S.cats=S.cats.filter(c=>!L.includes(c));if(L.some(c=>c.id===S.cur))S.cur='__all';
  const seen=new Set(),key=w=>w.id||w;const ord=[...S.cats.filter(c=>!c.parent).flatMap(p=>[p,...S.cats.filter(k=>k.parent===p.id)]),...S.cats.filter(c=>c.parent&&!S.cats.some(p=>p.id===c.parent))];
  ord.forEach(c=>{c.words=c.words.filter(w=>{if(seen.has(key(w)))return false;seen.add(key(w));return true})});S.lib=S.lib.filter(w=>{if(seen.has(key(w)))return false;seen.add(key(w));return true});
  const sw=new Set(),dk=w=>{const k=wkey(w);if(!k)return true;if(sw.has(k))return false;sw.add(k);return true};ord.forEach(c=>c.words=c.words.filter(dk));S.lib=S.lib.filter(dk);save()}
function migrate(){
  // v6: regenerate auto 谐音 locally for the user's own stored words only (no network, chunked so the UI never blocks)
  const v5=allWords().filter(w=>w.v===5&&(w.ipaUK||w.ipaUS));if(v5.length)(async()=>{for(let i=0;i<v5.length;i++){const w=v5[i];try{if(!w.hint||/[A-Za-z]/.test(w.hint)||w.hintAuto!==false)w.hint=Enrich.xieyinW(w.word,w.ipaUK||w.ipaUS)||w.hint}catch(e){}w.v=6;if(i%20===19)await new Promise(r=>setTimeout(r,0))}save();if(view==='study')renderStudy(false)})();
  const old=allWords().filter(w=>!w.v||w.v<5||w.v===5&&!w.ipaUK&&!w.ipaUS);if(old.length)(async()=>{for(const w of old){try{await lite(w,true)}catch(e){}save()}if(view==='study')renderStudy(false);if(view==='lib')renderLib()})();
  let need=[];S.cats.forEach(c=>c.words.forEach(w=>{if(!w.v){w.status=w.status||'new';w.ocrIpa=w.ipa;need.push(w)}}));
  if(need.length)(async()=>{for(const w of need){const ip=await Enrich.ipa(w.word.toLowerCase());if(ip){w.ipaUK=ip.uk;w.ipaUS=ip.us}if(!w.hint)w.hint=Enrich.xieyinW(w.word,w.ipaUK||w.ipaUS);if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);w.v=2;save()}if(view==='study')renderStudy(false)})()}
// ================= boot =================
(async()=>{try{const d=await idbGet('kv','state');if(d&&Array.isArray(d.cats))S=d}catch(e){}
  try{
  fixData();
  if(S.cur!=='__all'&&!cat(S.cur))S.cur='__all';renderStudy(false);window.__firstCard=Math.round(performance.now());
  // heavy work after first paint
  requestAnimationFrame(()=>setTimeout(migrate,50));
  const w=curWord();if(w)sayWord(w).then(ok=>{if(!ok&&!unlocked)setTimeout(()=>{if(!unlocked)$('#hint').style.display='block'},1200)});
  setTimeout(prefetchAll,800);hashImport()}catch(e){window.__showErr&&__showErr('boot: '+(e.stack||e.message))}window.__booted=1})();
// ================= service worker auto-update =================
if('serviceWorker'in navigator){const had=!!navigator.serviceWorker.controller;let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloading){const t=+sessionStorage.getItem('swReload')||0;if(Date.now()-t<15000)return;sessionStorage.setItem('swReload',Date.now());reloading=true;location.reload()}});
  navigator.serviceWorker.register('sw.js',{scope:'./'}).then(r=>{r.update();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update()})})}

$('#catName').onclick=()=>sheet([['全部单词（'+allWords().length+'）',()=>studyCat('__all')],...ordered().map(c=>[(c.parent?'　└ ':'')+esc(c.name)+'（'+count(c)+'）',()=>studyCat(c.id)])]);
// study swipe: left=next, right=prev (no delete gesture here)
(()=>{const V=$('#v-study');let x0=null,y0=0,t0=0;
V.addEventListener('touchstart',e=>{if(e.target.closest('#fixbar,.nav,.acts,button,input,textarea,.pop,.sheet')){x0=null;return}x0=e.touches[0].clientX;y0=e.touches[0].clientY;t0=Date.now()},{passive:true});
V.addEventListener('touchend',e=>{if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;
  if(Math.abs(dx)<50||Math.abs(dx)<Math.abs(dy)*2)return;const d=dx<0?1:-1;const C=$('#card');step(d);C.classList.remove('sl','sr');void C.offsetWidth;C.classList.add(d>0?'sl':'sr')},{passive:true})})();

// fit study card: word on one line, whole card above the 还不会/记住了 bar, no inner scroll
let fitting=false;function fitCard(){const C=$('#card'),A=document.querySelector('#v-study .acts');if(!C||fitting||view!=='study')return;fitting=true;
  const W=C.querySelector('.word'),T=C.querySelector('.wt');C.style.zoom='';C.style.marginLeft='';C.style.minHeight='';if(W&&T){W.style.fontSize='';let f=parseFloat(getComputedStyle(W).fontSize);const H=W.parentElement,cs=getComputedStyle(H),lv=W.querySelector('.lv');const over=()=>{const hb=H.getBoundingClientRect(),L=hb.left+parseFloat(cs.paddingLeft),Rr=hb.right-parseFloat(cs.paddingRight);const t=T.getBoundingClientRect(),r=lv?Math.max(t.right,lv.getBoundingClientRect().right):t.right;return t.left<L-0.5||r>Rr+0.5||(lv&&lv.getBoundingClientRect().top>t.top+t.height*.5)};while(f>18&&over()){f-=1;W.style.fontSize=f+'px'}}
  const lim=(A?A.getBoundingClientRect().top:innerHeight)-8;let z=1;while(z>.62&&C.getBoundingClientRect().bottom>lim){z-=.04;C.style.zoom=z;C.style.marginLeft=(-3/z)+'px'}if(z===1){const cb=C.getBoundingClientRect();if(cb.bottom<lim-2)C.style.minHeight=Math.floor(lim-cb.top)+'px'}fitting=false}
addEventListener('resize',()=>requestAnimationFrame(fitCard));
try{new ResizeObserver(()=>requestAnimationFrame(fitCard)).observe($('#card'))}catch(_){}
