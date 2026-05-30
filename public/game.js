/* AR Character Hunt — game logic.
 *
 * Pipeline:
 *   1. fetch sphere/spawn config + the Drive-mirrored character roster
 *   2. get the player's GPS fix
 *   3. scatter N spawn points around them, each 10-20 ft apart
 *   4. assign a weighted-random character to each point
 *   5. render a translucent sphere with the character billboard inside,
 *      anchored to real-world GPS coords via AR.js
 *   6. tap a nearby sphere to "catch" the character
 */

const FEET_PER_METER = 3.28084;
const EARTH_M_PER_DEG_LAT = 111320;

const els = {
  gate: document.getElementById('gate'),
  start: document.getElementById('start'),
  hud: document.getElementById('hud'),
  scene: document.getElementById('scene'),
  status: document.getElementById('status'),
  count: document.getElementById('count'),
  total: document.getElementById('total'),
  regen: document.getElementById('regen'),
  toast: document.getElementById('toast')
};

const state = {
  config: null,
  characters: [],
  origin: null, // {lat, lon}
  spawns: [],
  found: new Set()
};

async function loadData() {
  const [cfg, chars] = await Promise.all([
    fetch('/api/config').then((r) => r.json()).catch(() => null),
    fetch('/api/characters').then((r) => r.json()).catch(() => null)
  ]);
  state.config = cfg || fallbackConfig();
  state.characters = (chars && chars.characters) || [];
  els.total.textContent = state.config.spawn.count;
}

function fallbackConfig() {
  return {
    spawn: { minSpacingFeet: 10, maxSpacingFeet: 20, count: 30, spreadRadiusFeet: 180 },
    defaultSphere: { radius: 1.1, color: '#44aaff', opacity: 0.35, characterScale: 1.4, bobble: true },
    characters: {}
  };
}

