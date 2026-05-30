/* AriMon Card Hunt — game logic (static / self-contained). */
import { resolveConfig } from './storage.js';

const FT_PER_M = 3.28084;
const ARI_SPHERE_ASSET = 'assets/F5BAFFD4-8565-45B8-8E75-AEC99FAD12BB.png';
const TENNIS_BALL_RADIUS_M = 0.0335;
const FALLBACK_BALL_RADIUS_M = 0.016;
const MIN_TAP_TARGET_RADIUS_M = 0.24;
const XR_AUTO_CATCH_RADIUS_M = 0.45;
const SCREEN_TAP_RADIUS_PX = 95;
const COLLECTION_KEY = 'arimon.collection.v1';

const FALLBACK_CARDS = [
  { id: '001', name: 'Turtwig Ari', number: '001/151', src: 'assets/cards/001-turtwig-ari.png' }
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
  revealClose: document.getElementById('reveal-close'),
  galleryOpen: document.getElementById('gallery-open'),
  gallery: document.getElementById('gallery'),
  galleryClose: document.getElementById('gallery-close'),
  galleryGrid: document.getElementById('gallery-grid'),
  galleryProgress: document.getElementById('gallery-progress'),
  placeToggle: document.getElementById('place-toggle'),
  placeBall: document.getElementById('place-ball'),
  resetMap: document.getElementById('reset-map')
};

const state = {
  config: null,
  cards: FALLBACK_CARDS,
  totalCards: 151,
  spawns: [],
  found: new Set(),
  collection: new Set(),
  xr: false,
  running: false,
  placeMode: false
};
let xrSupported = false;

navigator.xr?.isSessionSupported?.('immersive-ar').then((ok) => {
  xrSupported = ok;
  els.mode.textContent = ok ? 'Full AR supported — walk around to find Ari Balls.' : 'Look-around AR mode — pan to find Ari Balls.';
}).catch(() => { els.mode.textContent = 'Look-around AR mode — pan around to find Ari Balls.'; });

async function loadData() {
  state.config = await resolveConfig();
  await loadCards();
  state.collection = loadCollection();
  els.total.textContent = state.totalCards;
  updateCollectionCount();
}

