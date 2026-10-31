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
function ordered(){const r=[];S.cats.filter(c=>!c.parent&&!c.loose).forEach(p=>{r.push(p);kids(p.id).forEach(k=>r.push(k))});const L=loose();if(L)r.push(L);return r}
const loose=()=>S.cats.find(c=>c.loose);function ensureLoose(){let L=loose();if(!L){L={id:'__loose',name:'未分类',parent:null,loose:true,words:[]};S.cats.push(L)}return L}
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
  $('#fixbar').style.visibility=ws.length?'visible':'hidden';if(!ws.length){$('#cnt').textContent='';C.innerHTML=`<div class="acc"></div><div class="head" style="padding:60px 24px"><div class="word" style="font-size:34px">还没有单词</div><p class="muted" style="margin-top:16px">点下方红色相机按钮拍照导入，<br>或在「词库」里手动添加。</p></div>`;return}
  const w=curWord();const ipa=w.ipaUK||w.ipaUS?[w.ipaUK&&`<span><small>英</small>/${esc(w.ipaUK)}/</span>`,w.ipaUS&&`<span><small>美</small>/${esc(w.ipaUS)}/</span>`].filter(Boolean).join(''):esc(w.ipa||'');
  C.innerHTML=`<div class="acc"></div><div class="head"><div class="word">${esc(w.word)}${lvBadge(w)}</div><div class="ipa">${ipa}</div>
   <div class="mean">${w.pos?`<span class="pos">${esc(w.pos)}</span>`:''}${esc(w.meaning)}</div>${w.hint?`<span class="pill">谐音 ${esc(w.hint)}</span>`:''}</div>
   <div class="ex"><div class="exh"><span>例句 · 点不认识的词${w.filled?'<span class="tag">补全</span>':''}</span><button class="gbtn" id="spS" aria-label="读例句">${ICON.spk}</button></div>
   <div class="sent">${sentHTML(w.sentence||'',w.word)}</div>${w.sentence?`<div class="trans" id="trans">${w.trans?esc(w.trans):'<span class="muted">翻译中…</span>'}</div>`:''}
   ${w.extra?`<div class="extra"><b>书上还写了</b>${esc(w.extra)}</div>`:''}</div>`;$('#cnt').textContent=`${S.idx+1} / ${ws.length}　${ST[w.status||'new']}`;$('#spS').onclick=()=>saySent(w);
  if(w.sentence&&!w.trans)autoTrans(w);
  C.querySelectorAll('.sent .w').forEach(s=>s.onclick=e=>{e.stopPropagation();wordPop(s)});
  const n=ws.length,nx=ws[(S.idx+1)%n],pv=ws[(S.idx-1+n)%n];
  keepPool([wordURL(w.word),w.sentence&&sentURL(w.sentence),wordURL(nx.word),nx.sentence&&sentURL(nx.sentence),wordURL(pv.word)].filter(Boolean));
  if(speak)sayWord(w)}
const trBusy=new Set();async function autoTrans(w){if(trBusy.has(w.id))return;trBusy.add(w.id);let t='';try{t=await Enrich.translate(w.sentence)}catch(e){}trBusy.delete(w.id);
  if(t){w.trans=t;save()}if(curWord()===w&&$('#trans'))$('#trans').innerHTML=t?esc(t):'<span class="muted">翻译暂时失败，联网后会自动重试</span>'}
