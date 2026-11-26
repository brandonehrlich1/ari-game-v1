export function modelKey(card) {
  if(!card||!String(card.id).startsWith('stuffy-'))return null;
  if(['turtwig','pikachu','charmander'].includes(card.modelKey))return card.modelKey;
  const name=String(card.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(/turtwig|turtlewig/.test(name))return 'turtwig';
  if(/pikachu|peekachu|pikachoo/.test(name))return 'pikachu';
  if(/charmander|charmandar/.test(name))return 'charmander';
  return null;
}

/* Procedural plush mesh, based on the photographed Turtwig toy.
   A real 3D object, not photogrammetry or a generated 2D image. */
function turtwig(T) {
  const root=new T.Group();
  const materials=[];
  const material=(color,roughness=.94)=>{
    const m=new T.MeshStandardMaterial({color,roughness,metalness:0});materials.push(m);return m;
  };
  const sage=material(0xbcc7a3), yellow=material(0xe6c54b), tan=material(0xbe9661),
        navy=material(0x202c37), green=material(0x459d78), dark=material(0x202b2d),
        white=material(0xf9f7e9), seam=material(0xb0b694), leafSeam=material(0x337e62);
  // Slightly irregular plush fabric, using a shared procedural bump texture.
  const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=128;
  const ctx=textureCanvas.getContext('2d'), image=ctx.createImageData(128,128);
  let seed=13681;
  for(let i=0;i<image.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=100+(seed>>>25);image.data[i]=image.data[i+1]=image.data[i+2]=v;image.data[i+3]=255;}
  ctx.putImageData(image,0,0);
  const tex=new T.CanvasTexture(textureCanvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(5,5);
  for(const m of [sage,yellow,tan,navy,green]){m.bumpMap=tex;m.bumpScale=.012;}
  const sphere=new T.SphereGeometry(1,56,40);
  function ellipsoid(m,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0) {
    const o=new T.Mesh(sphere,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);root.add(o);return o;
  }
  function line(points,m,r=.012) {
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
    const mesh=new T.Mesh(new T.TubeGeometry(curve,32,r,8,false),m);root.add(mesh);return mesh;
  }
  // Squat quadruped body, oversized head, tan shell with a thick dark fabric rim.
  ellipsoid(sage,0,.52,-.16,.53,.40,.77);
  ellipsoid(navy,0,.83,-.34,.59,.18,.68);
  ellipsoid(tan,0,.94,-.34,.56,.28,.65);
  // Shell stripe follows the rounded dome.
  const stripeGeo=new T.SphereGeometry(1,40,24,0,Math.PI*2,0,Math.PI/2);
  const stripe=new T.Mesh(stripeGeo,navy);stripe.position.set(0,.94,-.34);stripe.scale.set(.565,.286,.092);root.add(stripe);
  // Four plush legs and stitched yellow foot caps.
  for(const x of [-.37,.37])for(const z of [-.65,.28]){
    ellipsoid(sage,x,.32,z,.21,.31,.25,0,0,x*.15);
    ellipsoid(yellow,x,.115,z+.027,.208,.115,.244);
    line([[x-.17,.19,z+.16],[x-.075,.23,z+.25],[x,.19,z+.27],[x+.08,.23,z+.25],[x+.17,.19,z+.16]],yellow,.014);
  }
  ellipsoid(sage,0,.46,-.99,.12,.13,.20,-.4);
  // Huge softly rounded head with a pale yellow lower jaw.
  ellipsoid(yellow,0,.79,.69,.565,.34,.49);
  ellipsoid(sage,0,1.04,.69,.61,.56,.57);
  ellipsoid(tan,0,1.49,.56,.42,.18,.38);
  ellipsoid(tan,0,1.68,.48,.115,.25,.13,-.24);
  // Two leaf-shaped fabric lobes atop the head.
  ellipsoid(green,-.19,1.88,.47,.15,.39,.085,.14,-.22,-.66);
  ellipsoid(green,.20,1.82,.37,.13,.34,.085,-.22,.15,.78);
  line([[-.03,1.69,.54],[-.18,1.89,.56],[-.32,2.10,.53]],leafSeam,.009);
  // Side cheek patches and layered embroidered oval eyes.
  for(const sign of [-1,1]){
    ellipsoid(yellow,sign*.435,.86,.81,.20,.27,.27,0,sign*.38,sign*-.2);
    const yaw=sign*.82;
    ellipsoid(yellow,sign*.405,1.13,1.015,.135,.195,.048,0,yaw);
    ellipsoid(navy,sign*.423,1.13,1.035,.082,.132,.052,0,yaw);
    ellipsoid(white,sign*.424,1.166,1.077,.024,.043,.023,0,yaw);
    ellipsoid(dark,sign*.068,.91,1.208,.014,.027,.008,0,0,sign*-.35);
  }
  line([[0,1.5,.79],[0,1.35,1.10],[0,1.11,1.24],[0,.91,1.22]],seam,.007);
  return {root,dispose(){sphere.dispose();stripeGeo.dispose();root.traverse(o=>{if(o.isMesh&&o.geometry!==sphere&&o.geometry!==stripeGeo)o.geometry.dispose();});for(const m of materials)m.dispose();tex.dispose();}};
}

/* Hand-modeled from the provided front/side/back plush photos. */
function plushKit(T) {
  const root=new T.Group(), materials=[], geometries=new Set();
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d'),data=ctx.createImageData(128,128);
  let seed=42317;
  for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=110+(seed>>>25);data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);
  const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(5,5);
  const sphere=new T.SphereGeometry(1,56,40);geometries.add(sphere);
  function mat(color,bump=true){const m=new T.MeshStandardMaterial({color,roughness:.96,metalness:0});if(bump){m.bumpMap=tex;m.bumpScale=.011;}materials.push(m);return m;}
  function mesh(g,m,x=0,y=0,z=0){geometries.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);root.add(o);return o;}
  function ell(m,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const o=mesh(sphere,m,x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);return o;}
  function line(points,m,r=.012){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),32,r,8,false),m);}
  function patch(points,m,z,depth=.065){
    const s=new T.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();
    return mesh(new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:3,steps:1}),m,0,0,z);
  }
  return {root,mat,ell,line,patch,mesh,dispose(){for(const g of geometries)g.dispose();for(const m of materials)m.dispose();tex.dispose();}};
}
function pikachu(T) {
  const k=plushKit(T),{mat,ell,line,patch}=k;
  const yellow=mat(0xe8ca4b), black=mat(0x24262c), red=mat(0xd92128), brown=mat(0x92552c), white=mat(0xf8f5e9,false), seam=mat(0xcdb347);
  // The toy's seated, elongated body, cheeks and raised paws.
  ell(yellow,0,.70,0,.49,.69,.38);
  ell(yellow,0,1.49,.045,.51,.43,.39);
  for(const s of [-1,1]){
    ell(yellow,s*.43,1.03,.23,.14,.29,.155,0,0,s*.18);
    ell(yellow,s*.37,.18,.20,.23,.18,.28,0,s*.24,s*.18);
    ell(black,s*.184,1.55,.407,.089,.114,.027,0,s*.25,s*-.13);
    ell(white,s*.172,1.59,.433,.032,.042,.012,0,s*.2,s*-.13);
    ell(red,s*.366,1.35,.335,.11,.12,.032,0,s*.54);
  }
  ell(black,0,1.46,.437,.036,.021,.014);
  line([[-.17,1.38,.413],[-.10,1.345,.439],[0,1.37,.449],[.10,1.345,.439],[.17,1.38,.413]],black,.009);
  // Asymmetric ears: the photographed toy has one angled ear.
  for(const [s,angle] of [[-1,.85],[1,-.22]]){
    const baseX=s*.31,baseY=1.78, len=.61;
    const vx=-Math.sin(angle),vy=Math.cos(angle);
    ell(yellow,baseX+vx*.24,baseY+vy*.24,.015,.115,.34,.105,0,0,angle);
    ell(black,baseX+vx*.53,baseY+vy*.53,.015,.105,.17,.091,0,0,angle);
  }
  // Brown back stripes and flat lightning-shaped fabric tail, brown at base.
  ell(brown,0,.91,-.313,.36,.075,.042);
  ell(brown,0,.66,-.332,.38,.075,.042);
  patch([[-.06,.28],[.14,.30],[.26,.61],[.05,.70],[-.01,.48]],brown,-.46);
  patch([[.05,.62],[.27,.67],[.15,1.02],[.42,1.13],[.28,1.30],[-.25,1.56],[-.42,1.29],[-.05,1.11],[-.13,.88]],yellow,-.48,.08);
  line([[0,1.87,.23],[0,1.70,.39],[0,1.57,.42]],seam,.006);
  line([[0,1.03,.34],[0,.74,.345],[0,.39,.30]],seam,.006);
  return k;
}
function charmander(T) {
  const k=plushKit(T),{mat,ell,line,mesh}=k;
  const orange=mat(0xf68a17), cream=mat(0xf1df8c), dark=mat(0x25282c), white=mat(0xf5f4e8), blue=mat(0x16899f), red=mat(0xf34c32), flameYellow=mat(0xf6d43b), seam=mat(0xdc7418);
  ell(orange,0,.76,0,.41,.66,.35);
  ell(cream,0,.73,.305,.30,.49,.10);
  ell(orange,0,1.57,.10,.43,.45,.40);
  ell(orange,0,1.40,.34,.38,.26,.30);
  for(const s of [-1,1]){
    ell(orange,s*.37,1.11,.12,.15,.27,.17,0,0,s*.63);
    ell(orange,s*.29,.46,.02,.23,.32,.23,0,0,s*.16);
    ell(orange,s*.31,.17,.20,.22,.17,.31,0,s*.13);
    for(let j=-1;j<=1;j++)ell(white,s*.31+j*.088,.12,.455,.037,.064,.066,.35,0,j*.10);
    ell(white,s*.27,1.69,.387,.135,.173,.035,0,s*.60,s*-.18);
    ell(blue,s*.278,1.67,.409,.105,.139,.042,0,s*.60,s*-.18);
    ell(dark,s*.278,1.707,.432,.082,.112,.041,0,s*.60,s*-.18);
    ell(white,s*.261,1.745,.463,.038,.049,.018,0,s*.50);
    ell(dark,s*.062,1.45,.631,.012,.025,.012,0,0,s*.30);
  }
  line([[-.30,1.39,.49],[-.19,1.34,.595],[0,1.32,.64],[.19,1.34,.595],[.30,1.39,.49]],dark,.011);
  line([[0,1.98,.19],[0,1.78,.46],[0,1.52,.61]],seam,.006);
  // Curved tapering tail with a pale underside and two-tone fabric flame.
  const centers=[[0,.38,-.22],[0,.27,-.47],[0,.24,-.77],[0,.32,-1.02],[0,.52,-1.18],[0,.72,-1.20]];
  const curve=new T.CatmullRomCurve3(centers.map(p=>new T.Vector3(...p)));
  const geo=new T.TubeGeometry(curve,40,.16,20,false);
  const pos=geo.attributes.position;
  for(let i=0;i<=40;i++){
    const center=curve.getPointAt(i/40),factor=1.24-.75*i/40;
    for(let j=0;j<=20;j++){const idx=i*21+j;const v=new T.Vector3().fromBufferAttribute(pos,idx).sub(center).multiplyScalar(factor).add(center);pos.setXYZ(idx,v.x,v.y,v.z);}
  }
  pos.needsUpdate=true;geo.computeVertexNormals();mesh(geo,orange);
  const underside=new T.CatmullRomCurve3([[0,.20,-.27],[0,.115,-.52],[0,.095,-.76],[0,.21,-1.00],[0,.43,-1.17]].map(p=>new T.Vector3(...p)));
  mesh(new T.TubeGeometry(underside,30,.105,16,false),cream);
  ell(red,0,.86,-1.20,.17,.32,.12,-.18);
  ell(red,-.075,.93,-1.20,.08,.19,.09,-.2,0,.24);
  ell(red,.075,.96,-1.20,.075,.20,.09,-.15,0,-.22);
  ell(red,0,1.06,-1.22,.105,.20,.09,-.30);
  ell(flameYellow,0,.84,-1.10,.13,.23,.07,-.15);
  ell(flameYellow,0,.96,-1.105,.08,.13,.055,-.18);
  return k;
}

