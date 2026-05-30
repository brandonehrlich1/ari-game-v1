/* AriMon Card Hunt — game logic (static / self-contained). */
import { resolveConfig } from './storage.js';

const FT_PER_M = 3.28084;
const ARI_SPHERE_ASSET = 'assets/F5BAFFD4-8565-45B8-8E75-AEC99FAD12BB.png';
const TENNIS_BALL_RADIUS_M = 0.0335;
const FALLBACK_BALL_RADIUS_M = 0.0052;
const MIN_TAP_TARGET_RADIUS_M = 0.18;
const XR_AUTO_CATCH_RADIUS_M = 0.45;
const SCREEN_TAP_RADIUS_PX = 110;
const COLLECTION_KEY = 'arimon.collection.v1';
const BINDER_PAGE_SIZE = 9;
const MAX_VISIBLE_FALLBACK_BALLS = 2;

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
  flash: document.getElementById('flash'),
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
  galleryProgress: document.getElementById('gallery-progress')
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
  huntSeeded: false,
  visibleZoneIndex: 0,
  zoneTimer: null
};
let xrSupported = false;

navigator.xr?.isSessionSupported?.('immersive-ar').then((ok) => {
  xrSupported = ok;
  els.mode.textContent = ok
    ? 'Full AR supported — walk around to find Ari Balls.'
    : 'Look-around hunt — scan the room slowly to reveal Ari Balls.';
}).catch(() => {
  els.mode.textContent = 'Look-around hunt — scan the room slowly to reveal Ari Balls.';
});

async function loadData() {
  state.config = await resolveConfig();
  await loadCards();
  state.collection = loadCollection();
  els.total.textContent = state.cards.length;
  updateCollectionCount();
}

async function ensureDataLoaded() {
  if (!state.config) await loadData();
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

function saveCollection() {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify([...state.collection]));
}
function updateCollectionCount() { els.count.textContent = state.collection.size; }
function pickCard() {
  const unseen = state.cards.filter((c) => !state.collection.has(c.id));
  const pool = unseen.length && Math.random() < 0.82 ? unseen : state.cards;
  return pool[(Math.random() * pool.length) | 0];
}
function sphereStyle() { return state.config?.defaultSphere || {}; }

function generateSpawns() {
  const sp = state.config?.spawn || {};
  const configuredCount = sp.count ?? 12;
  const count = state.xr ? configuredCount : Math.min(Math.max(configuredCount, 6), 8);
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
      pts.push({ x, z, y: toddlerHeightForIndex(pts.length), zone: pts.length });
    }
  } else {
    // Natural Hunt v2: keep 360° coverage, but do not render the whole ring.
    // The fixed coordinates act as hidden room zones; only 1-2 zones are revealed
    // at a time so the player experiences discovery instead of a camera-following carousel.
    const layout = [
      { label: 'behind-left low', angle: -160, dist: 7.6, y: 0.58 },
      { label: 'left play height', angle: -112, dist: 9.8, y: 0.78 },
      { label: 'front-left table', angle: -54, dist: 6.8, y: 1.02 },
      { label: 'front table', angle: -10, dist: 8.8, y: 1.18 },
      { label: 'front-right low', angle: 36, dist: 7.4, y: 0.64 },
      { label: 'right kid eye-line', angle: 90, dist: 10.2, y: 1.34 },
      { label: 'rear-right play height', angle: 146, dist: 8.8, y: 0.88 },
      { label: 'behind surprise', angle: 178, dist: 11.2, y: 1.58 }
    ];
    for (let i = 0; i < count; i++) {
      const l = layout[i % layout.length];
      const a = l.angle * Math.PI / 180;
      pts.push({ x: Math.sin(a) * l.dist, z: -Math.cos(a) * l.dist, y: l.y, zone: i, label: l.label });
    }
  }

  state.spawns = pts.map((p, i) => ({
    id: `spawn-${Date.now()}-${i}`,
    x: p.x,
    z: p.z,
    y: p.y ?? 0.8,
    zone: p.zone ?? i,
    label: p.label || `zone-${i}`,
    card: pickCard()
  }));
  state.huntSeeded = false;
  state.visibleZoneIndex = 0;
}

function toddlerHeightForIndex(i) {
  const heights = [0.58, 0.78, 1.02, 1.18, 0.64, 1.34, 0.88, 1.58];
  return heights[i % heights.length];
}

