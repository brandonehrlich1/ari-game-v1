/* Admin panel: edit spawn behavior, default sphere style, and per-character
 * frequency + sphere overrides. Saves to PUT /api/config. */

const SPHERE_FIELDS = [
  { key: 'radius', label: 'Radius (m)', type: 'number', step: 0.1, min: 0.2, max: 5 },
  { key: 'color', label: 'Color', type: 'color' },
  { key: 'opacity', label: 'Opacity', type: 'number', step: 0.05, min: 0, max: 1 },
  { key: 'metalness', label: 'Metalness', type: 'number', step: 0.05, min: 0, max: 1 },
  { key: 'roughness', label: 'Roughness', type: 'number', step: 0.05, min: 0, max: 1 },
  { key: 'characterScale', label: 'Character scale', type: 'number', step: 0.1, min: 0.2, max: 3 },
  { key: 'wireframe', label: 'Wireframe', type: 'checkbox' },
  { key: 'bobble', label: 'Float/bobble', type: 'checkbox' }
];

let config = null;
let characters = [];

const $ = (id) => document.getElementById(id);

async function load() {
  const [cfg, chars] = await Promise.all([
    fetch('/api/config').then((r) => r.json()),
    fetch('/api/characters').then((r) => r.json())
  ]);
  config = cfg;
  config.characters = config.characters || {};
  characters = chars.characters || [];
  renderSpawn();
  renderDefaultSphere();
  renderCharacters();
  $('charcount').textContent = characters.length;
}

function renderSpawn() {
  const s = config.spawn;
  $('spawn-count').value = s.count;
  $('spawn-min').value = s.minSpacingFeet;
  $('spawn-max').value = s.maxSpacingFeet;
  $('spawn-radius').value = s.spreadRadiusFeet ?? '';
  $('spawn-regen').value = s.regenerateOnMoveFeet ?? '';
}

function sphereInput(field, value, onChange) {
  const label = document.createElement('label');
  label.textContent = field.label;
  const input = document.createElement('input');
  input.type = field.type;
  if (field.step) input.step = field.step;
  if (field.min != null) input.min = field.min;
  if (field.max != null) input.max = field.max;
  if (field.type === 'checkbox') {
    input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
  } else {
    input.value = value ?? (field.type === 'color' ? '#44aaff' : '');
    input.addEventListener('input', () =>
      onChange(field.type === 'number' ? parseFloat(input.value) : input.value)
    );
  }
  label.appendChild(input);
  return label;
}

function renderDefaultSphere() {
  const container = $('default-sphere');
  container.innerHTML = '';
  for (const f of SPHERE_FIELDS) {
    container.appendChild(
      sphereInput(f, config.defaultSphere[f.key], (v) => (config.defaultSphere[f.key] = v))
    );
  }
}

function renderCharacters() {
  const list = $('characters');
  const filter = ($('filter').value || '').toLowerCase();
  list.innerHTML = '';
  for (const c of characters) {
    if (filter && !c.name.toLowerCase().includes(filter)) continue;
    config.characters[c.id] = config.characters[c.id] || {};
    const entry = config.characters[c.id];
    if (typeof entry.frequency !== 'number') entry.frequency = 1;

    const row = document.createElement('div');
    row.className = 'char';

    const img = document.createElement('img');
    img.src = '/' + c.image.replace(/^\//, '');
    img.alt = c.name;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.name;

    const freq = document.createElement('div');
    freq.className = 'freq';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = 0; range.max = 5; range.step = 0.1;
    range.value = entry.frequency;
    const val = document.createElement('span');
    val.className = 'freqval';
    val.textContent = entry.frequency.toFixed(1);
    range.addEventListener('input', () => {
      entry.frequency = parseFloat(range.value);
      val.textContent = entry.frequency.toFixed(1);
    });
    freq.append(range, val);

    const freqLabel = document.createElement('div');
    freqLabel.style.fontSize = '12px';
    freqLabel.style.color = '#9aa6c9';
    freqLabel.textContent = 'frequency';

    // Per-character sphere override
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Override sphere';
    details.appendChild(summary);
    const ov = document.createElement('div');
    ov.className = 'grid override';
    entry.sphere = entry.sphere || {};
    for (const f of SPHERE_FIELDS) {
      ov.appendChild(
        sphereInput(f, entry.sphere[f.key], (v) => {
          if (v === '' || v == null || (typeof v === 'number' && Number.isNaN(v))) {
            delete entry.sphere[f.key];
          } else {
            entry.sphere[f.key] = v;
          }
        })
      );
    }
    details.appendChild(ov);

    row.append(img, name, freqLabel, freq, details);
    list.appendChild(row);
  }
}

function collectSpawn() {
  config.spawn.count = parseInt($('spawn-count').value, 10) || 1;
  config.spawn.minSpacingFeet = parseFloat($('spawn-min').value) || 10;
  config.spawn.maxSpacingFeet = parseFloat($('spawn-max').value) || 20;
  config.spawn.spreadRadiusFeet = parseFloat($('spawn-radius').value) || undefined;
  config.spawn.regenerateOnMoveFeet = parseFloat($('spawn-regen').value) || undefined;
}

function cleanCharacters() {
  // Drop empty sphere override objects to keep config.json tidy.
  for (const id of Object.keys(config.characters)) {
    const e = config.characters[id];
    if (e.sphere && Object.keys(e.sphere).length === 0) delete e.sphere;
    if ((e.frequency === 1 || e.frequency == null) && !e.sphere) delete config.characters[id];
  }
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

async function save() {
  collectSpawn();
  cleanCharacters();
  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': $('token').value },
    body: JSON.stringify(config)
  });
  if (res.ok) toast('Saved ✓');
  else toast('Save failed: ' + (await res.json().catch(() => ({})).then?.((j) => j.error) || res.status));
}

async function sync() {
  toast('Syncing from Drive…');
  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'x-admin-token': $('token').value }
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    toast('Drive sync complete — reloading roster');
    await load();
  } else {
    toast('Sync failed: ' + (body.error || res.status));
  }
}

$('saveBtn').addEventListener('click', save);
$('syncBtn').addEventListener('click', sync);
$('filter').addEventListener('input', renderCharacters);

load().catch((e) => toast('Load failed: ' + e.message));