$('#spW').innerHTML=ICON.spk;$('#prev').innerHTML=ICON.l;$('#next').innerHTML=ICON.r;
$('#spW').onclick=()=>sayWord(curWord());$('#prev').onclick=()=>step(-1);$('#next').onclick=()=>step(1);
function step(d){const n=studyWords().length;if(!n)return;S.idx=(S.idx+d+n)%n;save();renderStudy(true)}
function mark(st){const w=curWord();if(!w)return;w.status=st;save();step(1)}
$('#dunno').onclick=()=>mark('learning');$('#gotit').onclick=()=>mark('known');
async function wordPop(span){document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'));span.classList.add('on');const raw=span.dataset.w;const lem=CEFR.lemma(raw);
  play(wordURL(raw),raw);const P=$('#pop');P.style.display='block';P.innerHTML=`<span class="pw">${esc(raw)}</span><span class="pi" id="pi"></span> ${lvBadge({word:raw},'tag')}<div class="muted" id="pm" style="margin-top:6px">查询中…</div>`;
  const known=allWords().find(x=>x.word.toLowerCase()===raw||x.word.toLowerCase()===lem);
  if(known){$('#pi').textContent=(known.ipaUK||known.ipaUS)?'/'+(known.ipaUK||known.ipaUS)+'/':'';$('#pm').innerHTML=`<div class="pz">${esc((known.pos?known.pos+' ':'')+known.meaning)}</div>`;return}
  const [ip,m]=await Promise.all([Enrich.ipa(lem).catch(()=>null),Enrich.meaning(lem).catch(()=>'')]);if(P.style.display==='none'||!span.classList.contains('on'))return;
  $('#pi').textContent=ip?'/'+(ip.uk||ip.us)+'/':'';$('#pm').innerHTML=`<div class="pz">${esc(m||'暂无释义（请检查网络）')}</div>`+(lem!==raw?`<div class="muted" style="font-size:13px">原形 ${esc(lem)}</div>`:'')}
document.addEventListener('click',e=>{if(!e.target.closest('#pop')&&!e.target.closest('.sent .w')){$('#pop').style.display='none';document.querySelectorAll('.sent .w.on').forEach(x=>x.classList.remove('on'))}});
// ================= sheet menu =================
function sheet(items,title=''){$('#sheetT').innerHTML=title;const I=$('#sheetIn');I.innerHTML=items.map((it,i)=>`<button class="item${it[2]?' danger':''}" data-i="${i}">${it[0]}</button>`).join('')+'<button class="item" style="text-align:center;border:0;color:#8b857a">取消</button>';
  $('#sheet').classList.add('on');I.querySelectorAll('.item').forEach(b=>b.onclick=()=>{$('#sheet').classList.remove('on');const it=items[b.dataset.i];it&&it[1]()})}
$('#sheet').onclick=e=>{if(e.target.id==='sheet')$('#sheet').classList.remove('on')};
const commonMenu=()=>[['📷 拍照导入（可多张）',()=>{renderThumbs();go('photo')}],['✍️ 手动添加单词',()=>openManual()],['⚙️ 识别设置（AI / API Key）',openSet],['⬇️ 备份数据（导出 JSON）',backup],['⬆️ 恢复数据（导入 JSON）',()=>$('#restoreFile').click()]];
$('#moreBtn').onclick=()=>{const w=curWord(),c=cat(S.cur);sheet([...(w?[['✏️ 编辑这个单词',()=>openManual(w)],['🔊 读例句',()=>saySent(w)]]:[]),...(c?[['📋 管理本分类单词',()=>openWords(c.id)]]:[]),...commonMenu()])};
$('#libMore').onclick=()=>sheet(commonMenu());
// ================= library =================
function renderLib(){const L=$('#catList');L.innerHTML='';const all=ordered();
  if(!all.length)L.innerHTML='<p class="muted">先新建一个大类吧</p>';
  const A=document.createElement('div');A.className='row'+(S.cur==='__all'?' sel':'');A.innerHTML=`<span class="drag" style="visibility:hidden">☰</span><div class="t"><b>📚 全部单词</b><small>${allWords().length} 词</small></div><button class="pb r" style="height:34px;padding:0 10px;font-size:13px">学全部</button>`;A.querySelector('button').onclick=()=>studyCat('__all');L.appendChild(A);
  all.forEach(c=>{const d=document.createElement('div');d.className='row'+(c.parent?' child':'')+(c.id===S.cur?' sel':'');d.dataset.id=c.id;
    if(c.loose){d.innerHTML=`<span class="drag" style="visibility:hidden">☰</span><div class="t"><b>📥 未分类（新导入）</b><small>${count(c)} 词</small></div><button class="pb r" style="height:34px;padding:0 10px;font-size:13px" data-a="study">学这个类</button><button class="mini" data-a="manage">⋯</button>`;
      d.querySelectorAll('button').forEach(b=>b.onclick=()=>b.dataset.a==='study'?studyCat(c.id):openWords(c.id));L.appendChild(d);return}
    d.innerHTML=`<span class="drag">☰</span><div class="t"><b>${esc(c.name)}</b><small>${count(c)} 词</small></div>
    <button class="pb r" style="height:34px;padding:0 10px;font-size:13px" data-a="study">学这个类</button><button class="mini" data-a="up">↑</button><button class="mini" data-a="dn">↓</button>${c.parent?'':'<button class="mini" data-a="sub" title="新建子类">＋</button>'}<button class="mini" data-a="more">⋯</button>`;
    d.querySelector('.t').onclick=()=>{S.cur=c.id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)};
    d.querySelectorAll('button').forEach(b=>b.onclick=()=>catAct(c,b.dataset.a));L.appendChild(d)});
  enableDrag(L,(from,to)=>{const a=cat(from),b=cat(to);if(!a||!b||a.loose||b.loose||(a.parent||null)!==(b.parent||null))return toast('只能在同级内拖动');moveIn(S.cats,a,S.cats.indexOf(b));save();renderLib()})}
