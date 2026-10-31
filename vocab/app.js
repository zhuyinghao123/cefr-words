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
const cat=id=>S.cats.find(c=>c.id===id),kids=id=>S.cats.filter(c=>c.parent===id);
const count=c=>c.words.length+(c.parent?0:kids(c.id).reduce((a,k)=>a+k.words.length,0));
const studyWords=()=>{if(S.cur==='__all')return ordered().flatMap(c=>c.words);const c=cat(S.cur);if(!c)return[];return c.parent?c.words:[...c.words,...kids(c.id).flatMap(k=>k.words)]};
const allWords=()=>S.cats.flatMap(c=>c.words);
function ordered(){const r=[];S.cats.filter(c=>!c.parent).forEach(p=>{r.push(p);kids(p.id).forEach(k=>r.push(k))});return r}
function newCat(name,parent=null){const c={id:uid(),name,parent,words:[]};S.cats.push(c);return c}
function moveIn(arr,item,ni){arr.splice(arr.indexOf(item),1);arr.splice(ni,0,item)}
function lvBadge(w,cls='lv'){const l=Enrich.level(w.word||'');const u='https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(l.lemma||w.word);
  return `<a class="${cls}${l.lv?'':' na'}" href="${u}" target="_blank" rel="noopener" title="${l.src}（点开剑桥词典核对）" onclick="event.stopPropagation()">${l.lv||'未收录'}</a>`}
// ================= audio =================
const wordURL=w=>'https://dict.youdao.com/dictvoice?type=1&audio='+encodeURIComponent(w.trim());
const sentURL=s=>'https://translate.google.com/translate_tts?ie=UTF-8&tl=en-US&client=tw-ob&q='+encodeURIComponent(s.trim().slice(0,200));
const pool=new Map();let unlocked=false,lastLatency=null;const player=new Audio();player.preload='auto';
function getA(url){let a=pool.get(url);if(!a){a=new Audio();a.preload='auto';a.src=url;a.load();pool.set(url,a)}return a}
function keepPool(urls){for(const [u,a] of pool)if(!urls.includes(u)){a.removeAttribute('src');a.load();pool.delete(u)}urls.forEach(getA)}
let voice=null;function pickVoice(){const v=speechSynthesis.getVoices();voice=v.find(x=>/en[-_]GB/.test(x.lang)&&/Daniel|Serena|Google UK|Kate|Arthur/.test(x.name))||v.find(x=>/en[-_]US/.test(x.lang)&&/Samantha|Google|Aria|Jenny|Alex/.test(x.name))||v.find(x=>/en[-_](US|GB)/.test(x.lang))||v.find(x=>/^en/.test(x.lang))}
if('speechSynthesis'in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice}
function tts(t){if(!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang=voice?voice.lang:'en-US';if(voice)u.voice=voice;u.rate=.92;speechSynthesis.speak(u);speechSynthesis.resume()}catch(e){}}
function stopAll(){pool.forEach(a=>{if(!a.paused)a.pause()});if(!player.paused)player.pause();if('speechSynthesis'in window)speechSynthesis.cancel()}
// returns promise resolving true if media started
function play(url,text){stopAll();const t0=performance.now();const a=getA(url);
  const mark=x=>{x.addEventListener('playing',()=>{lastLatency=Math.round(performance.now()-t0);window.__lat=lastLatency},{once:true})};
  if(a.readyState>=2){a.currentTime=0;mark(a);return a.play().then(()=>{unlocked=true;return true}).catch(err=>{if(err&&err.name==='NotAllowedError')throw err;tts(text);cacheAudio([url]);return false})}
  // not buffered yet: speak immediately, keep loading for next time
  tts(text);cacheAudio([url]);return Promise.resolve(false)}
const sayWord=w=>w&&play(wordURL(w.word),w.word);
const saySent=w=>w&&w.sentence&&play(sentURL(w.sentence),w.sentence);
// first touch anywhere unlocks media + speech, then reads the current word
function unlockAll(){if(unlocked)return;unlocked=true;$('#hint').style.display='none';
  pool.forEach(a=>{a.muted=true;const p=a.play();p&&p.then(()=>{a.pause();a.currentTime=0;a.muted=false}).catch(()=>{a.muted=false})});
  try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}
  setTimeout(()=>{if(view==='study')sayWord(curWord())},60)}
