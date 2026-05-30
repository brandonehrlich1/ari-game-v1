/* AR Character Hunt — game logic (static / self-contained).
 *
 * Placement is metric (meters), so it works indoors AND outdoors:
 *   - WebXR immersive-ar (Android Chrome, AR headsets): full positional
 *     tracking — spheres are anchored in the room and you physically walk to
 *     them, spaced 10-20 ft apart.
 *   - Fallback "magic window" (iOS Safari etc.): live camera passthrough +
 *     gyro look-around; spheres sit around you on a viewable dome so you can
 *     still find and tap them.
 *
 * Characters + tuning come from the browser (IndexedDB) via storage.js, with a
 * bundled seed roster as the default.
 */
import { resolveCharacters, resolveConfig } from './storage.js';

const FT_PER_M = 3.28084;
const ARI_SPHERE_ASSET = 'assets/F5BAFFD4-8565-45B8-8E75-AEC99FAD12BB.png';
const TENNIS_BALL_RADIUS_M = 0.0335;
const MIN_TAP_TARGET_RADIUS_M = 0.18;
const XR_AUTO_CATCH_RADIUS_M = 0.45;

const els = {
  gate: document.getElementById('gate'),
  start: document.getElementById('start'),
  mode: document.getElementById('mode'),
  hud: document.getElementById('hud'),
  scene: document.getElementById('scene'),
  cam: document.getElementById('cam'),
  status: document.getElementById('status'),
  count: document.getElementById('count'),
  total: document.getElementById('total'),
  regen: document.getElementById('regen'),
  reticle: document.getElementById('reticle'),
  toast: document.getElementById('toast'),
  video: document.getElementById('passthrough')
};

const state = {
  config: null,
  characters: [],
  spawns: [],
  found: new Set(),
  xr: false
};

let xrSupported = false;
navigator.xr?.isSessionSupported?.('immersive-ar').then((ok) => {
  xrSupported = ok;
  els.mode.textContent = ok
    ? 'Full AR supported — walk around to find characters.'
    : 'Look-around AR mode (your device has no WebXR) — pan to find characters.';
}).catch(() => {
  els.mode.textContent = 'Look-around AR mode — pan around to find characters.';
});

async function loadData() {
  const [chars, cfg] = await Promise.all([resolveCharacters(), resolveConfig()]);
  state.characters = chars.characters;
  state.config = cfg;
  els.total.textContent = state.config.spawn.count;
}

/* ---- weighted character picker ---- */
function pickCharacter() {
  const list = state.characters;
  if (!list.length) return null;
  const weights = list.map((c) => {
    const f = state.config.characters?.[c.id]?.frequency;
    return Math.max(0, typeof f === 'number' ? f : 1);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return list[(Math.random() * list.length) | 0];
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

function sphereStyle(charId) {
  return { ...(state.config.defaultSphere || {}), ...(state.config.characters?.[charId]?.sphere || {}) };
}

/* ---- generate spawn points in meters around the origin ---- */
function generateSpawns() {
  const sp = state.config.spawn;
  const minM = (sp.minSpacingFeet ?? 10) / FT_PER_M;
  const count = sp.count ?? 24;
  const radiusM = (sp.spreadRadiusFeet ?? 120) / FT_PER_M;
  const pts = [];
  let attempts = 0;

  while (pts.length < count && attempts < count * 80) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radiusM; // uniform over disc
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < minM)) continue;
    pts.push({ x, z });
  }

  state.spawns = pts.map((p, i) => {
    const bearing = Math.atan2(p.x, -p.z); // direction from origin
    return {
      id: `spawn-${i}`,
      x: p.x,
      z: p.z,
      bearing,
      y: 1.1 + Math.random() * 0.9,
      character: pickCharacter()
    };
  });
}

/* ---- render ---- */
function clearSpawns() {
  document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
  state.found.clear();
  els.count.textContent = '0';
}