function clearSpawns() {
  document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
  state.found.clear();
  if (state.zoneTimer) clearInterval(state.zoneTimer);
  state.zoneTimer = null;
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
    wrap.setAttribute('visible', state.xr ? 'true' : 'false');
    wrap.dataset.spawnId = s.id;
    wrap.dataset.zone = String(s.zone);

    const glow = document.createElement('a-sphere');
    glow.setAttribute('radius', visualRadius * 1.2);
    glow.setAttribute('material', 'color: #7fd8ff; opacity: 0.022; transparent: true; depthWrite: false');
    wrap.appendChild(glow);

    const ball = document.createElement('a-image');
    ball.classList.add('ari-sphere-visual', 'catchable');
    ball.setAttribute('src', ARI_SPHERE_ASSET);
    ball.setAttribute('width', visualRadius * 2);
    ball.setAttribute('height', visualRadius * 2);
    ball.setAttribute('transparent', 'true');
    ball.setAttribute('look-at', '#cam');
    ball.setAttribute('animation', 'property: position; dir: alternate; dur: 5600; easing: easeInOutSine; loop: true; to: 0 0.002 0');
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
  if (!state.xr) beginZoneReveal();
}

function beginZoneReveal() {
  setAllFallbackSpawnsVisible(false);
  toast('Look around for Ari Balls…');
  state.zoneTimer = setInterval(revealNextZone, 1700);
  setTimeout(() => {
    state.huntSeeded = true;
    revealNextZone();
  }, 900);
}

function revealNextZone() {
  if (!state.running || state.xr || !state.spawns.length) return;
  const remaining = state.spawns.filter((s) => !state.found.has(s.id));
  if (!remaining.length) return;
  setAllFallbackSpawnsVisible(false);
  for (let offset = 0; offset < MAX_VISIBLE_FALLBACK_BALLS; offset++) {
    const spawn = remaining[(state.visibleZoneIndex + offset) % remaining.length];
    setSpawnVisible(spawn.id, true);
  }
  state.visibleZoneIndex = (state.visibleZoneIndex + 1) % remaining.length;
}

function setAllFallbackSpawnsVisible(visible) {
  document.querySelectorAll('.spawn-entity').forEach((entity) => entity.setAttribute('visible', visible ? 'true' : 'false'));
}

function setSpawnVisible(spawnId, visible) {
  const entity = document.querySelector(`.spawn-entity[data-spawn-id="${spawnId}"]`);
  if (entity) entity.setAttribute('visible', visible ? 'true' : 'false');
}

function tryCatch(spawn, entity) {
  if (state.found.has(spawn.id)) return;
  state.found.add(spawn.id);
  entity.setAttribute('animation__catch', 'property: scale; to: 0.01 0.01 0.01; dur: 280; easing: easeInBack');
  setTimeout(() => entity.remove(), 300);
  flashScreen();
  const wasNew = !state.collection.has(spawn.card.id);
  state.collection.add(spawn.card.id);
  saveCollection();
  updateCollectionCount();
  setTimeout(() => showReveal(spawn.card, wasNew), 300);
}

function flashScreen() {
  if (!els.flash) return;
  els.flash.classList.remove('hidden', 'flash-go');
  void els.flash.offsetWidth;
  els.flash.classList.add('flash-go');
  setTimeout(() => els.flash.classList.add('hidden'), 360);
}