['touchend','pointerup','keydown'].forEach(ev=>document.addEventListener(ev,unlockAll,{capture:true,once:false}));
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
  if(!ws.length){C.innerHTML=`<div class="acc"></div><div class="head" style="padding:60px 24px"><div class="word" style="font-size:34px">还没有单词</div><p class="muted" style="margin-top:16px">点下方红色相机按钮拍照导入，<br>或在「词库」里手动添加。</p></div>`;return}
  const w=curWord();const ipa=w.ipaUK||w.ipaUS?[w.ipaUK&&`<span><small>英</small>/${esc(w.ipaUK)}/</span>`,w.ipaUS&&`<span><small>美</small>/${esc(w.ipaUS)}/</span>`].filter(Boolean).join(''):esc(w.ipa||'');
  C.innerHTML=`<div class="acc"></div><div class="head"><div class="word">${esc(w.word)}${lvBadge(w)}</div><div class="ipa">${ipa}</div>
   <div class="mean">${w.pos?`<span class="pos">${esc(w.pos)}</span>`:''}${esc(w.meaning)}</div>${w.hint?`<span class="pill">谐音 ${esc(w.hint)}</span>`:''}</div>
   <div class="ex"><div class="exh"><span>例句 · 点不认识的词${w.filled?'<span class="tag">补全</span>':''}</span><button class="gbtn" id="spS" aria-label="读例句">${ICON.spk}</button></div>
   <div class="sent">${sentHTML(w.sentence||'',w.word)}</div>${w.trans?`<div class="trans">${esc(w.trans)}</div>`:''}
   ${w.extra?`<div class="extra"><b>书上还写了</b>${esc(w.extra)}</div>`:''}</div>
   <div class="cbar"><button class="rplay" id="spW" aria-label="读单词">${ICON.spk}</button><button class="gbtn" id="prev" aria-label="上一个">${ICON.l}</button><button class="gbtn" id="next" aria-label="下一个">${ICON.r}</button>
   <span class="cnt">${S.idx+1} / ${ws.length}　${ST[w.status||'new']}</span></div>`;
  $('#spW').onclick=()=>sayWord(w);$('#spS').onclick=()=>saySent(w);$('#prev').onclick=()=>step(-1);$('#next').onclick=()=>step(1);
  C.querySelectorAll('.sent .w').forEach(s=>s.onclick=e=>{e.stopPropagation();wordPop(s)});
  const n=ws.length,nx=ws[(S.idx+1)%n],pv=ws[(S.idx-1+n)%n];
  keepPool([wordURL(w.word),w.sentence&&sentURL(w.sentence),wordURL(nx.word),nx.sentence&&sentURL(nx.sentence),wordURL(pv.word)].filter(Boolean));
  if(speak)sayWord(w)}
function step(d){const n=studyWords().length;if(!n)return;S.idx=(S.idx+d+n)%n;save();renderStudy(true)}
function mark(st){const w=curWord();if(!w)return;w.status=st;save();step(1)}
$('#dunno').onclick=()=>mark('learning');$('#gotit').onclick=()=>mark('known');
async function wordPop(span){document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'));span.classList.add('on');const raw=span.dataset.w;const lem=CEFR.lemma(raw);
  play(wordURL(raw),raw);const P=$('#pop');P.style.display='block';P.innerHTML=`<span class="pw">${esc(raw)}</span><span class="pi" id="pi"></span> ${lvBadge({word:raw},'tag')}<div class="muted" id="pm" style="margin-top:6px">查询中…</div>`;
  const [ip,m]=await Promise.all([Enrich.ipa(lem),Enrich.meaning(lem)]);if(P.style.display==='none')return;
  $('#pi').textContent=ip?'/'+(ip.uk||ip.us)+'/':'';$('#pm').textContent=(lem!==raw?`原形 ${lem}：`:'')+(m||'暂无释义')}