const models={turtwig,pikachu,charmander};
let current=null;
export function closeModelPreview(){
  if(!current)return;
  const c=current;current=null;cancelAnimationFrame(c.frame);c.abort.abort();
  c.asset.dispose();c.floor.geometry.dispose();c.floor.material.dispose();c.renderer.dispose();c.renderer.domElement.remove();
  c.renderer.forceContextLoss?.();
}
export function openModelPreview(key,host){
  closeModelPreview();
  const T=window.AFRAME?.THREE||window.THREE;
  if(!T||!models[key])throw Error('3D renderer unavailable');
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  let asset;
  try{
    asset=models[key](T);
    const width=Math.max(200,host.clientWidth||300),height=Math.max(200,host.clientHeight||300);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.setSize(width,height);
    if('outputColorSpace'in renderer&&T.SRGBColorSpace)renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.setClearColor(0x000000,0);
    const scene=new T.Scene(), camera=new T.PerspectiveCamera(33,width/height,.1,30);
    asset.root.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(asset.root),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
    const radius=Math.max(size.x,size.y,size.z)*.62;
    const distance=radius/Math.sin(Math.min(1,width/height)*33*Math.PI/360);
    const direction=new T.Vector3(.72,.28,1).normalize();
    camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
    scene.add(new T.HemisphereLight(0xfff6de,0x6e7892,1.55));
    const light=new T.DirectionalLight(0xfff7ea,1.8);light.position.set(3,5,4);scene.add(light);
    const fill=new T.DirectionalLight(0xb3dafa,1.1);fill.position.set(-4,2,-3);scene.add(fill);
    const rim=new T.DirectionalLight(0xffffff,.65);rim.position.set(0,4,-4);scene.add(rim);
    scene.add(asset.root);
    const floor=new T.Mesh(new T.CircleGeometry(1.05,48),new T.MeshBasicMaterial({color:0x9bdfb9,transparent:true,opacity:.16,depthWrite:false}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
    host.replaceChildren(renderer.domElement);
    const abort=new AbortController(),opts={signal:abort.signal};
    const state={renderer,asset,floor,abort,frame:0};current=state;
    let dragging=false,lastX=0,lastY=0,rot=.15,tilt=0,spin=true;
    const canvas=renderer.domElement;canvas.setAttribute('aria-label','Rotatable 3D '+key+' plush');canvas.tabIndex=0;
    canvas.addEventListener('pointerdown',e=>{dragging=true;spin=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);},opts);
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;rot+=(e.clientX-lastX)*.012;tilt=Math.max(-.25,Math.min(.25,tilt+(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY;},opts);
    const release=()=>{dragging=false;};canvas.addEventListener('pointerup',release,opts);canvas.addEventListener('pointercancel',release,opts);
    canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();spin=false;rot+=e.key==='ArrowLeft'?-.18:.18;}},opts);
    const draw=()=>{if(current!==state)return;if(!document.hidden){if(spin)rot+=.008;asset.root.rotation.y=rot;asset.root.rotation.x=tilt;renderer.render(scene,camera);}state.frame=requestAnimationFrame(draw);};
    draw();
  }catch(e){asset?.dispose();renderer.dispose();renderer.forceContextLoss?.();throw e;}
}
window.addEventListener('pagehide',closeModelPreview);
