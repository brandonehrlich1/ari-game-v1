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