document.addEventListener('click',e=>{if(!e.target.closest('#pop')&&!e.target.closest('.sent .w')){$('#pop').style.display='none';document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'))}});
// ================= sheet menu =================
function sheet(items){const I=$('#sheetIn');I.innerHTML=items.map((it,i)=>`<button class="item" data-i="${i}">${it[0]}</button>`).join('')+'<button class="item" style="text-align:center;border:0;color:#8b857a">取消</button>';
  $('#sheet').classList.add('on');I.querySelectorAll('.item').forEach(b=>b.onclick=()=>{$('#sheet').classList.remove('on');const it=items[b.dataset.i];it&&it[1]()})}
$('#sheet').onclick=e=>{if(e.target.id==='sheet')$('#sheet').classList.remove('on')};
const commonMenu=()=>[['📷 拍照导入（可多张）',()=>{renderThumbs();go('photo')}],['✍️ 手动添加单词',()=>openManual()],['⬇️ 备份数据（导出 JSON）',backup],['⬆️ 恢复数据（导入 JSON）',()=>$('#restoreFile').click()]];
$('#moreBtn').onclick=()=>{const w=curWord(),c=cat(S.cur);sheet([...(w?[['✏️ 编辑这个单词',()=>openManual(w)],['🔊 读例句',()=>saySent(w)]]:[]),...(c?[['📋 管理本分类单词',()=>openWords(c.id)]]:[]),...commonMenu()])};
$('#libMore').onclick=()=>sheet(commonMenu());
// ================= library =================
function renderLib(){const L=$('#catList');L.innerHTML='';const all=ordered();
  if(!all.length)L.innerHTML='<p class="muted">先新建一个大类吧</p>';
  all.forEach(c=>{const d=document.createElement('div');d.className='row'+(c.parent?' child':'')+(c.id===S.cur?' sel':'');d.dataset.id=c.id;
    d.innerHTML=`<span class="drag">☰</span><div class="t"><b>${esc(c.name)}</b><small>${count(c)} 词</small></div>
    <button class="pb r" style="height:34px;padding:0 10px;font-size:13px" data-a="study">学这个类</button><button class="mini" data-a="up">↑</button><button class="mini" data-a="dn">↓</button>${c.parent?'':'<button class="mini" data-a="sub" title="新建子类">＋</button>'}<button class="mini" data-a="more">⋯</button>`;
    d.querySelector('.t').onclick=()=>{S.cur=c.id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)};
    d.querySelectorAll('button').forEach(b=>b.onclick=()=>catAct(c,b.dataset.a));L.appendChild(d)});
  enableDrag(L,(from,to)=>{const a=cat(from),b=cat(to);if(!a||!b||(a.parent||null)!==(b.parent||null))return toast('只能在同级内拖动');moveIn(S.cats,a,S.cats.indexOf(b));save();renderLib()})}
function studyCat(id){S.cur=id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)}
function catAct(c,a){if(a==='study')return studyCat(c.id);
  if(a==='up'||a==='dn'){const sib=S.cats.filter(x=>(x.parent||null)===(c.parent||null));const i=sib.indexOf(c),j=i+(a==='up'?-1:1);if(j<0||j>=sib.length)return;moveIn(S.cats,c,S.cats.indexOf(sib[j]));save();renderLib()}
  else if(a==='sub'){const n=prompt('子类名称');if(n&&n.trim()){newCat(n.trim(),c.id);save();renderLib()}}
  else if(a==='more')sheet([['📋 管理单词',()=>openWords(c.id)],['✏️ 重命名',()=>{const n=prompt('新名称',c.name);if(n){c.name=n;save();renderLib()}}],
    ['🗑 删除分类',()=>{if(!confirm(`删除「${c.name}」${c.parent?'':'及其子类'}和全部单词？`))return;const ids=[c.id,...kids(c.id).map(k=>k.id)];S.cats=S.cats.filter(x=>!ids.includes(x.id));if(ids.includes(S.cur))S.cur=(S.cats[0]||{}).id||null;save();renderLib()}]])}
$('#addParent').onclick=()=>{const n=prompt('大类名称');if(n&&n.trim()){const c=newCat(n.trim());if(!S.cur)S.cur=c.id;save();renderLib()}};
function enableDrag(list,done){list.querySelectorAll('.drag').forEach(h=>{h.onpointerdown=e=>{const row=h.closest('.row');row.style.opacity=.5;h.setPointerCapture(e.pointerId);
  h.onpointerup=ev=>{row.style.opacity='';h.onpointerup=null;const el=document.elementFromPoint(ev.clientX,ev.clientY);const t=el&&el.closest('.row');if(t&&t!==row)done(row.dataset.id,t.dataset.id)}}})}
function catOptions(sel){sel.innerHTML=ordered().map(c=>`<option value="${c.id}">${c.parent?'　└ ':''}${esc(c.name)}</option>`).join('');if(S.cur)sel.value=S.cur}
function ensureCat(){if(!S.cats.length){const c=newCat('我的单词');S.cur=c.id}}
// ================= words of a category =================
let wCat=null,wMode=null,wSel=new Set();
function openWords(id){wCat=id;wMode=null;wSel.clear();renderWords();go('words')}
function renderWords(){const c=cat(wCat);if(!c)return;$('#wTitle').textContent=c.name;const L=$('#wList');L.innerHTML=c.words.length?'':'<p class="muted">这个分类自身没有单词（子类单词请到子类里管理）</p>';
  $('#wOkWrap').innerHTML=wMode?'<button class="ok" id="wOk">✓</button>':'';if(wMode)$('#wOk').onclick=wFinish;
  $('#wDelMode').classList.toggle('r',wMode==='del');$('#wEditMode').classList.toggle('r',wMode==='edit');
  c.words.forEach((w,i)=>{if(wMode==='edit'){const d=document.createElement('div');d.className='ecard';d.innerHTML=`<div class="f">${editorHTML(w)}</div>`;L.appendChild(d);bindEditor(d,w,true);return}
    const d=document.createElement('div');d.className='row'+(wSel.has(w.id)?' sel':'');d.dataset.id=w.id;
    d.innerHTML=`${wMode==='del'?`<span class="chk${wSel.has(w.id)?' on':''}">✓</span>`:'<span class="drag">☰</span>'}<div class="t"><b>${esc(w.word)}</b> ${lvBadge(w,'tag')}<div class="sub">${esc(w.pos)} ${esc(w.meaning)}${w.hint?'　谐音 '+esc(w.hint):''}</div></div>${wMode?'':'<button class="mini" data-a="-1">↑</button><button class="mini" data-a="1">↓</button>'}`;
    if(wMode==='del')d.onclick=()=>{wSel.has(w.id)?wSel.delete(w.id):wSel.add(w.id);renderWords()};
    d.querySelectorAll('button').forEach(b=>b.onclick=()=>{const j=i+ +b.dataset.a;if(j<0||j>=c.words.length)return;moveIn(c.words,w,j);save();renderWords()});L.appendChild(d)});
  if(!wMode)enableDrag(L,(f,t)=>{const a=c.words.find(x=>x.id===f),b=c.words.find(x=>x.id===t);moveIn(c.words,a,c.words.indexOf(b));save();renderWords()})}
$('#wDelMode').onclick=()=>{wMode=wMode==='del'?null:'del';wSel.clear();renderWords()};
$('#wEditMode').onclick=()=>{wMode=wMode==='edit'?null:'edit';renderWords()};
$('#wFix').onclick=async()=>{const c=cat(wCat);toast('正在补全…',60000);for(const w of c.words)await lite(w,true);save();renderWords();toast('已补全音标、谐音和等级')};
function wFinish(){const c=cat(wCat);if(wMode==='del'&&wSel.size){if(!confirm(`删除选中的 ${wSel.size} 个单词？`))return;c.words=c.words.filter(w=>!wSel.has(w.id))}wMode=null;wSel.clear();save();renderWords();toast('已完成')}
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
  if(!w.hint||force&&w.hintAuto!==false)w.hint=Enrich.xieyin(w.ipaUK||w.ipaUS)||w.hint;if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);w.v=2}
