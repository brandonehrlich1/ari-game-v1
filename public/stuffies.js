/* Stuffies: local creator, camera matching, and binder extension. */
import { normalize, matchViews, frameCrop, advanceMatch, confirmMatch, mergeReferences, referenceName, rankViews, applyTraining } from './stuffies-match.js';
import { HOSTED_VERSION, HOSTED_STUFFIES, hostedIdentity, nextCatch } from './stuffies-catalog.js';

const DB = 'arimon-stuffies-v1';
const LIMIT = 6;
const $ = id => document.getElementById(id);
let panel, modelPromise, photos = [], original = null, art = null, active = false;
let teaching=null, teachStream=null, teachGeneration=0;
let scanGeneration = 0, scanTimer, busy = false;
let liveVideo = null, liveRoster = [], liveModel = null, inference = null, tapBusy = false, readyMatch = null, tracking = {id:null,count:0}, lastSeen = 0;
const now = () => performance.now();
let previewGeneration = 0, photoGeneration = 0, previewReady = false;
let hooks = {};
const urls = new Map();
let dbPromise;
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve,reject)=>{
    const r = indexedDB.open(DB,1);
    r.onupgradeneeded=()=>r.result.createObjectStore('stuffies',{keyPath:'id'});
    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);
  }).catch(e=>{dbPromise=null;throw e;});
  return dbPromise;
}
async function store(mode, operation) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('stuffies',mode), s=tx.objectStore('stuffies');
    let result;
    try { operation(s, v=>{result=v;}); } catch(e){tx.abort();reject(e);}
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error||Error('Storage operation canceled'));
  });
}
const rawRecords=()=>store('readonly',(s,set)=>{const r=s.getAll();r.onsuccess=()=>set(r.result);});
let hostedPromise=null,hostedError='';
function installHosted(seed, prepared) {
  return store('readwrite',(s,set)=>{
    const req=s.getAll();
    req.onsuccess=()=>{
      const all=req.result;
      const existing=all.find(r=>r.id===seed.id)||all.find(r=>r.hostedKey===seed.key)||all.find(r=>hostedIdentity(r,seed));
      if(existing?.hostedVersion>=HOSTED_VERSION){set(existing);return;}
      if(existing){
        const item={...existing,hostedKey:seed.key,hostedVersion:HOSTED_VERSION,refs:mergeReferences(existing.refs||[],prepared.refs)};
        s.put(item);set(item);
      }else{
        const item={id:seed.id,name:seed.name,hostedKey:seed.key,hostedVersion:HOSTED_VERSION,rarity:'Common',refs:prepared.refs,art:prepared.art,card:prepared.card,claimed:false,catchCount:0,createdAt:Date.now()};
        s.add(item);set(item);
      }
    };
  });
}
async function hostedPhoto(view) {
  const res=await fetch('assets/stuffies/'+view+'.webp');
  if(!res.ok)throw Error('Hosted reference unavailable: '+view);
  return fitImage(await decode(await res.blob()),768);
}
async function ensureHosted() {
  if(!hostedPromise)hostedPromise=(async()=>{
    const existing=await rawRecords(),errors=[];
    for(const seed of HOSTED_STUFFIES){
      if(existing.some(r=>hostedIdentity(r,seed)&&r.hostedVersion>=HOSTED_VERSION))continue;
      try{
        const photos=await Promise.all(seed.views.map(hostedPhoto));
        while(inference)await inference.catch(()=>{});
        const m=await model(),vectors=[];
        for(const photo of photos)vectors.push(...await referenceVectors(m,photo));
        const refs=mergeReferences([],vectors);
        if(refs.length<2)throw Error('Hosted recognition references incomplete');
        const source=renderCutout(photos[0],26);
        await installHosted(seed,{refs,art:await asBlob(source),card:await asBlob(drawCard(source,seed.name,'Common'))});
      }catch(e){errors.push(seed.name+': '+e.message);}
    }
    hostedError=errors.join('; ');
    if(errors.length){hostedPromise=null;console.warn('Hosted stuffies:',hostedError);}
  })().catch(e=>{hostedError=e.message;hostedPromise=null;console.warn('Hosted stuffies:',e);});
  return hostedPromise;
}
async function records(){await ensureHosted();return rawRecords();}
const addRecord=r=>store('readwrite',(s)=>s.add(r));
function readStuffy(id){
  return store('readonly',(s,set)=>{const r=s.get(id);r.onsuccess=()=>set(r.result);});
}
async function appendReferences(id,vectors,views){
  const written=await store('readwrite',(s,set)=>{
    const req=s.get(id);req.onsuccess=()=>{
      try{
        const item=applyTraining(req.result,vectors,views,Date.now(),mergeReferences);
        const put=s.put(item);put.onsuccess=()=>set({count:item.trainingCount,refs:item.refs.length});
      }catch(e){set({error:e.message});}
    };
  });
  if(!written||written.error)throw Error(written?.error||'Training save did not complete');
  // Confirm in a separate transaction, not just in memory or on a put event.
  const saved=await readStuffy(id);
  const ids=new Set((saved?.trainingViews||[]).map(v=>v.id));
  if(!saved||!views.every(v=>ids.has(v.id))||saved.trainingCount<written.count)
    throw Error('Training could not be verified in storage. Please retry.');
  return saved;
}
async function trainingView(source){
  const c=canvas(224,224),ctx=c.getContext('2d');
  const scale=224/Math.max(source.width,source.height);
  ctx.fillStyle='#eee';ctx.fillRect(0,0,224,224);
  ctx.drawImage(source,(224-source.width*scale)/2,(224-source.height*scale)/2,source.width*scale,source.height*scale);
  return {id:crypto.randomUUID(),at:Date.now(),image:await asBlob(c)};
}
let teachPreviewUrls=[];
function showSavedViews(item){
  for(const u of teachPreviewUrls)URL.revokeObjectURL(u);
  teachPreviewUrls=[];
  const list=$('stuffies-teach-views');list.replaceChildren();
  for(const v of (item.trainingViews||[]).slice(-8)){
    if(!(v.image instanceof Blob))continue;
    const u=URL.createObjectURL(v.image);teachPreviewUrls.push(u);
    const img=document.createElement('img');img.src=u;img.alt='Saved training view';list.append(img);
  }
  status('stuffies-teach-total',(item.trainingCount||0)+' saved training views · '+(item.refs?.length||0)+' reference samples');
}
function claim(id) {
  return store('readwrite',(s,set)=>{
    const r=s.get(id);
    r.onsuccess=()=>{
      const item=r.result;
      const caught=nextCatch(item,Date.now());if(!caught){set(null);return;}
      s.put(caught.record);set(caught);
    };
  });
}
function asset(r, kind='card') {
  const key=r.id+':'+kind;
  if(!urls.has(key))urls.set(key,URL.createObjectURL(r[kind]));
  return urls.get(key);
}
function canvas(w,h) {const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function asBlob(c) {return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('Could not render image')),'image/png'));}
function decode(file) {
  return new Promise((resolve,reject)=>{
    const u=URL.createObjectURL(file), im=new Image();
    im.onload=()=>{URL.revokeObjectURL(u);resolve(im);};
    im.onerror=()=>{URL.revokeObjectURL(u);reject(Error('Could not open this photo. Try a JPEG or PNG.'));};
    im.src=u;
  });
}
function fitImage(im,max=768) {
  const scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
  const c=canvas(Math.max(1,Math.round(im.naturalWidth*scale)),Math.max(1,Math.round(im.naturalHeight*scale)));
  c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c;
}
// Remove only connected edge pixels close to the corner background colors.
// Intentionally conservative: a plain contrasting background works best.
function renderCutout(src,tolerance) {
  const c=canvas(src.width,src.height), ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(src,0,0);
  if(!tolerance)return c;
  const w=c.width,h=c.height,n=w*h,im=ctx.getImageData(0,0,w,h),p=im.data;
  const corners=[0,w-1,(h-1)*w,n-1].map(i=>[p[4*i],p[4*i+1],p[4*i+2]]);
  const marked=new Uint8Array(n), q=new Int32Array(n);let read=0,write=0;
  const push=i=>{
    if(marked[i])return;marked[i]=1;
    const j=i*4;
    if(p[j+3]===0||corners.some(k=>Math.hypot(p[j]-k[0],p[j+1]-k[1],p[j+2]-k[2])<=tolerance))q[write++]=i;
  };
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
  while(read<write){
    const i=q[read++],x=i%w,y=Math.floor(i/w);p[4*i+3]=0;
    if(x)push(i-1);if(x<w-1)push(i+1);if(y)push(i-w);if(y<h-1)push(i+w);
  }
  let l=w,r=-1,t=h,b=-1,remaining=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>20){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);remaining++;}
  if(remaining<n*.025) return src; // never silently erase the whole toy
  ctx.putImageData(im,0,0);
  const pad=Math.ceil(Math.max(r-l,b-t)*.05);
  const out=canvas(r-l+1+2*pad,b-t+1+2*pad);
  out.getContext('2d').drawImage(c,l,t,r-l+1,b-t+1,pad,pad,r-l+1,b-t+1);
  return out;
}
function square(source,w,h,ratio=1) {
  const c=canvas(224,224),ctx=c.getContext('2d');
  const side=Math.min(w,h)*ratio;
  ctx.drawImage(source,(w-side)/2,(h-side)/2,side,side,0,0,224,224);
  return c;
}
function script(src) {
  return new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=src;s.async=true;
    const timer=setTimeout(()=>{s.remove();reject(Error('Recognition library download timed out'));},30000);
    s.onload=()=>{clearTimeout(timer);resolve();};
    s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('Recognition library could not load'));};
    document.head.append(s);
  });
}
async function model() {
  if(!modelPromise) modelPromise=(async()=>{
    if(!window.tf)await script('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
    if(!window.mobilenet)await script('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js');
    await window.tf.ready();
    return window.mobilenet.load({version:2,alpha:1.0});
  })().catch(e=>{modelPromise=null;throw e;});
  return modelPromise;
}
async function embedding(m,source) {
  const tensor=m.infer(source,true);
  try{return normalize(await tensor.data());}finally{tensor.dispose();}
}
function drawCard(src,name,rarity) {
  const c=canvas(600,800),ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,600,800);g.addColorStop(0,'#fff3d6');g.addColorStop(.55,'#bde9e3');g.addColorStop(1,'#6b9bd8');
  ctx.fillStyle=g;ctx.fillRect(0,0,600,800);
  ctx.strokeStyle='#fff';ctx.lineWidth=12;ctx.strokeRect(17,17,566,766);
  ctx.textAlign='center';ctx.fillStyle='#173755';ctx.font='bold 26px system-ui';ctx.fillText('ARIMON • STUFFIES',300,65,530);
  ctx.font='bold 44px system-ui';ctx.fillText(name,300,126,530);
  ctx.fillStyle='rgba(255,255,255,.56)';ctx.beginPath();ctx.arc(300,405,230,0,Math.PI*2);ctx.fill();
  const scale=Math.min(500/src.width,490/src.height);
  const w=src.width*scale,h=src.height*scale;
  ctx.drawImage(src,(600-w)/2,150+(500-h)/2,w,h);
  ctx.fillStyle='#173755';ctx.font='bold 28px system-ui';ctx.fillText(rarity+' • REAL-LIFE FRIEND',300,713,520);
  ctx.font='20px system-ui';ctx.fillText('Found in the real world',300,752);
  return c;
}
function status(id,msg){$(id).textContent=msg;}
function section(name) {
  if(name!=='live-teach')stopLiveTeach();
  for(const x of panel.querySelectorAll('[data-stuffies-view]'))x.classList.toggle('hidden',x.dataset.stuffiesView!==name);
}
function stopScan() {
  active=false;scanGeneration++;clearTimeout(scanTimer);
  liveVideo=null;liveRoster=[];liveModel=null;readyMatch=null;tracking={id:null,count:0};hideTarget();huntStatus('');
}
function close() {if(busy||tapBusy)return;stopLiveTeach();stopScan();panel.classList.add('hidden');hooks.resume?.();}
function open() {
  if(tapBusy)return;hooks.closeGallery?.();panel.classList.remove('hidden');showHome();
}
async function showHome() {
  stopScan();section('home');
  const list=$('stuffies-list');list.replaceChildren();
  try {
    status('stuffies-count','Loading hosted stuffies and saved collection…');
    const items=(await records()).sort((a,b)=>a.name.localeCompare(b.name));
    status('stuffies-count',items.filter(x=>x.claimed).length+' of '+items.length+' stuffed animals claimed'+(hostedError?' · Some hosted references failed to load; reopen setup to retry.':''));
    for(const r of items){
      const row=document.createElement('div');row.className='stuffies-roster-row';
      const img=document.createElement('img');img.src=asset(r,'art');img.alt='';
      const label=document.createElement('span');label.textContent=r.name+' · '+(r.claimed?'Caught '+Math.max(1,r.catchCount||0)+' times':'Ready to find')+' · '+(r.trainingCount||0)+' trained views · '+(r.refs?.length||0)+' reference samples';
      const train=document.createElement('label');train.className='stuffies-train';train.textContent='Teach views';
      const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;
      input.setAttribute('aria-label','Add reference photos for '+r.name);
      input.addEventListener('change',async()=>{const files=Array.from(input.files||[]);input.value='';await teach(r.id,r.name,files);});
      train.append(input);
      const live=document.createElement('button');live.type='button';live.className='stuffies-live-button';live.textContent='Teach live';live.addEventListener('click',()=>{if(!busy)void startLiveTeach(r);});
      const controls=document.createElement('div');controls.className='stuffies-train-controls';controls.append(live,train);
      row.append(img,label,controls);list.append(row);
    }
  } catch(e){status('stuffies-count','Could not read this device’s collection: '+e.message);}
}
function stopLiveTeach(){
  teachGeneration++;teaching=null;
  for(const u of teachPreviewUrls)URL.revokeObjectURL(u);teachPreviewUrls=[];
  $('stuffies-teach-views')?.replaceChildren();
  const video=$('stuffies-teach-video');
  if(video){video.pause();video.srcObject=null;}
  if(teachStream){teachStream.getTracks().forEach(t=>t.stop());teachStream=null;}
}
async function startLiveTeach(r){
  stopScan();stopLiveTeach();section('live-teach');
  const generation=teachGeneration;
  teaching={id:r.id,name:r.name};
  showSavedViews(r);
  status('stuffies-teach-title','Teach '+r.name);
  status('stuffies-teach-status','Starting camera…');
  $('stuffies-teach-save').disabled=true;$('stuffies-teach-test').disabled=true;
  try{
    const existing=hooks.cameraStream?.();
    let stream=existing;
    if(!stream?.getVideoTracks().some(t=>t.readyState==='live')){
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      if(generation!==teachGeneration){stream.getTracks().forEach(t=>t.stop());return;}
      teachStream=stream;
    }
    if(generation!==teachGeneration)return;
    const video=$('stuffies-teach-video');video.srcObject=stream;await video.play();
    if(generation!==teachGeneration)return;
    const saved=await readStuffy(r.id);
    if(generation!==teachGeneration)return;
    if(saved)showSavedViews(saved);
    status('stuffies-teach-status','Center only '+r.name+' in the square. Capture the front, side, and another angle.');
    $('stuffies-teach-save').disabled=false;$('stuffies-teach-test').disabled=false;
  }catch(e){if(generation===teachGeneration)status('stuffies-teach-status','Camera unavailable: '+e.message);}
}
async function captureLiveTeach(){
  if(busy||!teaching)return;
  const t=teaching,generation=teachGeneration,video=$('stuffies-teach-video');
  if(video.readyState<2||!video.videoWidth){status('stuffies-teach-status','Camera still starting. Try again when the picture appears.');return;}
  busy=true;$('stuffies-teach-save').disabled=true;$('stuffies-teach-test').disabled=true;
  try{
    const rect=video.getBoundingClientRect();
    if(!rect.width||!rect.height)throw Error('Camera view not ready');
    const samples=[1,.82,.55,.35].map(r=>cropAt(video,rect.left+rect.width/2,rect.top+rect.height/2,r));
    status('stuffies-teach-status','Learning and saving this view…');
    const view=await trainingView(samples[0]);
    while(inference)await inference.catch(()=>{});
    const m=await model(),vectors=[];
    for(const sample of samples)vectors.push(await embedding(m,sample));
    if(generation!==teachGeneration)return;
    const saved=await appendReferences(t.id,vectors,[view]);
    if(generation!==teachGeneration)return;
    showSavedViews(saved);
    status('stuffies-teach-status','Saved and verified! Turn '+t.name+' a little and capture another, or return to hunt.');
  }catch(e){if(generation===teachGeneration)status('stuffies-teach-status','Could not save: '+e.message);}
  finally{busy=false;if(generation===teachGeneration){$('stuffies-teach-save').disabled=false;$('stuffies-teach-test').disabled=false;}}
}
async function testLiveTeach(){
  if(busy||!teaching)return;
  const t=teaching,generation=teachGeneration,video=$('stuffies-teach-video');
  if(video.readyState<2||!video.videoWidth)return;
  busy=true;$('stuffies-teach-save').disabled=true;$('stuffies-teach-test').disabled=true;
  try{
    status('stuffies-teach-status','Testing this view without claiming…');
    const rect=video.getBoundingClientRect();
    const samples=[1,.82,.55,.35].map(r=>cropAt(video,rect.left+rect.width/2,rect.top+rect.height/2,r));
    while(inference)await inference.catch(()=>{});
    const m=await model(),roster=await records(),vectors=[];
    for(const sample of samples)vectors.push(await embedding(m,sample));
    if(generation!==teachGeneration)return;
    const ranking=rankViews(vectors,roster),own=ranking.find(r=>r.id===t.id),best=matchViews(vectors,roster);
    const score=own?own.score.toFixed(2):'unavailable';
    status('stuffies-teach-status',best?.id===t.id?'Matched '+t.name+' (similarity '+score+'). Test another angle before hunting.':'Not a reliable match for '+t.name+' (similarity '+score+'). Capture a clearer view or change lighting; keep other toys out of frame.');
  }catch(e){if(generation===teachGeneration)status('stuffies-teach-status','Test failed: '+e.message);}
  finally{busy=false;if(generation===teachGeneration){$('stuffies-teach-save').disabled=false;$('stuffies-teach-test').disabled=false;}}
}
async function referenceVectors(m,p) {
  const result=[];
  for(const ratio of [1,.82,.60])result.push(await embedding(m,square(p,p.width,p.height,ratio)));
  // Preserve the complete silhouette when a portrait photo is taller than its square crop.
  const full=canvas(224,224),ctx=full.getContext('2d'),scale=224/Math.max(p.width,p.height);
  ctx.fillStyle='#eee';ctx.fillRect(0,0,224,224);ctx.drawImage(p,(224-p.width*scale)/2,(224-p.height*scale)/2,p.width*scale,p.height*scale);
  result.push(await embedding(m,full));
  return result;
}
async function teach(id,name,files) {
  if(busy||!files.length)return;busy=true;
  try{
    status('stuffies-count','Teaching '+name+' new views…');
    while(inference)await inference.catch(()=>{});
    const m=await model(),vectors=[],views=[];
    for(const f of files.slice(0,6)){
      if(f.size>30*1024*1024)throw Error('Use photos under 30 MB.');
      const p=fitImage(await decode(f),768);
      vectors.push(...await referenceVectors(m,p));
      views.push(await trainingView(p));
    }
    const saved=await appendReferences(id,vectors,views);
    await showHome();status('stuffies-count',name+': '+saved.trainingCount+' training views saved and verified. Resume hunting.');
  }catch(e){status('stuffies-count','Could not teach: '+e.message);}
  finally{busy=false;}
}
function showCreator() {
  stopScan();section('creator');
  photos=[];original=null;art=null;previewReady=false;photoGeneration++;previewGeneration++;
  $('stuffies-name').value='';$('stuffies-rarity').value='Common';$('stuffies-threshold').value='42';
  $('stuffies-preview').classList.add('hidden');$('stuffies-save').disabled=true;
  status('stuffies-create-status','Add 2–6 real photos of one stuffy. First photo becomes its collectible.');
  status('stuffies-photo-count','0 / 6 photos');$('stuffies-ref-list').replaceChildren();
}
async function updatePreview() {
  if(!original)return;
  const generation=++previewGeneration;previewReady=false;$('stuffies-save').disabled=true;
  const result=renderCutout(original,Number($('stuffies-threshold').value));
  if(generation!==previewGeneration)return;
  art=result;const p=$('stuffies-preview');p.width=result.width;p.height=result.height;p.getContext('2d').drawImage(result,0,0);
  p.classList.remove('hidden');previewReady=true;$('stuffies-save').disabled=photos.length<2||busy;
}
async function addPhotos(files) {
  if(busy)return;
  const generation=photoGeneration;
  busy=true;$('stuffies-save').disabled=true;
  try {
    for(const f of files){
      if(photos.length>=LIMIT||generation!==photoGeneration)break;
      if(f.size>30*1024*1024)throw Error('Please use a photo smaller than 30 MB.');
      const im=await decode(f);
      if(generation!==photoGeneration)return;
      const ref=fitImage(im,768);photos.push(ref);
      if(!original)original=ref;
      const thumb=canvas(64,64),ct=thumb.getContext('2d');const scale=Math.min(64/ref.width,64/ref.height);
      ct.drawImage(ref,(64-ref.width*scale)/2,(64-ref.height*scale)/2,ref.width*scale,ref.height*scale);
      $('stuffies-ref-list').append(thumb);
    }
    await updatePreview();
    status('stuffies-create-status',photos.length>=2?'Preview the full-body cutout, then save.':'Add another view of the same animal.');
  } catch(e){status('stuffies-create-status',e.message);}
  finally{busy=false;status('stuffies-photo-count',photos.length+' / 6 photos');$('stuffies-save').disabled=!previewReady||photos.length<2;}
}
async function save() {
  if(busy||photos.length<2||!art||!previewReady)return;
  const name=$('stuffies-name').value.trim().slice(0,40);
  if(!name){status('stuffies-create-status','Give your stuffy a name first.');return;}
  busy=true;$('stuffies-save').disabled=true;
  const source=art, refs=photos.slice(), rarity=$('stuffies-rarity').value;
  try {
    const existing=await records();
    if(existing.some(r=>referenceName(r.name)===referenceName(name)))throw Error('That name is already registered. Use Teach views or Teach live to improve it.');
    status('stuffies-create-status','Preparing recognition on this device. First use downloads the model…');
    const m=await model(), vectors=[];
    for(const p of refs)vectors.push(...await referenceVectors(m,p));
    const r={id:'stuffy-'+crypto.randomUUID(),name,rarity,refs:mergeReferences([],vectors),art:await asBlob(source),card:await asBlob(drawCard(source,name,rarity)),claimed:false,createdAt:Date.now()};
    await addRecord(r);
    busy=false;photos=[];original=null;art=null;
    await showHome();
    status('stuffies-count',name+' is ready to find! Point the camera at the real stuffy.');
  } catch(e){status('stuffies-create-status','Could not save: '+e.message);}
  finally{busy=false;$('stuffies-save').disabled=photos.length<2||!previewReady;}
}
function huntStatus(message) {
  const el=$('stuffy-hunt-status');el.textContent=message;el.classList.toggle('hidden',!message);
}
function hideTarget() { $('stuffy-target')?.classList.add('hidden'); }
function clearRecognition() { readyMatch=null;tracking={id:null,count:0};hideTarget(); }
function canScan() {
  return active&&liveVideo&&liveVideo.readyState>=2&&liveVideo.videoWidth&&!document.hidden&&hooks.canHunt?.();
}
function cropAt(video,x,y,ratio) {
  const rect=video.getBoundingClientRect();
  const {left,top,side}=frameCrop(video.videoWidth,video.videoHeight,rect,x,y,ratio);
  const c=canvas(224,224);c.getContext('2d').drawImage(video,left,top,side,side,0,0,224,224);return c;
}
async function compareAt(video,x,y,ratios,m,roster) {
  while(inference)await inference.catch(()=>{});
  const images=ratios.map(r=>cropAt(video,x,y,r));
  const job=(async()=>{const vectors=[];for(const im of images)vectors.push(await embedding(m,im));return matchViews(vectors,roster);})();
  inference=job;
  try{return await job;}finally{if(inference===job)inference=null;}
}
function paintTarget(r) {
  $('stuffy-target-label').textContent='🧸 '+r.name+' · Tap to catch!';
  $('stuffy-target').classList.remove('hidden');
}
export function pauseStuffiesHunt() {clearRecognition();huntStatus('');}
export async function startStuffiesHunt(video) {
  stopScan();liveVideo=video;const generation=scanGeneration;
  try{
    huntStatus('Preparing stuffy recognition…');
    const roster=await records();if(generation!==scanGeneration)return;liveRoster=roster;
    if(!liveRoster.length){huntStatus(hostedError?'Could not load hosted stuffies · reopen Stuffies setup to retry':'Add a stuffy to start');return;}
    if(!video?.srcObject){huntStatus('Camera unavailable · Ari Balls still work');return;}
    huntStatus('Loading stuffy recognition…');
    const loadedModel=await model();if(generation!==scanGeneration)return;liveModel=loadedModel;
    active=true;
    const tick=async()=>{
      if(generation!==scanGeneration||!active)return;
      try{
        if(tapBusy){clearRecognition();}
        else if(!canScan()){clearRecognition();huntStatus('');}
        else {
          const rect=video.getBoundingClientRect();
          const m=await compareAt(video,rect.left+rect.width/2,rect.top+rect.height/2,[1,.72,.45],liveModel,liveRoster);
          if(generation!==scanGeneration||!active)return;
          if(!canScan()||tapBusy){clearRecognition();}
          else {
            tracking=advanceMatch(tracking,m,2);
            const r=m&&liveRoster.find(x=>x.id===m.id);
            if(tracking.claim&&r){readyMatch=r;lastSeen=now();paintTarget(r);huntStatus('Tap the real stuffy!');}
            else {readyMatch=null;hideTarget();huntStatus(r?'Hold still…':'Aim at a stuffy or tap it directly');}
          }
        }
      }catch(e){if(generation===scanGeneration){clearRecognition();huntStatus('Recognition paused · open Stuffies setup to retry');active=false;}return;}
      if(generation===scanGeneration&&active)scanTimer=setTimeout(tick,700);
    };
    tick();
  }catch(e){if(generation===scanGeneration){clearRecognition();huntStatus('Recognition unavailable · Ari Balls still work');}}
}
export function stuffyTapPending(){return tapBusy;}
export async function tryStuffyTap(x,y) {
  if(!canScan()||tapBusy||!liveRoster.length)return false;
  const generation=scanGeneration,video=liveVideo,m=liveModel,roster=liveRoster;
  const rect=video.getBoundingClientRect();
  if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return false;
  const centered=Math.abs(x-(rect.left+rect.width/2))<rect.width*.38&&Math.abs(y-(rect.top+rect.height/2))<rect.width*.38;
  const expected=centered&&readyMatch&&now()-lastSeen<2300?readyMatch.id:null;
  tapBusy=true;clearRecognition();huntStatus('Checking your stuffy…');
  try {
    const first=await compareAt(video,x,y,[1,.82,.55,.35],m,roster);
    if(generation!==scanGeneration||!canScan()||!first||(expected&&first.id!==expected)){
      if(generation===scanGeneration)huntStatus('No match yet — center the toy and try again');return false;
    }
    await new Promise(resolve=>setTimeout(resolve,220));
    const second=await compareAt(video,x,y,[1,.82,.55,.35],m,roster);
    if(generation!==scanGeneration||!canScan()||!confirmMatch(first,second)){
      if(generation===scanGeneration)huntStatus('Hold the camera steady and tap again');return false;
    }
    const caught=await claim(first.id);
    if(!caught)return false;
    if(generation!==scanGeneration)return true;
    const r=caught.record;hooks.onLiveClaim?.({id:r.id,name:r.name,src:asset(r,'card'),number:'Real-life Stuffy',modelKey:r.hostedKey},caught.wasNew);
    return true;
  }catch(e){if(generation===scanGeneration)huntStatus('Could not claim — try again');return false;}
  finally{tapBusy=false;}
}
function showReward(r,isNew) {
  stopScan();section('reward');
  $('stuffies-reward-title').textContent=isNew?'🎉 '+r.name+' claimed!':r.name;
  $('stuffies-reward-img').src=asset(r,'card');$('stuffies-reward-img').alt=r.name+' collectible card';
  if(isNew){navigator.vibrate?.(90);hooks.onClaim?.(r);}
}
export async function renderStuffiesBinder(container) {
  const sectionEl=document.createElement('section');sectionEl.className='binder-page binder-page-featured stuffies-binder';
  const title=document.createElement('div');title.className='binder-page-title';title.textContent='Real-life Stuffies';
  const label=document.createElement('p');label.className='stuffies-note';
  const btn=document.createElement('button');btn.type='button';btn.className='stuffies-action';btn.textContent='Manage stuffies';btn.addEventListener('click',()=>open());
  const grid=document.createElement('div');grid.className='binder-grid';
  sectionEl.append(title,label,btn,grid);container.prepend(sectionEl);
  try{
    const items=await records();
    label.textContent=items.filter(r=>r.claimed).length+' / '+items.length+' claimed · separate from the 151-card set';
    for(const r of items){
      const item=document.createElement('button');item.type='button';item.className='gallery-item binder-slot '+(r.claimed?'owned':'registered locked');
      const name=document.createElement('strong');name.textContent=r.claimed?r.name:'Unclaimed stuffy';
      if(r.claimed){const im=document.createElement('img');im.src=asset(r,'card');im.alt=r.name;item.append(im);item.addEventListener('click',()=>{hooks.closeGallery?.();hooks.onViewCard?.({id:r.id,name:r.name,src:asset(r,'card'),number:'Real-life Stuffy',modelKey:r.hostedKey});});}
      else{const back=document.createElement('div');back.className='card-back';back.textContent='?';item.append(back);item.disabled=true;}
      item.append(name);grid.append(item);
    }
  }catch(e){label.textContent='Stuffies storage unavailable: '+e.message;}
}
export function initStuffies(options={}) {
  hooks=options;panel=$('stuffies-panel');
  $('stuffies-open').addEventListener('click',()=>open());
  $('stuffies-hunt').addEventListener('click',()=>open());
  $('stuffies-close').addEventListener('click',close);
  $('stuffies-new').addEventListener('click',showCreator);
  $('stuffies-teach-save').addEventListener('click',captureLiveTeach);
  $('stuffies-teach-test').addEventListener('click',testLiveTeach);
  $('stuffies-teach-done').addEventListener('click',()=>{if(!busy){close();hooks.startHunt?.();}});
  $('stuffies-scan').addEventListener('click',()=>{if(!busy){close();hooks.startHunt?.();}});
  $('stuffies-scan-again').addEventListener('click',()=>{if(!busy){close();hooks.startHunt?.();}});
  for(const x of panel.querySelectorAll('[data-stuffies-home]'))x.addEventListener('click',()=>{if(!busy)showHome();});
  for(const id of ['stuffies-files','stuffies-camera-file'])$(id).addEventListener('change',e=>{const files=Array.from(e.target.files||[]);e.target.value='';addPhotos(files);});
  $('stuffies-threshold').addEventListener('input',()=>{if(!busy)updatePreview();});
  $('stuffies-save').addEventListener('click',save);
  $('stuffies-reset').addEventListener('click',()=>{if(!busy)showCreator();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseStuffiesHunt();});
  window.addEventListener('pagehide',()=>{stopLiveTeach();stopScan();});
}