function studyCat(id){S.cur=id;S.idx=0;save();hist.length=0;go('study',false);renderStudy(true)}
function catAct(c,a){if(a==='study')return studyCat(c.id);
  if(a==='up'||a==='dn'){const sib=S.cats.filter(x=>!x.loose&&(x.parent||null)===(c.parent||null));const i=sib.indexOf(c),j=i+(a==='up'?-1:1);if(j<0||j>=sib.length)return;moveIn(S.cats,c,S.cats.indexOf(sib[j]));save();renderLib()}
  else if(a==='sub'){const n=prompt('子类名称');if(n&&n.trim()){newCat(n.trim(),c.id);save();renderLib()}}
  else if(a==='more')sheet([['📋 管理单词',()=>openWords(c.id)],['✏️ 重命名',()=>{const n=prompt('新名称',c.name);if(n){c.name=n;save();renderLib()}}],
    ['🗑 删除分类',()=>delCat(c),1]])}
function delCat(c){const ks=c.parent?[]:kids(c.id);const n=count(c);
  const title=`<b>删除「${esc(c.name)}」？</b>`+(ks.length?`这是大类，下面的 ${ks.length} 个子类（${ks.map(k=>esc(k.name)).join('、')}）也会一起删除。`:'')+`共 ${n} 个单词。`;
  const go2=keep=>{const ids=[c.id,...ks.map(k=>k.id)];if(keep){const L=ensureLoose();[c,...ks].forEach(x=>L.words.push(...x.words))}S.cats=S.cats.filter(x=>!ids.includes(x.id));if(ids.includes(S.cur))S.cur='__all';S.idx=0;save();renderLib();toast(keep?`已删除分类，${n} 个单词移到「未分类」`:`已删除分类和 ${n} 个单词`)};
  sheet([[ks.length?'只删分类（含子类），保留单词':'只删分类，保留单词',()=>go2(true)],[ks.length?'分类和单词一起删（含子类）':'分类和单词一起删',()=>{if(confirm(`确定永久删除 ${n} 个单词？`))go2(false)},1]],title)}
$('#addParent').onclick=()=>{const n=prompt('大类名称');if(n&&n.trim()){const c=newCat(n.trim());if(!S.cur)S.cur=c.id;save();renderLib()}};
function enableDrag(list,done){list.querySelectorAll('.drag').forEach(h=>{h.onpointerdown=e=>{const row=h.closest('.row');row.style.opacity=.5;h.setPointerCapture(e.pointerId);
  h.onpointerup=ev=>{row.style.opacity='';h.onpointerup=null;const el=document.elementFromPoint(ev.clientX,ev.clientY);const t=el&&el.closest('.row');if(t&&t!==row)done(row.dataset.id,t.dataset.id)}}})}
