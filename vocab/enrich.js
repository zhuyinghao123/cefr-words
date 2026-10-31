// Dictionary enrichment: IPA, 谐音, Chinese meaning, sentence repair, translation.
(function(g){
const CE=g.CEFR||(typeof require!='undefined'?require('./cefr.js'):null);
let cache={get:async()=>null,set:async()=>{}};       // replaced by app with IndexedDB
let base='';                                         // URL prefix for cmu-ipa.txt
let lexP=null,LEX=null;
async function lex(){if(LEX)return LEX;if(!lexP)lexP=(async()=>{let t;
  if(typeof window=='undefined')t=require('fs').readFileSync(__dirname+'/cmu-ipa.txt','utf8');else t=await (await fetch(base+'cmu-ipa.txt')).text();
  const m=new Map();for(const l of t.split('\n')){const i=l.indexOf(' ');if(i>0)m.set(l.slice(0,i),l.slice(i+1))}LEX=m;return m})();return lexP}
const isWord=w=>(LEX&&LEX.has(w))||!!(CE&&CE.has(w));
async function cached(k,fn){const v=await cache.get(k);if(v!=null)return v;const r=await fn();if(r!=null)await cache.set(k,r);return r}
async function getJSON(u,ms=8000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)return null;return await r.json()}catch(e){return null}finally{clearTimeout(t)}}
// ---------- IPA ----------
const norm=s=>s.normalize('NFC').replace(/[\u0361\u035c\u032f]/g,'').replace(/^[\/\[]|[\/\]]$/g,'').replace(/ɹ/g,'r').replace(/ɛ/g,'e').replace(/ɝ/g,'ɜː').replace(/ɚ/g,'ər').replace(/\./g,'').replace(/ɡ/g,'g').trim();
function cmuToUK(s){return s.replace(/oʊ/g,'əʊ').replace(/ɜːr/g,'ɜː').replace(/ər/g,'ə').replace(/ɑːr/g,'ɑː').replace(/ɔːr/g,'ɔː').replace(/r(?=$|[^aeiouɑɔəɜɪʊæʌ])/g,'')}
function fixStress(s){return s.replace(/([^aeiouɑɔəɜɪʊæʌˈˌ]*)([ˈˌ])/g,(m,c,st)=>c.length>1?c.slice(0,-1)+st+c.slice(-1):st+c)}
async function ipa(word){return cached('ipa:'+word,async()=>{let uk='',us='',src='';
  const j=await getJSON(`https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(word)}&prop=wikitext&format=json&origin=*`);
  const t=j&&j.parse&&j.parse.wikitext&&j.parse.wikitext['*'];
  if(t){const en=t.split(/\n==(?!=)/).find(x=>/^English==/.test(x))||t;
    for(const l of en.split('\n')){const m=l.match(/\{\{IPA\|en\|([^}]*)\}\}/);if(!m)continue;const parts=m[1].split('|');const ip=parts.filter(p=>/^[\/\[][^-]/.test(p)).map(norm);const a=(parts.find(p=>/^a=/.test(p))||'').slice(2);
      if(!ip.length)continue;const isUK=!a||/UK|RP|Received|England|British/i.test(a),isUS=/US|GA|General American|GenAm/i.test(a);
      if(isUK&&!uk)uk=ip[0];if(isUS&&!us)us=ip[0];if(!a&&!us)us='';}
    if(uk||us)src='Wiktionary';}
  if(!uk&&!us){const d=await getJSON('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word));
    if(Array.isArray(d)){for(const e of d)for(const p of e.phonetics||[]){if(!p.text)continue;if(/-uk/.test(p.audio||'')&&!uk)uk=norm(p.text);else if(/-us/.test(p.audio||'')&&!us)us=norm(p.text);else if(!uk)uk=norm(p.text)}if(uk||us)src='dictionaryapi.dev'}}
  if(!uk&&!us){const L=await lex();const c=L.get(word);if(c){us=fixStress(c);uk=cmuToUK(us);src='CMUdict'}}
  if(uk===us)us='';if(!uk&&!us)return null;return{uk,us,src}})}
// ---------- 谐音 ----------
const VOW=['aɪə','aʊə','eɪ','aɪ','ɔɪ','əʊ','oʊ','aʊ','ɪə','eə','ʊə','iː','uː','ɑː','ɔː','ɜː','i','ɪ','e','æ','ʌ','ə','ɒ','ɔ','ʊ','u','ɑ','a','o','ɐ','ɜ'];
const CON=['tʃ','dʒ','p','b','t','d','k','g','f','v','θ','ð','s','z','ʃ','ʒ','h','m','n','ŋ','l','r','w','j','x'];
const INI={p:'p',b:'b',t:'t',d:'d',k:'k',g:'g',f:'f',v:'w',θ:'s',ð:'z',s:'s',z:'z',ʃ:'sh',ʒ:'sh',tʃ:'q',dʒ:'j',h:'h',m:'m',n:'n',l:'l',r:'r',w:'w',j:'y',x:'h','':''};
const FIN={'i':'i','iː':'i','ɪ':'i','e':'ai','æ':'ai','ʌ':'a','ə':'e','ɐ':'a','ɑː':'a','ɑ':'a','a':'a','ɒ':'ao','ɔ':'ao','ɔː':'ao','o':'ou','ʊ':'u','u':'u','uː':'u','ɜː':'e','ɜ':'e','eɪ':'ei','aɪ':'ai','ɔɪ':'ao','əʊ':'ou','oʊ':'ou','aʊ':'ao','ɪə':'i','eə':'ai','ʊə':'u','aɪə':'ai','aʊə':'ao'};
const NAS={n:{i:'in',e:'en',a:'an',ai:'an',ei:'en',ao:'ang',ou:'ong',u:'un'},ŋ:{i:'ing',e:'eng',a:'ang',ai:'ang',ei:'eng',ao:'ang',ou:'ong',u:'ong'},m:{i:'in',e:'en',a:'an',ai:'an',ei:'en',ao:'ang',ou:'ong',u:'un'}};
const SOLO={p:'普',b:'布',t:'特',d:'德',k:'克',g:'格',f:'夫',v:'夫',θ:'斯',ð:'则',s:'斯',z:'兹',ʃ:'什',ʒ:'日',tʃ:'奇',dʒ:'奇',h:'赫',m:'姆',n:'恩',ŋ:'嗯',l:'尔',r:'尔',w:'乌',j:'伊',x:'赫'};
const CH=Object.fromEntries('a阿 ai爱 an安 ang昂 ao奥 e额 ei诶 en恩 er尔 ou欧 ba巴 bai白 ban班 bang帮 bao包 bei贝 ben本 beng崩 bi比 bin宾 bing冰 bu布 ong翁 pa帕 pai派 pan盘 pang胖 pao泡 pei佩 pen盆 peng朋 pi皮 pin拼 ping平 pou剖 pu普 ma妈 mai买 man满 mang忙 mao猫 mei美 men门 meng梦 mi米 min民 ming明 mou谋 mu木 fa发 fan凡 fang方 fei飞 fen分 feng风 fou否 fu夫 da大 dai代 dan单 dang当 dao到 de德 dei得 den扽 deng登 di迪 ding丁 dou斗 dong东 du杜 dun顿 ta他 tai泰 tan坦 tang唐 tao涛 te特 teng腾 ti提 ting听 tou头 tong通 tu图 tun吞 na那 nai奈 nan南 nang囊 nao脑 ne呢 nei内 nen嫩 neng能 ni尼 nin您 ning宁 nou耨 nong农 nu努 la拉 lai来 lan兰 lang朗 lao老 le勒 lei雷 leng冷 li利 lin林 ling灵 lou楼 long龙 lu路 lun论 ga嘎 gai该 gan干 gang刚 gao高 ge格 gei给 gen根 geng耕 gou狗 gong工 gu古 gun滚 ka卡 kai凯 kan看 kang康 kao考 ke克 kei凯 ken肯 keng坑 kou口 kong空 ku酷 kun昆 ha哈 hai海 han汉 hang航 hao好 he赫 hei黑 hen很 heng恒 hou后 hong红 hu胡 hun混 ji吉 jin金 jing京 ju句 jun君 qi奇 qin勤 qing清 qu曲 qun群 xi西 xin新 xing星 xu需 zha扎 zhai摘 zhan站 zhang张 zhao赵 zhe哲 zhei这 zhen真 zheng正 zhi之 zhou周 zhong中 zhu朱 zhun准 cha查 chai柴 chan禅 chang常 chao超 che车 chen晨 cheng成 chi吃 chou抽 chong冲 chu出 chun春 sha沙 shai晒 shan山 shang上 shao少 she蛇 shei谁 shen神 sheng生 shi诗 shou手 shu书 shun顺 re惹 ren人 reng仍 ri日 rou肉 rong荣 ru如 run润 ran然 rang让 rao饶 rui瑞 rei瑞 za杂 zai在 zan赞 zang脏 zao早 ze则 zei贼 zen怎 zeng增 zi兹 zou走 zong宗 zu租 zun尊 ca擦 cai菜 can参 cang藏 cao草 ce策 cen岑 ceng层 ci次 cou凑 cong从 cu粗 cun村 sa萨 sai赛 san三 sang桑 sao扫 se色 sen森 seng僧 si斯 sou搜 song松 su苏 sun孙 ya呀 yai崖 yan严 yang杨 yao摇 ye耶 yi衣 yin音 ying英 you优 yong勇 yu鱼 yun云 wa哇 wai歪 wan万 wang王 wei维 wen温 weng翁 wo沃 wu乌 wao哇 wou沃 fao佛 fo佛 je杰 ja加 jai杰 jei杰 jou纠 jao交 jan坚 jang江 qe切 qa恰 qai切 qou秋 qao乔 qan前 qang强 xe谢 xai谢'.split(' ').map(x=>[x.replace(/[^a-z]/g,''),x.replace(/[a-z]/g,'')]));
const ALT={i:['ei','e'],ai:['a','e'],ou:['o','u','ao'],ei:['ai','i','e'],ao:['ou','a'],e:['ei','a'],u:['ou','o'],a:['e'],in:['en','an'],en:['an','in'],an:['en'],ing:['eng','ang'],eng:['ang','ing'],ang:['eng'],ong:['eng','ang'],un:['en','ong']};
function syl(ini,fin){const c=[ini+fin,...(ALT[fin]||[]).map(f=>ini+f)];if(ini==='')c.unshift({i:'yi',u:'wu',in:'yin',ing:'ying',ong:'weng',un:'wen'}[fin]||fin);
  if(ini==='w'&&fin==='ai')c.unshift('wei');if(ini===''&&fin==='e')c.unshift('a');if(ini==='y'){c.unshift('y'+(fin==='i'?'i':fin))}if(ini==='w'&&fin==='u')c.unshift('wu');if(ini==='h'&&fin==='i')c.unshift('xi');if(ini==='k'&&fin==='i')c.unshift('ki','qi');if(ini==='g'&&fin==='i')c.unshift('ji');
  for(const s of c)if(CH[s])return CH[s];return (SOLO[ini]||'')+(CH[fin]||'')}
function xieyin(ip){if(!ip)return'';let s=ip.normalize('NFD').replace(/n\u0329/g,'ən').replace(/l\u0329/g,'əl').replace(/m\u0329/g,'əm').replace(/[\u0300-\u036f]/g,'').replace(/[ˈˌ\/\[\]()ʰ‿.ˑ̩ ]/g,'').replace(/ɡ/g,'g').replace(/ɹ/g,'r').replace(/ɛ/g,'e').replace(/ɚ/g,'ər').replace(/ɝ/g,'ɜː');
  const T=[];while(s){const v=VOW.find(x=>s.startsWith(x));if(v){T.push({v});s=s.slice(v.length);continue}const c=CON.find(x=>s.startsWith(x));if(c)T.push({c});s=s.slice(c?c.length:1)}
  let out='';for(let i=0;i<T.length;i++){const t=T[i];
    if(t.c){const n=T[i+1];if(n&&n.v){const vt=n.v;let fin=FIN[vt];const after=T[i+2],aft2=T[i+3];
        if(after&&after.c&&NAS[after.c]&&!(aft2&&aft2.v)){fin=NAS[after.c][fin]||fin;i+=1}
        out+=syl(INI[t.c],fin);i+=1;if(after&&after.c==='r'&&!(aft2&&aft2.v)&&/[ɑɔɜə]/.test(vt))i+=1;}
      else out+=SOLO[t.c]||'';continue}
    let fin=FIN[t.v];const n=T[i+1],n2=T[i+2];if(n&&n.c&&NAS[n.c]&&!(n2&&n2.v)){fin=NAS[n.c][fin]||fin;i++}out+=syl('',fin)}
  return out}
// ---------- Chinese meaning ----------
function cleanZh(list){const out=[];for(let m of list){if(!m)continue;m=m.replace(/(\S+) (\S+) \[[a-z0-9 ]*\]/,'$2').replace(/\[[^\]]*\]/g,' ').replace(/[a-zA-Z]+\./g,' ');
  for(const p of m.split(/[\s,，;；、]+/)){if(/^[\u4e00-\u9fff]{1,6}$/.test(p)&&!out.includes(p))out.push(p)}if(out.length>=3)break}return out.slice(0,2)}