async function loadCards() {
  try {
    const res = await fetch(`data/cards.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`cards.json ${res.status}`);
    const data = await res.json();
    const cards = Array.isArray(data.cards) ? data.cards.filter((c) => c.id && c.src) : [];
    if (!cards.length) throw new Error('cards.json has no cards');
    state.cards = cards;
    state.totalCards = data.total || 151;
  } catch (e) {
    console.warn('Using fallback cards:', e);
    state.cards = FALLBACK_CARDS;
    state.totalCards = 151;
  }
}

function loadCollection() {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLLECTION_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}
function saveCollection() { localStorage.setItem(COLLECTION_KEY, JSON.stringify([...state.collection])); }
function updateCollectionCount() { els.count.textContent = state.collection.size; }

function pickCard() {
  const unseen = state.cards.filter((c) => !state.collection.has(c.id));
  const pool = unseen.length && Math.random() < 0.72 ? unseen : state.cards;
  return pool[(Math.random() * pool.length) | 0];
}
function sphereStyle() { return state.config.defaultSphere || {}; }

function generateSpawns() {
  const sp = state.config.spawn || {};
  const configuredCount = sp.count ?? 12;
  const count = state.xr ? configuredCount : Math.min(configuredCount, 6);
  const pts = [];

  if (state.xr) {
    const minM = (sp.minSpacingFeet ?? 10) / FT_PER_M;
    const radiusM = (sp.spreadRadiusFeet ?? 60) / FT_PER_M;
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
  } else {
    const layout = [
      { angle: -34, dist: 4.2 },
      { angle: -18, dist: 5.6 },
      { angle: 0, dist: 4.8 },
      { angle: 18, dist: 5.6 },
      { angle: 34, dist: 4.2 },
      { angle: 52, dist: 6.2 }
    ];
    for (let i = 0; i < count; i++) {
      const l = layout[i % layout.length];
      const a = l.angle * Math.PI / 180;
      pts.push({ x: Math.sin(a) * l.dist, z: -Math.cos(a) * l.dist });
    }
  }

  state.spawns = pts.map((p, i) => ({
    id: `spawn-${Date.now()}-${i}`,
    x: p.x,
    z: p.z,
    bearing: Math.atan2(p.x, -p.z),
    y: 1.05 + (i % 3) * 0.22,
    card: pickCard()
  }));
}

function clearSpawns() {
  document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
  state.found.clear();
}

function renderSpawns() {
  clearSpawns();
  const style = sphereStyle();
  for (const s of state.spawns) {
    const visualRadius = style.radius ?? (state.xr ? TENNIS_BALL_RADIUS_M : FALLBACK_BALL_RADIUS_M);
    const hitRadius = Math.max(visualRadius, style.hitRadius ?? MIN_TAP_TARGET_RADIUS_M);
    const wrap = document.createElement('a-entity');
    wrap.classList.add('spawn-entity');
    wrap.setAttribute('position', `${s.x} ${s.y} ${s.z}`);
    wrap.dataset.spawnId = s.id;

    const ball = document.createElement('a-image');
    ball.classList.add('ari-sphere-visual', 'catchable');
    ball.setAttribute('src', ARI_SPHERE_ASSET);
    ball.setAttribute('width', visualRadius * 2);
    ball.setAttribute('height', visualRadius * 2);
    ball.setAttribute('transparent', 'true');
    ball.setAttribute('look-at', '#cam');
    ball.setAttribute('animation', 'property: position; dir: alternate; dur: 2400; easing: easeInOutSine; loop: true; to: 0 0.02 0');
    ball.addEventListener('click', (e) => { e.stopPropagation(); tryCatch(s, wrap); });
    wrap.appendChild(ball);

    const hit = document.createElement('a-sphere');
    hit.classList.add('ari-sphere-hit-target', 'catchable');
    hit.setAttribute('radius', hitRadius);
    hit.setAttribute('material', 'opacity: 0.001; transparent: true; depthWrite: false; color: #ffffff');
    hit.addEventListener('click', (e) => { e.stopPropagation(); tryCatch(s, wrap); });
    wrap.appendChild(hit);

    els.scene.appendChild(wrap);
  }
  els.status.textContent = `${state.spawns.length} Ari Balls nearby · ${state.cards.length} cards loaded`;
}

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
  if (kicker) kicker.textContent = `${wasNew ? 'New card caught' : 'Duplicate card'} · ${card.number || card.id}`;
  els.reveal.classList.remove('hidden');
  toast(`${wasNew ? 'Added' : 'Duplicate'} ${card.name}! 🎴`);
}
function hideReveal() { els.reveal.classList.add('hidden'); }
let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1800);
}

function openGallery() {
  renderGallery();
  els.gallery?.classList.remove('hidden');
}
function closeGallery() { els.gallery?.classList.add('hidden'); }
function renderGallery() {
  if (!els.galleryGrid) return;
  const collected = state.cards.filter((c) => state.collection.has(c.id)).length;
  if (els.galleryProgress) els.galleryProgress.textContent = `${collected} collected · ${state.cards.length} discovered in this set · ${state.totalCards} total`;
  els.galleryGrid.innerHTML = '';
  state.cards.forEach((card) => {
    const owned = state.collection.has(card.id);
    const item = document.createElement('button');
    item.className = `gallery-item ${owned ? 'owned' : 'locked'}`;
    item.type = 'button';
    item.innerHTML = owned
      ? `<img src="${card.src}" alt="${card.name}"><span>${card.number || card.id}</span><strong>${card.name}</strong>`
      : `<div class="card-back">?</div><span>${card.number || card.id}</span><strong>Uncaught</strong>`;
    if (owned) item.addEventListener('click', () => showReveal(card, false));
    els.galleryGrid.appendChild(item);
  });
}

function catchNearestScreenBall(clientX, clientY) {
  if (!state.running || !els.reveal.classList.contains('hidden')) return false;
  const camera = els.cam.getObject3D('camera');
  const canvas = els.scene.canvas;
  if (!camera || !canvas) return false;
  const rect = canvas.getBoundingClientRect();
  let best = null;
  let bestDist = Infinity;
  document.querySelectorAll('.spawn-entity').forEach((entity) => {
    const id = entity.dataset.spawnId;
    if (!id || state.found.has(id)) return;
    const world = new THREE.Vector3();
    entity.object3D.getWorldPosition(world);
    const projected = world.clone().project(camera);
    if (projected.z < -1 || projected.z > 1) return;
    const sx = rect.left + ((projected.x + 1) / 2) * rect.width;
    const sy = rect.top + ((-projected.y + 1) / 2) * rect.height;
    const dist = Math.hypot(clientX - sx, clientY - sy);
    if (dist < bestDist) { bestDist = dist; best = entity; }
  });
  if (!best || bestDist > SCREEN_TAP_RADIUS_PX) return false;
  const spawn = state.spawns.find((s) => s.id === best.dataset.spawnId);
  if (!spawn) return false;
  tryCatch(spawn, best);
  return true;
}

function installScreenTapFallback() {
  window.addEventListener('pointerup', (e) => {
    if (!state.running) return;
    if (e.target.closest?.('.hud, .reveal, .overlay, .panel')) return;
    if (catchNearestScreenBall(e.clientX, e.clientY)) e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    if (!state.running || !e.changedTouches?.length) return;
    const t = e.changedTouches[0];
    if (e.target.closest?.('.hud, .reveal, .overlay, .panel')) return;
    if (catchNearestScreenBall(t.clientX, t.clientY)) e.preventDefault();
  }, { passive: false });
}

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

async function startPassthrough() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    els.video.srcObject = stream;
    els.video.classList.remove('hidden');
  } catch (e) {
    els.status.textContent = 'Camera blocked — enable camera access and reload.';
  }
}

async function start() {
  els.start.disabled = true;
  els.start.textContent = 'Starting…';
  try { await loadData(); } catch (e) {
    alert('Could not load game data: ' + e.message);
    els.start.disabled = false;
    els.start.textContent = 'Start hunting';
    return;
  }
  els.gate.classList.add('hidden');
  els.hud.classList.remove('hidden');
  els.scene.classList.remove('hidden');
  els.cam.setAttribute('proximity-catcher', '');
  state.running = true;
  const begin = () => { generateSpawns(); renderSpawns(); };
  if (xrSupported) {
    state.xr = true;
    try {
      await els.scene.enterAR();
      els.reticle.classList.remove('hidden');
      els.scene.addEventListener('exit-vr', () => els.reticle.classList.add('hidden'));
      begin();
      return;
    } catch (e) { state.xr = false; }
  }
  state.xr = false;
  await startPassthrough();
  els.reticle.classList.remove('hidden');
  begin();
}

els.start.addEventListener('click', start);
els.regen.addEventListener('click', () => { generateSpawns(); renderSpawns(); toast('Ari Balls reshuffled'); });
els.revealClose?.addEventListener('click', hideReveal);
els.reveal?.addEventListener('click', (e) => { if (e.target === els.reveal) hideReveal(); });
els.galleryOpen?.addEventListener('click', openGallery);
els.galleryClose?.addEventListener('click', closeGallery);
els.gallery?.addEventListener('click', (e) => { if (e.target === els.gallery) closeGallery(); });
els.placeToggle?.addEventListener('click', () => toast('Place Mode wiring is next.'));
els.placeBall?.addEventListener('click', () => toast('Drop Ball wiring is next.'));
els.resetMap?.addEventListener('click', () => toast('Reset Map wiring is next.'));
installScreenTapFallback();