function catOptions(sel){sel.innerHTML=ordered().map(c=>`<option value="${c.id}">${c.parent?'　└ ':''}${esc(c.name)}</option>`).join('');if(S.cur)sel.value=S.cur}
function ensureCat(){if(!S.cats.length){const c=newCat('我的单词');S.cur=c.id}}
// ================= words of a category =================
let wCat=null,wMode=null,wSel=new Set();
function openWords(id){wCat=id;wMode=null;wSel.clear();renderWords();go('words')}
function renderWords(){const c=cat(wCat);if(!c)return;$('#wTitle').textContent=c.loose?'未分类':c.name;const L=$('#wList');L.innerHTML=c.words.length?'':(c.loose?'<p class="muted">新导入的单词会先放在这里。点「多选加入分类」把它们放进分类。</p>':'<p class="muted">这个分类自身没有单词（子类单词请到子类里管理）</p>');
  $('#wOkWrap').innerHTML=wMode?'<button class="ok" id="wOk">✓</button>':'';if(wMode)$('#wOk').onclick=wFinish;
  $('#wDelMode').classList.toggle('r',wMode==='del');$('#wMoveMode').classList.toggle('r',wMode==='move');$('#wEditMode').classList.toggle('r',wMode==='edit');
  c.words.forEach((w,i)=>{if(wMode==='edit'){const d=document.createElement('div');d.className='ecard';d.innerHTML=`<div class="f">${editorHTML(w)}</div>`;L.appendChild(d);bindEditor(d,w,true);return}
    const d=document.createElement('div');d.className='row'+(wSel.has(w.id)?' sel':'');d.dataset.id=w.id;
    d.innerHTML=`${wMode==='del'||wMode==='move'?`<span class="chk${wSel.has(w.id)?' on':''}">✓</span>`:'<span class="drag">☰</span>'}<div class="t"><b>${esc(w.word)}</b> ${lvBadge(w,'tag')}<div class="sub">${esc(w.pos)} ${esc(w.meaning)}${w.hint?'　谐音 '+esc(w.hint):''}</div></div>${wMode?'':'<button class="mini" data-a="-1">↑</button><button class="mini" data-a="1">↓</button>'}`;
    if(wMode==='del'||wMode==='move')d.onclick=()=>{wSel.has(w.id)?wSel.delete(w.id):wSel.add(w.id);renderWords()};
    d.querySelectorAll('button').forEach(b=>b.onclick=()=>{const j=i+ +b.dataset.a;if(j<0||j>=c.words.length)return;moveIn(c.words,w,j);save();renderWords()});L.appendChild(d)});
  if(!wMode)enableDrag(L,(f,t)=>{const a=c.words.find(x=>x.id===f),b=c.words.find(x=>x.id===t);moveIn(c.words,a,c.words.indexOf(b));save();renderWords()})}
$('#wMoveMode').onclick=()=>{wMode=wMode==='move'?null:'move';wSel.clear();renderWords()};
$('#wDelMode').onclick=()=>{wMode=wMode==='del'?null:'del';wSel.clear();renderWords()};
$('#wEditMode').onclick=()=>{wMode=wMode==='edit'?null:'edit';renderWords()};
$('#wFix').onclick=async()=>{const c=cat(wCat);toast('正在补全…',60000);for(const w of c.words)await lite(w,true);save();renderWords();toast('已补全音标、谐音和等级')};
function wFinish(){const c=cat(wCat);if(wMode==='move'&&wSel.size){const targets=ordered().filter(x=>x.id!==c.id&&!x.loose);if(!targets.length)return toast('请先在词库新建分类');
  return sheet(targets.map(t=>[(t.parent?'　└ ':'')+esc(t.name),()=>{const mv=c.words.filter(w=>wSel.has(w.id));c.words=c.words.filter(w=>!wSel.has(w.id));t.words.push(...mv);wMode=null;wSel.clear();save();renderWords();toast(`已把 ${mv.length} 个词加入「${t.name}」`)}]),'<b>加入到哪个分类？</b>')}if(wMode==='del'&&wSel.size){if(!confirm(`删除选中的 ${wSel.size} 个单词？`))return;c.words=c.words.filter(w=>!wSel.has(w.id))}wMode=null;wSel.clear();save();renderWords();toast('已完成')}
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
  for(let i=0;i<ents.length;i++){prog(`第${cur+1}/${N}张 · 查词典补全 ${i+1}/${ents.length}（${ents[i].word}）`,(cur+.6+.4*i/ents.length)/N);await Enrich.enrich(ents[i])}Enrich.linkDerived(ents);return ents}
