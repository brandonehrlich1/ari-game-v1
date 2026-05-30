/* AriMon Card Hunt — game logic (static / self-contained).
 *
 * Placement is metric (meters), so it works indoors AND outdoors:
 *   - WebXR immersive-ar (Android Chrome, AR headsets): full positional
 *     tracking — Ari Balls are anchored in the room and you physically walk to
 *     them, spaced 10-20 ft apart.
 *   - Fallback "magic window" (iOS Safari etc.): live camera passthrough +
 *     gyro look-around; Ari Balls sit around you on a viewable dome so you can
 *     still find and tap them.
 */
import { resolveConfig } from './storage.js';

const FT_PER_M = 3.28084;
const ARI_SPHERE_ASSET = 'assets/F5BAFFD4-8565-45B8-8E75-AEC99FAD12BB.png';
const TENNIS_BALL_RADIUS_M = 0.0335;
const MIN_TAP_TARGET_RADIUS_M = 0.18;
const XR_AUTO_CATCH_RADIUS_M = 0.45;
const COLLECTION_KEY = 'arimon.collection.v1';

const CARDS = [
  {
    id: '001',
    name: 'Turtwig Ari',
    number: '001/151',
    src: 'assets/001-turtwig-ari.jpg'
  }
];

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
  video: document.getElementById('passthrough'),
  reveal: document.getElementById('reveal'),
  revealTitle: document.getElementById('reveal-title'),
  revealImg: document.getElementById('reveal-img'),
  revealClose: document.getElementById('reveal-close')
};

const state = {
  config: null,
  spawns: [],
  found: new Set(),
  collection: new Set(),
  xr: false
};

let xrSupported = false;
navigator.xr?.isSessionSupported?.('immersive-ar').then((ok) => {
  xrSupported = ok;
  els.mode.textContent = ok
    ? 'Full AR supported — walk around to find Ari Balls.'
    : 'Look-around AR mode (your device has no WebXR) — pan to find Ari Balls.';
}).catch(() => {
  els.mode.textContent = 'Look-around AR mode — pan around to find Ari Balls.';
});

async function loadData() {
  state.config = await resolveConfig();
  state.collection = loadCollection();
  els.total.textContent = '151';
  updateCollectionCount();
}

function loadCollection() {
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveCollection() {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify([...state.collection]));
}

function updateCollectionCount() {
  els.count.textContent = state.collection.size;
}

function pickCard() {
  return CARDS[0];
}

function sphereStyle() {
  return state.config.defaultSphere || {};
}

/* ---- generate spawn points in meters around the origin ---- */
function generateSpawns() {
  const sp = state.config.spawn || {};
  const minM = (sp.minSpacingFeet ?? 10) / FT_PER_M;
  const count = sp.count ?? 12;
  const radiusM = (sp.spreadRadiusFeet ?? 60) / FT_PER_M;
  const pts = [];
  let attempts = 0;

  while (pts.length < count && attempts < count * 80) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radiusM;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < minM)) continue;
    pts.push({ x, z });
  }

  state.spawns = pts.map((p, i) => {
    const bearing = Math.atan2(p.x, -p.z);
    return {
      id: `spawn-${Date.now()}-${i}`,
      x: p.x,
      z: p.z,
      bearing,
      y: 1.1 + Math.random() * 0.9,
      card: pickCard()
    };
  });
}

/* ---- render ---- */
function clearSpawns() {
  document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
  state.found.clear();
}

function renderSpawns() {
  clearSpawns();
  const style = sphereStyle();
  for (const s of state.spawns) {
    const visualRadius = style.radius ?? TENNIS_BALL_RADIUS_M;
    const hitRadius = Math.max(visualRadius, style.hitRadius ?? MIN_TAP_TARGET_RADIUS_M);

    let x = s.x, y = s.y, z = s.z;
    if (!state.xr) {
      const d = 2.5 + (Math.abs(hashCode(s.id)) % 5) + Math.random() * 1.5;
      x = Math.sin(s.bearing) * d;
      z = -Math.cos(s.bearing) * d;
    }

    const wrap = document.createElement('a-entity');
    wrap.classList.add('spawn-entity', 'catchable');
    wrap.setAttribute('position', `${x} ${y} ${z}`);
    wrap.dataset.spawnId = s.id;

    const ball = document.createElement('a-image');
    ball.classList.add('ari-sphere-visual');
    ball.setAttribute('src', ARI_SPHERE_ASSET);
    ball.setAttribute('width', visualRadius * 2);
    ball.setAttribute('height', visualRadius * 2);
    ball.setAttribute('transparent', 'true');
    ball.setAttribute('look-at', '#cam');
    ball.setAttribute('animation', 'property: position; dir: alternate; dur: 2200; easing: easeInOutSine; loop: true; to: 0 0.03 0');
    wrap.appendChild(ball);

    const hit = document.createElement('a-sphere');
    hit.classList.add('ari-sphere-hit-target');
    hit.setAttribute('radius', hitRadius);
    hit.setAttribute('opacity', '0');
    hit.setAttribute('transparent', 'true');
    hit.setAttribute('visible', 'false');
    wrap.appendChild(hit);

    wrap.addEventListener('click', () => tryCatch(s, wrap));
    els.scene.appendChild(wrap);
  }
  els.status.textContent = `${state.spawns.length} Ari Balls nearby`;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
  return h;
}

/* ---- catching + reveal ---- */
function tryCatch(spawn, entity) {
  if (state.found.has(spawn.id)) return;
  state.found.add(spawn.id);
  entity.setAttribute('animation__catch', 'property: scale; to: 0.01 0.01 0.01; dur: 320; easing: easeInBack');
  setTimeout(() => entity.remove(), 340);

  const wasNew = !state.collection.has(spawn.card.id);
  state.collection.add(spawn.card.id);
  saveCollection();
  updateCollectionCount();
  setTimeout(() => showReveal(spawn.card, wasNew), 360);
}

function showReveal(card, wasNew) {
  els.revealTitle.textContent = card.name;
  els.revealImg.src = card.src;
  els.revealImg.alt = `${card.name} card`;
  const kicker = els.reveal.querySelector('.reveal-kicker');
  if (kicker) kicker.textContent = `${wasNew ? 'New card caught' : 'Card caught again'} · ${card.number}`;
  els.reveal.classList.remove('hidden');
  toast(`${wasNew ? 'Added' : 'Caught'} ${card.name}! 🎴`);
}

function hideReveal() {
  els.reveal.classList.add('hidden');
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
      state.xr = false;
    }
  }

  state.xr = false;
  await startPassthrough();
  els.reticle.classList.remove('hidden');
  begin();
}

els.start.addEventListener('click', start);
els.regen.addEventListener('click', () => {
  generateSpawns();
  renderSpawns();
  toast('Ari Balls reshuffled');
});
els.revealClose?.addEventListener('click', hideReveal);
els.reveal?.addEventListener('click', (e) => {
  if (e.target === els.reveal) hideReveal();
});
