export function normalize(values) {
  const norm=Math.hypot(...values);
  if(!Number.isFinite(norm)||norm===0)throw Error("Image features unavailable");
  return Array.from(values,x=>x/norm);
}

export function chooseMatch(probe, roster, threshold=.84, margin=.075, secondThreshold=.72) {
  const dot=(a,b)=>a.length===b.length?a.reduce((s,x,i)=>s+x*b[i],0):-1;
  const ranked=roster.filter(r=>Array.isArray(r.refs)&&r.refs.length>=2).map(r=>{
    const scores=r.refs.map(ref=>dot(probe,ref)).sort((a,b)=>b-a);
    return {id:r.id,claimed:r.claimed,score:scores[0],second:scores[1]};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(!best||best.score<threshold||best.second<secondThreshold||(ranked[1]&&best.score-ranked[1].score<margin))return null;
  return best;
}

export function advanceMatch(previous, candidate, needed=3) {
  if(!candidate||candidate.claimed)return {id:null,count:0,claim:false};
  const count=previous.id===candidate.id?previous.count+1:1;
  return {id:candidate.id,count,claim:count>=needed};
}

export function mergeReferences(existing, incoming, limit=60) {
  const valid=v=>Array.isArray(v)&&v.length>0&&v.every(Number.isFinite);
  const old=existing.filter(valid), result=old.slice();
  for(const v of incoming.filter(valid)){
    if(result.length&&v.length!==result[0].length)continue;
    if(!result.some(r=>r.length===v.length&&r.reduce((s,x,i)=>s+x*v[i],0)>.995))result.push(v);
  }
  if(result.length<=limit)return result;
  const anchors=Math.min(6,old.length,Math.floor(limit/3));
  return [...result.slice(0,anchors),...result.slice(-(limit-anchors))];
}

export function referenceName(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');}

export function rankViews(probes,roster){
  if(!probes.length)return [];
  const dot=(a,b)=>a.length===b.length?a.reduce((sum,x,i)=>sum+x*b[i],0):-1;
  return roster.filter(r=>Array.isArray(r.refs)&&r.refs.length>=2).map(r=>{
    const views=probes.map(p=>r.refs.map(ref=>dot(p,ref)).sort((a,b)=>b-a)).sort((a,b)=>b[0]-a[0]);
    return {id:r.id,claimed:r.claimed,score:views[0][0],second:views[0][1]};
  }).sort((a,b)=>b.score-a.score);
}

export function matchViews(probes,roster,{minimum=.77,margin=.075}={}) {
  const ranked=rankViews(probes,roster);
  const best=ranked[0];
  if(!best||best.score<minimum||(ranked[1]&&best.score-ranked[1].score<margin))return null;
  return best;
}

export function confirmMatch(first,second) {
  return !!first&&!!second&&!first.claimed&&!second.claimed&&first.id===second.id&&Math.max(first.score,second.score)>=.81&&(first.score+second.score)/2>=.79;
}

export function frameCrop(vw,vh,rect,x,y,ratio) {
  const scale=Math.max(rect.width/vw,rect.height/vh);
  const visibleW=rect.width/scale,visibleH=rect.height/scale;
  const px=(x-rect.left)/scale+(vw-visibleW)/2;
  const py=(y-rect.top)/scale+(vh-visibleH)/2;
  const side=Math.min(vw,vh,visibleW,visibleH)*ratio;
  return {left:Math.max(0,Math.min(vw-side,px-side/2)),top:Math.max(0,Math.min(vh-side,py-side/2)),side};
}