async function meaning(word){return cached('zh:'+word,async()=>{const j=await getJSON('https://api.mymemory.translated.net/get?langpair=en|zh-CN&q='+encodeURIComponent(word));if(!j)return null;
  const c=cleanZh([j.responseData&&j.responseData.translatedText,...(j.matches||[]).filter(m=>+m.match>=0.85).map(m=>m.translation.replace(/^(\S+) (\S+) \[[^\]]*\]/,'$2'))]);return c.length?c.join('，'):null})}
const garbledZh=s=>!s||!/[\u4e00-\u9fff]{2,}/.test(s)||/[a-zA-Z]{2,}/.test(s);
// ---------- translation ----------
async function translate(t){if(!t)return'';return cached('tr:'+t,async()=>{const j=await getJSON('https://api.mymemory.translated.net/get?langpair=en|zh-CN&q='+encodeURIComponent(t.slice(0,480)));
  const s=j&&j.responseData&&j.responseData.translatedText;if(!s||/MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(s)||+j.responseStatus>=400||!/[\u4e00-\u9fff]/.test(s))return null;return s})||''}
// ---------- sentences ----------
const stemOf=w=>w.replace(/(ation|ion|e|y|s)$/,'').slice(0,Math.max(4,w.length-3));
function hasTarget(s,w){return new RegExp('\\b'+stemOf(w),'i').test(s)}
function judge(s,w){if(!s)return{ok:false,why:'空'};const toks=s.match(/[A-Za-z’']+/g)||[];
  const junk=toks.filter(t=>!okTok(t));
  const lastFn=/\b(the|a|an|of|to|in|and|with|for|by|at|on|is|are)[.!?]?$/i.test(s.trim());
  return{ok:!lastFn&&toks.length>=6&&junk.length===0&&/[.!?]["”]?$/.test(s)&&hasTarget(s,w),toks:toks.length,junk,end:/[.!?]["”]?$/.test(s),target:hasTarget(s,w)}}
function pre(s){return (s||'').replace(/\s+/g,' ').replace(/\b(of|around|the|in|to|at|for|with|on|by) [AI]\b(?= [a-z])/g,'$1').trim()}
const okTok=t=>{const c=t.replace(/[^A-Za-z’']/g,'');if(!c)return /^[\d.,;:!?"“”%-]+$/.test(t);if(/[’']/.test(c)&&c.split(/[’']/)[0].length>=2)return true;const l=c.toLowerCase();return isWord(l)||isWord(CE?CE.lemma(l):l)||(/^[A-Z]/.test(c)&&c.length>2)};
function repair(s,w){if(!s)return s;s=pre(s);let a=s.split(' ');const bad=a.map(t=>!okTok(t));const fj=bad.indexOf(true,Math.max(0,a.length-4));if(fj>=0&&fj>a.length-4)a=a.slice(0,fj);s=a.join(' ');
  s=s.split(' ').filter(t=>{const c=t.replace(/[^A-Za-z’']/g,'');if(!c)return /^[\d.,;:!?"“”%-]+$/.test(t);const l=c.toLowerCase().replace(/[’'].*$/,'');
    return isWord(l)||isWord(CE?CE.lemma(l):l)||(/^[A-Z]/.test(c)&&c.length>2)}).join(' ');
  s=s.replace(/\s+([,.;!?])/g,'$1').trim();if(s&&!/[.!?]$/.test(s)&&judge(s+'.',w).toks>=8)s+='.';return s}
async function example(word){return cached('ex:'+word,async()=>{
  const j=await getJSON(`https://api.tatoeba.org/unstable/sentences?lang=eng&q=${encodeURIComponent('='+word)}&trans:lang=cmn&sort=relevance&limit=20`);
  let best=null;for(const s of (j&&j.data)||[]){const n=s.text.split(' ').length;if(n<6||n>22||!hasTarget(s.text,word))continue;
    const tr=(s.translations||[]).flat().filter(t=>t&&t.lang==='cmn');const hans=tr.find(t=>t.script!=='Hant')||tr[0];
    const sc=(hans?0:5)+Math.abs(n-13);if(!best||sc<best.sc)best={sc,sentence:s.text,trans:hans?hans.text:''}}
  if(!best){const d=await getJSON('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(word));
    if(Array.isArray(d))for(const e of d)for(const m of e.meanings)for(const x of m.definitions)if(x.example&&x.example.split(' ').length>=5&&!best)best={sentence:x.example.replace(/^./,c=>c.toUpperCase())+(/[.!?]$/.test(x.example)?'':'.'),trans:''}}
  return best?{sentence:best.sentence,trans:best.trans}:null})}
// ---------- snapping ----------
function lev(a,b){const m=a.length,n=b.length;if(Math.abs(m-n)>2)return 9;let p=[...Array(n+1).keys()];for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
async function snap(word){const L=await lex();if(L.has(word)||(CE&&CE.has(word)))return word;let best=word,bd=3,inD=false;
  const cands=new Set([...(CE?[...Object.keys(CE.D.ox),...Object.keys(CE.D.cj)]:[])]);for(const k of L.keys())if(k[0]===word[0])cands.add(k);
  for(const k of cands){const d=lev(word,k);const kd=CE&&CE.has(k);if(d<bd||(d===bd&&kd&&!inD)){bd=d;best=k;inD=kd}}return bd<=2?best:word}
// ---------- level ----------
function level(word){if(!CE)return{lv:null,src:''};const l=CE.lemma(word);if(CE.D.ox[l])return{lv:CE.lvOf(l),src:'Oxford',lemma:l};if(CE.D.cj[l])return{lv:CE.lvOf(l),src:'CEFR-J',lemma:l};return{lv:null,src:'未收录',lemma:l}}
// ---------- full enrichment of one parsed entry ----------
async function enrich(e,opts={}){const log=opts.log||(()=>{});await lex();const flags=[];
  const orig=e.word;e.word=await snap(e.word.toLowerCase());if(e.word!==orig)flags.push('词形校正 '+orig+'→'+e.word);
  const ip=await ipa(e.word);e.ipaUK=ip?ip.uk:'';e.ipaUS=ip?ip.us:'';e.ipaSrc=ip?ip.src:'';e.ipa=e.ipaUK?'/'+e.ipaUK+'/':(e.ipaUS?'/'+e.ipaUS+'/':'');
  e.hint=xieyin(e.ipaUK||e.ipaUS);
  if(garbledZh(e.meaning)){const m=await meaning(e.word);if(m){e.meaning=m;flags.push('释义补全')}}
  e.sentence=pre(e.sentence);const j=judge(e.sentence,e.word);
  if(!j.ok){const r=repair(e.sentence,e.word),j2=judge(r,e.word);
    if(j2.ok){if(r!==e.sentence)flags.push('例句修复');e.sentence=r}
    else{const x=await example(e.word);if(x){e.ocrSentence=e.sentence;e.sentence=x.sentence;e.trans=x.trans||'';e.filled=true;flags.push('补全')}else if(r)e.sentence=r}}
  if(e.sentence&&!e.trans)e.trans=await translate(e.sentence)||'';
  const lv=level(e.word);e.level=lv.lv;e.levelSrc=lv.src;e.flags=flags;return e}
function linkDerived(list){for(const a of list){const rel=list.filter(b=>b!==a&&b.word.slice(0,6)===a.word.slice(0,6)&&a.word.length>=6);
  if(rel.length&&!a.extra)a.extra='派生 '+rel.map(b=>`${b.word} ${b.ipa||''} (${b.pos||''}) ${b.meaning||''}`.replace(/\s+/g,' ').trim()).join('；')}return list}
g.Enrich={enrich,ipa,xieyin,meaning,translate,example,snap,level,judge,repair,linkDerived,lex,setCache:c=>cache=c,setBase:b=>base=b};
if(typeof module!='undefined')module.exports=g.Enrich;
})(typeof window!='undefined'?window:globalThis);