/* ---- weighted character picker ---- */
function pickCharacter() {
  const list = state.characters;
  if (!list.length) return null;
  const weights = list.map((c) => {
    const cfg = state.config.characters?.[c.id];
    const f = cfg && typeof cfg.frequency === 'number' ? cfg.frequency : 1;
    return Math.max(0, f);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return list[Math.floor(Math.random() * list.length)];
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/* ---- merged sphere style for a character ---- */
function sphereStyle(charId) {
  const base = state.config.defaultSphere || {};
  const override = state.config.characters?.[charId]?.sphere || {};
  return { ...base, ...override };
}

/* ---- spawn-point generation with 10-20 ft spacing ---- */
function feetToLat(ft) {
  return ft / FEET_PER_METER / EARTH_M_PER_DEG_LAT;
}
function feetToLon(ft, lat) {
  return ft / FEET_PER_METER / (EARTH_M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
}
function distFeet(a, b) {
  const dLat = (a.lat - b.lat) * EARTH_M_PER_DEG_LAT;
  const dLon =
    (a.lon - b.lon) * EARTH_M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon) * FEET_PER_METER;
}

function generateSpawns() {
  const { count, minSpacingFeet, maxSpacingFeet, spreadRadiusFeet } = state.config.spawn;
  const minSpacing = minSpacingFeet ?? 10;
  const maxSpacing = maxSpacingFeet ?? 20;
  const radius = spreadRadiusFeet ?? Math.max(80, count * (minSpacing + maxSpacing) / 2);
  const origin = state.origin;
  const points = [];
  let attempts = 0;

  while (points.length < count && attempts < count * 60) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * radius; // uniform over disc
    const dxFt = Math.cos(angle) * dist;
    const dyFt = Math.sin(angle) * dist;
    const cand = {
      lat: origin.lat + feetToLat(dyFt),
      lon: origin.lon + feetToLon(dxFt, origin.lat)
    };
    // enforce min spacing; bias toward also being within max spacing of a neighbour
    let tooClose = false;
    for (const p of points) {
      if (distFeet(cand, p) < minSpacing) { tooClose = true; break; }
    }
    if (tooClose) continue;
    points.push(cand);
  }

  state.spawns = points.map((p, i) => ({
    id: `spawn-${i}`,
    lat: p.lat,
    lon: p.lon,
    character: pickCharacter()
  }));
}

/* ---- render spheres into the AR scene ---- */
function clearSpawns() {
  state.scene && document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
}

function renderSpawns() {
  document.querySelectorAll('.spawn-entity').forEach((e) => e.remove());
  state.found.clear();
  updateScore();

  const scene = els.scene;
  for (const s of state.spawns) {
    if (!s.character) continue;
    const style = sphereStyle(s.character.id);

    const wrap = document.createElement('a-entity');
    wrap.classList.add('spawn-entity');
    wrap.setAttribute('gps-new-entity-place', `latitude: ${s.lat}; longitude: ${s.lon}`);
    wrap.dataset.spawnId = s.id;
    wrap.dataset.charName = s.character.name;

    const sphere = document.createElement('a-sphere');
    sphere.setAttribute('radius', style.radius ?? 1.1);
    sphere.setAttribute('color', style.color ?? '#44aaff');
    sphere.setAttribute('opacity', style.opacity ?? 0.35);
    sphere.setAttribute('transparent', 'true');
    sphere.setAttribute('metalness', style.metalness ?? 0.1);
    sphere.setAttribute('roughness', style.roughness ?? 0.4);
    sphere.setAttribute('wireframe', String(!!style.wireframe));
    sphere.setAttribute('side', 'double');
    if (style.bobble) {
      sphere.setAttribute(
        'animation',
        'property: position; dir: alternate; dur: 2200; easing: easeInOutSine; loop: true; to: 0 0.4 0'
      );
    }
    wrap.appendChild(sphere);

    const img = document.createElement('a-image');
    const scale = (style.radius ?? 1.1) * (style.characterScale ?? 1.4);
    img.setAttribute('src', '/' + s.character.image.replace(/^\//, ''));
    img.setAttribute('width', scale);
    img.setAttribute('height', scale);
    img.setAttribute('transparent', 'true');
    img.setAttribute('look-at', '[gps-new-camera]');
    img.setAttribute('position', '0 0 0');
    wrap.appendChild(img);

    wrap.addEventListener('click', () => tryCatch(s, wrap));
    scene.appendChild(wrap);
  }
  els.status.textContent = `${state.spawns.length} spheres nearby`;
}

/* ---- catching ---- */
function tryCatch(spawn, entity) {
  if (state.found.has(spawn.id)) return;
  state.found.add(spawn.id);
  entity.querySelector('a-sphere')?.setAttribute(
    'animation__catch',
    'property: scale; to: 0.01 0.01 0.01; dur: 350; easing: easeInBack'
  );
  setTimeout(() => entity.remove(), 360);
  toast(`Caught ${spawn.character.name}! ✨`);
  updateScore();
}

function updateScore() {
  els.count.textContent = state.found.size;
}

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1800);
}

/* ---- geolocation + lifecycle ---- */
function onGpsUpdate(e) {
  const pos = e.detail.position;
  if (!state.origin) {
    state.origin = { lat: pos.latitude, lon: pos.longitude };
    generateSpawns();
    renderSpawns();
    return;
  }
  // Re-seed if the player wanders far from where spheres were generated.
  const moved = distFeet(state.origin, { lat: pos.latitude, lon: pos.longitude });
  const threshold = state.config.spawn.regenerateOnMoveFeet;
  if (threshold && moved > threshold) {
    state.origin = { lat: pos.latitude, lon: pos.longitude };
    generateSpawns();
    renderSpawns();
  }
}

async function start() {
  els.start.disabled = true;
  els.start.textContent = 'Starting…';
  try {
    await loadData();
  } catch (err) {
    alert('Could not load game data: ' + err.message);
    els.start.disabled = false;
    els.start.textContent = 'Start hunting';
    return;
  }

  if (!state.characters.length) {
    toast('No characters yet — add some via Drive sync or seed.');
  }

  els.gate.classList.add('hidden');
  els.hud.classList.remove('hidden');
  els.scene.classList.remove('hidden');

  const cam = document.querySelector('[gps-new-camera]');
  cam.addEventListener('gps-camera-update-position', onGpsUpdate);

  // Fallback: if no GPS event fires in 8s, try the raw geolocation API once.
  setTimeout(() => {
    if (!state.origin && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => onGpsUpdate({ detail: { position: p.coords } }),
        () => (els.status.textContent = 'Location unavailable — enable GPS & reload.'),
        { enableHighAccuracy: true }
      );
    }
  }, 8000);
}

els.start.addEventListener('click', start);
els.regen.addEventListener('click', () => {
  if (!state.origin) return;
  generateSpawns();
  renderSpawns();
  toast('Spheres reshuffled');
});
