// OCR line parser: lines = [{t:text,c:confidence}]
(function(g){
const CJK=/[\u4e00-\u9fff]/;
const cjkJoin=s=>s.replace(/([\u4e00-\u9fff\uff08-\uff1b\u3001\u3002\[\]（）；，…])\s+(?=[\u4e00-\u9fff\uff08-\uff1b\u3001\u3002\[\]（）；，…])/g,'$1');
const ENTRY=/^[^a-zA-Z]*([a-z][a-z\-]{2,})\s*[(（]\s*(n|v|vt|vi|adj|adv|prep|conj|pron|a|ad)\s*[.,]?\s*[)）]\s*(.*)$/;
function fixEn(s){return s.replace(/\b1s\b|\bls\b/g,'is').replace(/\b1n\b/g,'in').replace(/\btO\b/g,'to').replace(/\bDY\b/g,'by').replace(/[|“”]/g,m=>m=='|'?'':'"').replace(/\s+/g,' ').trim();}
function garbled(t){const s=t.replace(/\s/g,'');if(s.length<3)return true;
  const good=(s.match(/[a-zA-Z\u4e00-\u9fff]/g)||[]).length;return good/s.length<0.6;}
function cleanSentence(s){s=fixEn(s);
  // cut at end of sentence; drop trailing junk tokens after final period
  const m=s.match(/^(.*?[.!?])(\s|$)/);if(m&&m[1].split(' ').length>3)s=m[1];
  return s.replace(/\s+[A-Za-z]{1,2}$/,'').trim();}
function parse(lines,minConf=45){
  const out=[];let cur=null,prevNote=null;
  for(const L of lines){
    const t=(L.t||'').replace(/\s+/g,' ').trim();if(!t)continue;
    const m=t.match(ENTRY);
    if(m&&L.c>=40){
      if(cur)out.push(cur);
      let mean=cjkJoin(m[3]);const zh=(mean.match(/[\u4e00-\u9fff\[\]［］（）()，,；;…、\s]+/g)||[]).join('').trim();
      cur={word:m[1].toLowerCase(),ipa:'',pos:m[2]+'.',meaning:zh.replace(/^[\s,，;；]+|[\s,，;；]+$/g,'').replace(/\s/g,'').replace(/\[\s*\]|［\s*］/g,'').replace(/[(（]\s*[)）]/g,'').replace(/\)\)+/g,')').replace(/([\u4e00-\u9fff]{2})[六一二三:：](?=[\u4e00-\u9fff]{2})/g,'$1；'),sentence:'',hint:prevNote||'',trans:''};
      prevNote=null;continue;}
    if(L.c<minConf||garbled(t)){ // possible handwritten note above next word
      const zh=(cjkJoin(t).match(/[\u4e00-\u9fff]+/g)||[]).join('');prevNote=zh.length>=2?zh:null;continue;}
    prevNote=null;if(!cur)continue;
    let rest=t.replace(/^[|/\\:;.\s]+/,'');
    if(!cur.ipa&&!cur.sentence&&!rest.includes('[')&&!/^[A-Z][a-z]* ([a-z]{2,} ?){2}/.test(rest))continue;
    const ip=rest.match(/^[^\[]{0,12}\[([^\]]{3,})\]\s*(.*)$/)||rest.match(/^\[?([^A-Z]*?)\]\s*(.*)$/);
    if(!cur.ipa&&ip&&!cur.sentence){cur.ipa='['+ip[1].trim()+']';rest=ip[2];}
    if(/[.!?]\s*$/.test(cur.sentence))continue;
    if(!cur.sentence)rest=rest.replace(/^.*?(?=\b[A-Z][a-z]+\s)/,'');
    rest=rest.replace(/\s+(?![aAI]\b)[A-Za-z]\b/g,'');
    if(rest&&!CJK.test(rest))cur.sentence+=(cur.sentence?' ':'')+rest;
  }
  if(cur)out.push(cur);
  out.forEach(e=>e.sentence=cleanSentence(e.sentence));
  return out;}
g.parseOCR=parse;if(typeof module!='undefined')module.exports=parse;
})(typeof window!='undefined'?window:globalThis);
