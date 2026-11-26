/* Stuffies: local creator, camera matching, and binder extension. */
import { normalize, matchViews, frameCrop, advanceMatch } from './stuffies-match.js';

const DB = 'arimon-stuffies-v1';
const LIMIT = 4;
const $ = id => document.getElementById(id);
let panel, modelPromise, photos = [], original = null, art = null, active = false;
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
const records=()=>store('readonly',(s,set)=>{const r=s.getAll();r.onsuccess=()=>set(r.result);});
const addRecord=r=>store('readwrite',(s)=>s.add(r));
function claim(id) {
  return store('readwrite',(s,set)=>{
    const r=s.get(id);
    r.onsuccess=()=>{
      const item=r.result;
      if(!item||item.claimed){set(null);return;}
      item.claimed=true;item.claimedAt=Date.now();s.put(item);set(item);
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
  for(const x of panel.querySelectorAll('[data-stuffies-view]'))x.classList.toggle('hidden',x.dataset.stuffiesView!==name);
}
function stopScan() {
  active=false;scanGeneration++;clearTimeout(scanTimer);
  liveVideo=null;liveRoster=[];liveModel=null;readyMatch=null;tracking={id:null,count:0};hideTarget();huntStatus('');
}
function close() {if(busy||tapBusy)return;stopScan();panel.classList.add('hidden');hooks.resume?.();}
function open() {
  if(tapBusy)return;hooks.closeGallery?.();panel.classList.remove('hidden');showHome();
}
async function showHome() {
  stopScan();section('home');
  const list=$('stuffies-list');list.replaceChildren();
  try {
    const items=await records();
    status('stuffies-count',items.filter(x=>x.claimed).length+' of '+items.length+' stuffed animals claimed');
    for(const r of items){
      const row=document.createElement('div');row.className='stuffies-roster-row';
      const img=document.createElement('img');img.src=asset(r,'art');img.alt='';
      const label=document.createElement('span');label.textContent=r.name+' · '+(r.claimed?'Claimed':'Ready to find');
      row.append(img,label);list.append(row);
    }
  } catch(e){status('stuffies-count','Could not read this device’s collection: '+e.message);}
}
function showCreator() {
  stopScan();section('creator');
  photos=[];original=null;art=null;previewReady=false;photoGeneration++;previewGeneration++;
  $('stuffies-name').value='';$('stuffies-rarity').value='Common';$('stuffies-threshold').value='42';
  $('stuffies-preview').classList.add('hidden');$('stuffies-save').disabled=true;
  status('stuffies-create-status','Add 2–4 photos of the same stuffy. First photo becomes its collectible.');
  status('stuffies-photo-count','0 / 4 photos');$('stuffies-ref-list').replaceChildren();
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
  finally{busy=false;status('stuffies-photo-count',photos.length+' / 4 photos');$('stuffies-save').disabled=!previewReady||photos.length<2;}
}
async function save() {
  if(busy||photos.length<2||!art||!previewReady)return;
  const name=$('stuffies-name').value.trim().slice(0,40);
  if(!name){status('stuffies-create-status','Give your stuffy a name first.');return;}
  busy=true;$('stuffies-save').disabled=true;
  const source=art, refs=photos.slice(), rarity=$('stuffies-rarity').value;
  try {
    status('stuffies-create-status','Preparing recognition on this device. First use downloads the model…');
    const m=await model(), vectors=[];
    for(const p of refs)vectors.push(await embedding(m,square(p,p.width,p.height)));
    const r={id:'stuffy-'+crypto.randomUUID(),name,rarity,refs:vectors,art:await asBlob(source),card:await asBlob(drawCard(source,name,rarity)),claimed:false,createdAt:Date.now()};
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
    liveRoster=await records();if(generation!==scanGeneration)return;
    if(!liveRoster.some(r=>!r.claimed))return;
    if(!video?.srcObject){huntStatus('Camera unavailable · Ari Balls still work');return;}
    huntStatus('Loading stuffy recognition…');
    liveModel=await model();if(generation!==scanGeneration)return;
    active=true;
    const tick=async()=>{
      if(generation!==scanGeneration||!active)return;
      try{
        if(!canScan()||tapBusy){clearRecognition();huntStatus('');}
        else {
          const rect=video.getBoundingClientRect();
          const m=await compareAt(video,rect.left+rect.width/2,rect.top+rect.height/2,[.82,.55],liveModel,liveRoster);
          if(generation!==scanGeneration||!active)return;
          if(!canScan()||tapBusy){clearRecognition();}
          else {
            tracking=advanceMatch(tracking,m,2);
            const r=m&&liveRoster.find(x=>x.id===m.id);
            if(tracking.claim&&r&&!r.claimed){readyMatch=r;lastSeen=now();paintTarget(r);huntStatus('Tap the real stuffy!');}
            else {readyMatch=null;hideTarget();huntStatus(r?.claimed?r.name+' is already collected':r?'Hold still…':'Aim at a stuffy or tap it directly');}
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
  if(!canScan()||tapBusy||!liveRoster.some(r=>!r.claimed))return false;
  const generation=scanGeneration,video=liveVideo,m=liveModel,roster=liveRoster;
  const rect=video.getBoundingClientRect();
  if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return false;
  const centered=Math.abs(x-(rect.left+rect.width/2))<rect.width*.38&&Math.abs(y-(rect.top+rect.height/2))<rect.width*.38;
  const expected=centered&&readyMatch&&now()-lastSeen<2300?readyMatch.id:null;
  tapBusy=true;clearRecognition();huntStatus('Checking your stuffy…');
  try {
    const first=await compareAt(video,x,y,[.82,.55,.35],m,roster);
    if(generation!==scanGeneration||!canScan()||!first||first.claimed||(expected&&first.id!==expected)){
      if(generation===scanGeneration)huntStatus('No match yet — center the toy and try again');return false;
    }
    const second=await compareAt(video,x,y,[.82,.55],m,roster);
    if(generation!==scanGeneration||!canScan()||!second||second.id!==first.id||second.claimed){
      if(generation===scanGeneration)huntStatus('Hold the camera steady and tap again');return false;
    }
    const caught=await claim(first.id);
    if(!caught)return false;
    if(generation!==scanGeneration)return true;
    hooks.onLiveClaim?.({id:caught.id,name:caught.name,src:asset(caught,'card'),number:'Real-life Stuffy'});
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
      if(r.claimed){const im=document.createElement('img');im.src=asset(r,'card');im.alt=r.name;item.append(im);item.addEventListener('click',()=>{hooks.closeGallery?.();panel.classList.remove('hidden');showReward(r,false);});}
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
  $('stuffies-scan').addEventListener('click',()=>{if(!busy){close();hooks.startHunt?.();}});
  $('stuffies-scan-again').addEventListener('click',()=>{if(!busy){close();hooks.startHunt?.();}});
  for(const x of panel.querySelectorAll('[data-stuffies-home]'))x.addEventListener('click',()=>{if(!busy)showHome();});
  for(const id of ['stuffies-files','stuffies-camera-file'])$(id).addEventListener('change',e=>{const files=Array.from(e.target.files||[]);e.target.value='';addPhotos(files);});
  $('stuffies-threshold').addEventListener('input',()=>{if(!busy)updatePreview();});
  $('stuffies-save').addEventListener('click',save);
  $('stuffies-reset').addEventListener('click',()=>{if(!busy)showCreator();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseStuffiesHunt();});
  window.addEventListener('pagehide',stopScan);
}
