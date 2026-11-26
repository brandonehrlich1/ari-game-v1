export function modelKey(card) {
  if(!card||!String(card.id).startsWith('stuffy-'))return null;
  const name=String(card.name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  return /turtwig|turtlewig/.test(name)?'turtwig':null;
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
  for(const m of [sage,yellow,tan,navy,green]){m.bumpMap=tex;m.bumpScale=.018;}
  const sphere=new T.SphereGeometry(1,40,28);
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
  ellipsoid(sage,0,1.04,.69,.59,.57,.55);
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
const models={turtwig};
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
    camera.position.set(3.65,2.45,4.6);camera.lookAt(0,1.05,0);
    scene.add(new T.HemisphereLight(0xfff6de,0x6e7892,2.1));
    const light=new T.DirectionalLight(0xfff7ea,2.3);light.position.set(3,5,4);scene.add(light);
    const fill=new T.DirectionalLight(0xb3dafa,.8);fill.position.set(-4,2,-3);scene.add(fill);
    scene.add(asset.root);
    const floor=new T.Mesh(new T.CircleGeometry(1.05,48),new T.MeshBasicMaterial({color:0x9bdfb9,transparent:true,opacity:.16,depthWrite:false}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
    host.replaceChildren(renderer.domElement);
    const abort=new AbortController(),opts={signal:abort.signal};
    const state={renderer,asset,floor,abort,frame:0};current=state;
    let dragging=false,lastX=0,lastY=0,rot=.15,tilt=0,spin=true;
    const canvas=renderer.domElement;canvas.setAttribute('aria-label','Rotatable 3D Turtwig plush');canvas.tabIndex=0;
    canvas.addEventListener('pointerdown',e=>{dragging=true;spin=false;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture?.(e.pointerId);},opts);
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;rot+=(e.clientX-lastX)*.012;tilt=Math.max(-.25,Math.min(.25,tilt+(e.clientY-lastY)*.006));lastX=e.clientX;lastY=e.clientY;},opts);
    const release=()=>{dragging=false;};canvas.addEventListener('pointerup',release,opts);canvas.addEventListener('pointercancel',release,opts);
    canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();spin=false;rot+=e.key==='ArrowLeft'?-.18:.18;}},opts);
    const draw=()=>{if(current!==state)return;if(!document.hidden){if(spin)rot+=.008;asset.root.rotation.y=rot;asset.root.rotation.x=tilt;renderer.render(scene,camera);}state.frame=requestAnimationFrame(draw);};
    draw();
  }catch(e){asset?.dispose();renderer.dispose();renderer.forceContextLoss?.();throw e;}
}
window.addEventListener('pagehide',closeModelPreview);