// ================= photo import =================
let shots=[];
$('#pickBtn').onclick=()=>$('#pick').click();$('#shootBtn').onclick=()=>$('#shoot').click();
['pick','shoot'].forEach(id=>$('#'+id).onchange=e=>{for(const f of e.target.files)shots.push({f,url:URL.createObjectURL(f)});e.target.value='';renderThumbs()});
function renderThumbs(){const T=$('#thumbs');T.innerHTML=shots.map((s,i)=>`<div class="th"><img src="${s.url}"><span class="n">${i+1}</span><button class="x" data-x="${i}">✕</button><div class="mv"><button data-m="${i}" data-d="-1">‹</button><button data-m="${i}" data-d="1">›</button></div></div>`).join('');
  T.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{URL.revokeObjectURL(shots[b.dataset.x].url);shots.splice(+b.dataset.x,1);renderThumbs()});
  T.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>{const i=+b.dataset.m,j=i+ +b.dataset.d;if(j<0||j>=shots.length)return;[shots[i],shots[j]]=[shots[j],shots[i]];renderThumbs()});
  $('#runOcr').style.display=shots.length?'block':'none';$('#runOcr').textContent=`开始识别（${shots.length} 张）`}
let pending=null;
function prog(t,p){$('#progT').textContent=t;$('#progB').style.width=Math.round(p*100)+'%'}
async function prep(f){const bmp=await createImageBitmap(f);const m=Math.max(bmp.width,bmp.height);if(m<=6400&&m>=900)return f;const k=m>6400?6400/m:1600/m;
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*k);c.height=Math.round(bmp.height*k);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return c}
function loadScript(src){return new Promise((ok,no)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>no(new Error('脚本加载失败'));document.head.appendChild(s)})}
$('#runOcr').onclick=async()=>{if(!shots.length)return;ensureCat();catOptions($('#confCat'));pending=[];renderConf();go('confirm');const list=shots.slice();const N=list.length;
  try{prog('正在加载识别引擎（首次约 20MB）…',0);if(!window.Tesseract)await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    let cur=0;const wk=await Tesseract.createWorker(['eng','chi_sim'],1,{logger:m=>{if(m.status==='recognizing text')prog(`第${cur+1}/${N}张 · 识别中 ${Math.round(m.progress*100)}%`,(cur+m.progress*.6)/N);else if(m.status)prog('加载语言包… '+Math.round((m.progress||0)*100)+'%',0)}});
    for(cur=0;cur<N;cur++){prog(`第${cur+1}/${N}张 · 识别中`,cur/N);const r=await wk.recognize(await prep(list[cur].f));
      const ents=parseOCR(r.data.lines.map(l=>({t:l.text,c:l.confidence})));
      for(let i=0;i<ents.length;i++){prog(`第${cur+1}/${N}张 · 查词典补全 ${i+1}/${ents.length}（${ents[i].word}）`,(cur+.6+.4*i/ents.length)/N);await Enrich.enrich(ents[i]);}
      Enrich.linkDerived(ents);ents.forEach(e=>{e.id=uid();e._sel=true;e.photo=cur+1;e.status='new';e.v=2});pending.push(...ents);renderConf()}
    await wk.terminate();const miss=pending.filter(w=>w.sentence&&!w.trans).length;
    prog(`共 ${N} 张照片，识别到 ${pending.length} 个词条。请核对，勾选后点右上角 ✓ 导入。`+(miss?`（${miss} 条翻译失败，可手动填写）`:''),1);
    shots.forEach(s=>URL.revokeObjectURL(s.url));shots=[];
  }catch(err){prog('识别失败：'+(err&&err.message||err)+'。请检查网络后重试，或手动添加。',0)}};