function renderSpawns() {
  clearSpawns();
  for (const s of state.spawns) {
    if (!s.character) continue;
    const style = sphereStyle(s.character.id);
    const visualRadius = style.radius ?? TENNIS_BALL_RADIUS_M;
    const hitRadius = Math.max(visualRadius, style.hitRadius ?? MIN_TAP_TARGET_RADIUS_M);

    // In look-around (non-XR) mode there's no walking, so pull spheres onto a
    // viewable dome (2.5-7 m) along their bearing instead of true distance.
    let x = s.x, y = s.y, z = s.z;
    if (!state.xr) {
      const d = 2.5 + (s.id.charCodeAt(6) % 5) + Math.random() * 1.5;
      x = Math.sin(s.bearing) * d;
      z = -Math.cos(s.bearing) * d;
    }

    const wrap = document.createElement('a-entity');
    wrap.classList.add('spawn-entity', 'catchable');
    wrap.setAttribute('position', `${x} ${y} ${z}`);
    wrap.dataset.spawnId = s.id;

    // Visible Ari sphere: tennis-ball scale in real-world WebXR meters.
    const ball = document.createElement('a-image');
    ball.classList.add('ari-sphere-visual');
    ball.setAttribute('src', ARI_SPHERE_ASSET);
    ball.setAttribute('width', visualRadius * 2);
    ball.setAttribute('height', visualRadius * 2);
    ball.setAttribute('transparent', 'true');
    ball.setAttribute('look-at', '#cam');
    if (style.bobble) {
      ball.setAttribute('animation', 'property: position; dir: alternate; dur: 2200; easing: easeInOutSine; loop: true; to: 0 0.03 0');
    }
    wrap.appendChild(ball);

    // Larger invisible hit target keeps tapping reliable while preserving the
    // small physical visual size.
    const hit = document.createElement('a-sphere');
    hit.classList.add('ari-sphere-hit-target');
    hit.setAttribute('radius', hitRadius);
    hit.setAttribute('opacity', '0');
    hit.setAttribute('transparent', 'true');
    hit.setAttribute('visible', 'false');
    wrap.appendChild(hit);

    const img = document.createElement('a-image');
    const scale = visualRadius * (style.characterScale ?? 1.5) * 2;
    img.setAttribute('src', s.character.src);
    img.setAttribute('width', scale);
    img.setAttribute('height', scale);
    img.setAttribute('transparent', 'true');
    img.setAttribute('look-at', '#cam');
    img.setAttribute('position', `0 0 ${visualRadius * 0.08}`);
    wrap.appendChild(img);

    wrap.addEventListener('click', () => tryCatch(s, wrap));
    els.scene.appendChild(wrap);
  }
  els.status.textContent = `${state.spawns.length} spheres nearby`;
}

/* ---- catching ---- */
function tryCatch(spawn, entity) {
  if (state.found.has(spawn.id)) return;
  state.found.add(spawn.id);
  entity.setAttribute('animation__catch', 'property: scale; to: 0.01 0.01 0.01; dur: 320; easing: easeInBack');
  setTimeout(() => entity.remove(), 340);
  els.count.textContent = state.found.size;
  toast(`Caught ${spawn.character.name}! ✨`);
}

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1800);
}

/* ---- proximity auto-catch while walking (XR) ---- */
AFRAME.registerComponent('proximity-catcher', {
  tick() {
    if (!state.xr) return;
    const camPos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(camPos);
    document.querySelectorAll('.spawn-entity').forEach((entity) => {
      const id = entity.dataset.spawnId;
      if (state.found.has(id)) return;
      const p = new THREE.Vector3();
      entity.object3D.getWorldPosition(p);
      if (camPos.distanceTo(p) < XR_AUTO_CATCH_RADIUS_M) {
        const spawn = state.spawns.find((s) => s.id === id);
        if (spawn) tryCatch(spawn, entity);
      }
    });
  }
});

/* ---- camera passthrough for magic-window mode ---- */
async function startPassthrough() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    els.video.srcObject = stream;
    els.video.classList.remove('hidden');
  } catch (e) {
    els.status.textContent = 'Camera blocked — enable camera access and reload.';
  }
}

/* ---- start ---- */
async function start() {
  els.start.disabled = true;
  els.start.textContent = 'Starting…';
  try {
    await loadData();
  } catch (e) {
    alert('Could not load game data: ' + e.message);
    els.start.disabled = false;
    els.start.textContent = 'Start hunting';
    return;
  }

  if (!state.characters.length) {
    toast('No characters yet — add some in the admin panel.');
  }

  els.gate.classList.add('hidden');
  els.hud.classList.remove('hidden');
  els.scene.classList.remove('hidden');
  els.cam.setAttribute('proximity-catcher', '');

  const scene = els.scene;
  const begin = () => {
    generateSpawns();
    renderSpawns();
  };

  if (xrSupported) {
    state.xr = true;
    try {
      await scene.enterAR();
      els.reticle.classList.remove('hidden');
      scene.addEventListener('exit-vr', () => els.reticle.classList.add('hidden'));
      begin();
      return;
    } catch (e) {
      state.xr = false; // user declined or failed — fall through to magic window
    }
  }

  // Magic-window fallback
  state.xr = false;
  await startPassthrough();
  els.reticle.classList.remove('hidden');
  begin();
}

els.start.addEventListener('click', start);
els.regen.addEventListener('click', () => {
  generateSpawns();
  renderSpawns();
  toast('Spheres reshuffled');
});