let importing=false;
$('#runOcr').onclick=async()=>{if(!shots.length||importing)return;importing=true;$('#runOcr').style.display='none';$('#prog').style.display='block';const list=shots.slice(),N=list.length;const got=[];let usedAI=0,fellBack=0,lastErr='';
  try{for(let cur=0;cur<N;cur++){let ents=null;
      if(CFG.ai&&CFG.key){prog(`第${cur+1}/${N}张 · AI 识别中…`,cur/N);try{ents=await aiOCR(list[cur].f);usedAI++;
          for(let i=0;i<ents.length;i++){prog(`第${cur+1}/${N}张 · 补全音标/谐音 ${i+1}/${ents.length}`,(cur+.5+.5*i/ents.length)/N);await lite(ents[i]);if(!ents[i].meaning)ents[i].meaning=await Enrich.meaning(ents[i].word.toLowerCase()).catch(()=>'')}}
        catch(e){lastErr=e.message;fellBack++;ents=null}}
      if(!ents)ents=await tessOCR(list[cur].f,cur,N);
      ents.forEach(e=>{const{flags,photo,ocrSentence,_sel,...x}=e;x.id=uid();x.status='new';x.v=2;got.push(x)})}
    const L=ensureLoose();const before=allWords().length;L.words.push(...got);S.cur='__all';S.idx=before;save();
    shots.forEach(s=>URL.revokeObjectURL(s.url));shots=[];renderThumbs();$('#prog').style.display='none';
    toast(`已导入 ${got.length} 个词`+(fellBack?`（AI 失败 ${fellBack} 张，已改用本地识别：${lastErr.slice(0,40)}）`:''),fellBack?5000:2600);prefetchAll();hist.length=0;renderLib();go('lib',false)}
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
async function importItems(items,msg){const L=ensureLoose();const before=allWords().length;const ws=items.map(x=>({...x,id:uid(),status:'new',v:2}));L.words.push(...ws);S.cur='__all';S.idx=before;save();
  toast(msg||`已导入 ${ws.length} 个词`,3000);hist.length=0;renderLib();go('lib',false);
  for(const w of ws){try{await lite(w);if(!w.meaning)w.meaning=await Enrich.meaning(w.word.toLowerCase())}catch(e){}save()}prefetchAll();if(view==='study')renderStudy(false);if(view==='lib')renderLib();return ws.length}
$('#pasteBtn').onclick=async()=>{try{const items=await parseImport($('#pasteBox').value);$('#pasteBox').value='';await importItems(items)}catch(e){toast('无法识别：'+e.message,3500)}};
async function hashImport(){if(!/#import=/.test(location.hash))return;const raw=location.hash;history.replaceState(null,'',location.pathname+location.search);
  try{const items=await parseImport(raw);const code='PZCK1:'+raw.split('#import=')[1];await importItems(items,`已导入 ${items.length} 个词`);
    if(!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches)sheet([['📋 复制导入代码（到主屏幕 App 里粘贴）',()=>{navigator.clipboard&&navigator.clipboard.writeText(code).then(()=>toast('已复制，打开主屏幕 App → 拍照 → 粘贴导入'),()=>prompt('长按复制这段代码',code))}]],`<b>已导入 ${items.length} 个词</b>如果你平时用的是主屏幕上的「拍照词库」，它和 Safari 的数据是分开的。复制下面的代码，到主屏幕 App 的拍照页「粘贴导入链接/代码」里粘贴即可。`)}
  catch(e){toast('导入链接无效：'+e.message,4000)}}
window.addEventListener('hashchange',hashImport);
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
  ensureLoose();if(S.cur!=='__all'&&!cat(S.cur))S.cur=(S.cats[0]||{}).id;migrate();renderStudy(false);
  // try autoplay on startup
  const w=curWord();if(w){const a=getA(wordURL(w.word));const tryPlay=()=>a.play().then(()=>{unlocked=true}).catch(err=>{if(err&&err.name==='NotAllowedError'){$('#hint').style.display='block'}else tts(w.word)});
    if(a.readyState>=2)tryPlay();else{a.addEventListener('canplay',()=>{if(!unlocked)tryPlay()},{once:true});setTimeout(()=>{if(!unlocked&&a.readyState<2)$('#hint').style.display='block'},1500)}}
  setTimeout(prefetchAll,800);hashImport()})();
// ================= service worker auto-update =================
if('serviceWorker'in navigator){const had=!!navigator.serviceWorker.controller;let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(had&&!reloading){reloading=true;location.reload()}});
  navigator.serviceWorker.register('sw.js',{scope:'./'}).then(r=>{r.update();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update()})})}

$('#catName').onclick=()=>sheet([['📚 全部单词（'+allWords().length+'）',()=>studyCat('__all')],...ordered().map(c=>[(c.parent?'　└ ':'')+esc(c.name)+'（'+count(c)+'）',()=>studyCat(c.id)])]);