function renderConf(){const L=$('#confList');L.innerHTML='';let g=0;(pending||[]).forEach(w=>{if(w.photo!==g){g=w.photo;const h=document.createElement('div');h.className='grp';h.textContent=`第 ${g} 张照片`;L.appendChild(h)}
  const d=document.createElement('div');d.className='ecard'+(w._sel?'':' off');d.innerHTML=`<span class="chk${w._sel?' on':''}" style="margin-top:8px">✓</span><div class="f">${editorHTML(w)}${w.flags&&w.flags.length?`<div class="muted" style="font-size:12px;margin-top:4px">${esc(w.flags.join(' · '))}</div>`:''}</div>`;
  d.querySelector('.chk').onclick=()=>{w._sel=!w._sel;renderConf()};L.appendChild(d);bindEditor(d,w,false)})}
$('#selAll').onclick=()=>{const v=!(pending||[]).every(w=>w._sel);(pending||[]).forEach(w=>w._sel=v);renderConf()};
$('#confOk').onclick=()=>{const c=cat($('#confCat').value);const sel=(pending||[]).filter(w=>w._sel&&w.word.trim());if(!c||!sel.length)return toast('请至少勾选一个单词');
  sel.forEach(w=>{const{_sel,flags,photo,ocrSentence,...x}=w;c.words.push(x)});pending=null;S.cur=c.id;save();toast(`已导入 ${sel.length} 个单词`);prefetchAll();hist.length=0;renderLib();go('lib',false)};
// ================= manual =================
let mWord=null,mEdit=false;
function openManual(w){ensureCat();mEdit=!!w;mWord=w||{id:uid(),word:'',ipaUK:'',ipaUS:'',pos:'',meaning:'',hint:'',sentence:'',trans:'',extra:'',status:'new',v:2};
  $('#mTitle').textContent=mEdit?'编辑单词':'手动添加';$('#mForm').innerHTML=(mEdit?'':'<div class="fm"><label>分类</label><select id="mCat"></select></div>')+editorHTML(mWord);if(!mEdit)catOptions($('#mCat'));bindEditor($('#mForm'),mWord,mEdit);go('manual')}