function showReveal(card, wasNew) {
  closeGallery();
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

async function openGallery(e) {
  e?.preventDefault?.();
  e?.stopPropagation?.();
  try {
    await ensureDataLoaded();
    state.collection = loadCollection();
    renderGallery();
    els.gallery?.classList.remove('hidden');
  } catch (err) {
    toast('Binder failed to load');
    console.error(err);
  }
}
function closeGallery() { els.gallery?.classList.add('hidden'); }
function renderGallery() {
  if (!els.galleryGrid) return;
  const cardById = new Map(state.cards.map((card) => [String(card.id).padStart(3, '0'), card]));
  const available = state.cards.length;
  const caughtAvailable = state.cards.filter((c) => state.collection.has(c.id)).length;
  if (els.galleryProgress) {
    const pct = available ? Math.round((caughtAvailable / available) * 100) : 0;
    els.galleryProgress.innerHTML = `<strong>${caughtAvailable}/${available}</strong> available AriMon caught · ${pct}% complete <span>${state.totalCards}-slot master set</span>`;
  }
  els.galleryGrid.innerHTML = '';

  const availablePage = document.createElement('section');
  availablePage.className = 'binder-page binder-page-featured';
  const availableTitle = document.createElement('div');
  availableTitle.className = 'binder-page-title';
  availableTitle.textContent = `Available AriMon · ${available} loaded`;
  availablePage.appendChild(availableTitle);
  const availableGrid = document.createElement('div');
  availableGrid.className = 'binder-grid';
  [...state.cards]
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    .forEach((card) => availableGrid.appendChild(renderBinderSlot(card, String(card.id).padStart(3, '0'), true)));
  availablePage.appendChild(availableGrid);
  els.galleryGrid.appendChild(availablePage);

  for (let pageStart = 1; pageStart <= state.totalCards; pageStart += BINDER_PAGE_SIZE) {
    const pageEnd = Math.min(pageStart + BINDER_PAGE_SIZE - 1, state.totalCards);
    const hasRegisteredCard = range(pageStart, pageEnd).some((n) => cardById.has(String(n).padStart(3, '0')));
    if (!hasRegisteredCard && pageStart > 27) continue;
    const page = document.createElement('section');
    page.className = 'binder-page';

    const title = document.createElement('div');
    title.className = 'binder-page-title';
    title.textContent = `Master Set ${String(pageStart).padStart(3, '0')}–${String(pageEnd).padStart(3, '0')}`;
    page.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'binder-grid';
    for (let n = pageStart; n <= pageEnd; n++) {
      const id = String(n).padStart(3, '0');
      const card = cardById.get(id);
      grid.appendChild(renderBinderSlot(card, id, false));
    }
    page.appendChild(grid);
    els.galleryGrid.appendChild(page);
  }
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function renderBinderSlot(card, id, compact) {
  const owned = !!card && state.collection.has(card.id);
  const item = document.createElement('button');
  item.className = `gallery-item binder-slot ${compact ? 'compact' : ''} ${owned ? 'owned' : card ? 'registered locked' : 'empty locked'}`;
  item.type = 'button';
  if (owned) {
    item.innerHTML = `<img src="${card.src}" alt="${card.name}"><span>${card.number || `${id}/151`}</span><strong>${card.name}</strong>`;
    item.addEventListener('click', (evt) => { evt.preventDefault(); evt.stopPropagation(); showReveal(card, false); });
    item.addEventListener('touchend', (evt) => { evt.preventDefault(); evt.stopPropagation(); showReveal(card, false); }, { passive: false });
  } else if (card) {
    item.innerHTML = `<div class="card-back">?</div><span>${card.number || `${id}/151`}</span><strong>Uncaught</strong>`;
  } else {
    item.innerHTML = `<div class="card-back muted">?</div><span>${id}/151</span><strong>Future</strong>`;
  }
  return item;
}

function catchNearestScreenBall(clientX, clientY) {
  if (!state.running || !els.reveal.classList.contains('hidden') || !els.gallery.classList.contains('hidden')) return false;
  const camera = els.cam.getObject3D('camera');
  const canvas = els.scene.canvas;
  if (!camera || !canvas) return false;
  const rect = canvas.getBoundingClientRect();
  let best = null;
  let bestDist = Infinity;
  document.querySelectorAll('.spawn-entity').forEach((entity) => {
    if (entity.getAttribute('visible') === false || entity.getAttribute('visible') === 'false') return;
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
    // Camera may be blocked on desktop/inspector; keep the static UI usable.
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
els.regen.addEventListener('click', () => { generateSpawns(); renderSpawns(); toast('New Ari Balls hidden around the room'); });
els.revealClose?.addEventListener('click', hideReveal);
els.reveal?.addEventListener('click', (e) => { if (e.target === els.reveal) hideReveal(); });
els.galleryOpen?.addEventListener('click', openGallery);
els.galleryOpen?.addEventListener('touchend', openGallery, { passive: false });
els.galleryClose?.addEventListener('click', closeGallery);
els.galleryClose?.addEventListener('touchend', (e) => { e.preventDefault(); closeGallery(); }, { passive: false });
els.gallery?.addEventListener('click', (e) => { if (e.target === els.gallery) closeGallery(); });
installScreenTapFallback();