$('#manualBtn').onclick=()=>openManual();
$('#mAuto').onclick=async()=>{const w=mWord;if(!w.word.trim())return toast('先输入单词');const b=$('#mAuto');b.textContent='补全中…';
  const e=await Enrich.enrich({...w,word:w.word.trim()});['ipaUK','ipaUS','hint','meaning','sentence','trans','filled'].forEach(k=>{if(!w[k]||k==='ipaUK'||k==='ipaUS')w[k]=e[k]});if(!w.pos&&e.pos)w.pos=e.pos;
  const sel=$('#mCat')&&$('#mCat').value;$('#mForm').innerHTML=(mEdit?'':'<div class="fm"><label>分类</label><select id="mCat"></select></div>')+editorHTML(w);if(!mEdit){catOptions($('#mCat'));$('#mCat').value=sel}bindEditor($('#mForm'),w,mEdit);b.textContent='自动补全音标 / 谐音 / 释义 / 翻译';if(mEdit)save()};
$('#mOk').onclick=async()=>{const w=mWord;if(!w.word.trim())return toast('请输入单词');w.word=w.word.trim();
  if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);if(!w.hint&&(w.ipaUK||w.ipaUS))w.hint=Enrich.xieyin(w.ipaUK||w.ipaUS);
  if(!mEdit){cat($('#mCat').value).words.push(w);toast('已添加，可继续输入');save();prefetchAll();openManual();hist.pop()}else{save();toast('已保存');back()}};
// ================= backup / restore =================
function backup(){const b=new Blob([JSON.stringify({app:'paizhaociku',v:2,date:new Date().toISOString(),data:S},null,1)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='拍照词库备份-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
$('#restoreFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{const j=JSON.parse(await f.text());const d=j.data||j;if(!Array.isArray(d.cats))throw 0;
  if(!confirm('恢复会覆盖当前全部数据，确定？'))return;S=d;await idbSet('kv','state',S);migrate();renderLib();toast('恢复成功')}catch(_){toast('文件格式不正确')}};
// ================= migration from v1 =================
function migrate(){let need=[];S.cats.forEach(c=>c.words.forEach(w=>{if(!w.v){w.status=w.status||'new';w.ocrIpa=w.ipa;need.push(w)}}));
  if(need.length)(async()=>{for(const w of need){const ip=await Enrich.ipa(w.word.toLowerCase());if(ip){w.ipaUK=ip.uk;w.ipaUS=ip.us}if(!w.hint)w.hint=Enrich.xieyin(w.ipaUK||w.ipaUS);if(w.sentence&&!w.trans)w.trans=await Enrich.translate(w.sentence);w.v=2;save()}if(view==='study')renderStudy(false)})()}
// ================= boot =================
(async()=>{try{const d=await idbGet('kv','state');if(d&&Array.isArray(d.cats))S=d}catch(e){}
  if(!S.cats.length){const c=newCat('雅思核心词汇');c.words.push({id:uid(),word:'erosion',ipaUK:'ɪˈrəʊʒən',ipaUS:'ɪˈroʊʒən',pos:'n.',meaning:'侵蚀，腐蚀',hint:'衣肉神',sentence:'Due to the threat of erosion, it is unsafe to build on the land.',trans:'由于存在侵蚀的威胁，在这片土地上建造是不安全的。',extra:'派生 erode [ɪˈrəʊd] (v.) 侵蚀',status:'new',v:2});S.cur=c.id;save()}
  if(S.cur!=='__all'&&!cat(S.cur))S.cur=(S.cats[0]||{}).id;migrate();renderStudy(false);
  // try autoplay on startup
  const w=curWord();if(w){const a=getA(wordURL(w.word));const tryPlay=()=>a.play().then(()=>{unlocked=true}).catch(err=>{if(err&&err.name==='NotAllowedError'){$('#hint').style.display='block'}else tts(w.word)});
    if(a.readyState>=2)tryPlay();else{a.addEventListener('canplay',()=>{if(!unlocked)tryPlay()},{once:true});setTimeout(()=>{if(!unlocked&&a.readyState<2)$('#hint').style.display='block'},1500)}}
  setTimeout(prefetchAll,800)})();
// ================= service worker auto-update =================
if('serviceWorker'in navigator){const had=!!navigator.serviceWorker.controller;let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloading){reloading=true;location.reload()}});
  navigator.serviceWorker.register('sw.js',{scope:'./'}).then(r=>{r.update();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update()})})}

$('#catName').onclick=()=>sheet([['📚 全部单词（'+allWords().length+'）',()=>studyCat('__all')],...ordered().map(c=>[(c.parent?'　└ ':'')+esc(c.name)+'（'+count(c)+'）',()=>studyCat(c.id)])]);
