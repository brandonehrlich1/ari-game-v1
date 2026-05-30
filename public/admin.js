/* Admin / setup panel — fully client-side.
 * Upload characters (stored in IndexedDB), tune per-character frequency and
 * sphere style, configure spawn behavior, and export/import a pack. */
import {
  resolveCharacters, resolveConfig, saveConfig,
  addCharacterFromFile, deleteCharacter, clearCharacters,
  countStoredCharacters, exportPack, importPack
} from './storage.js';

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
  config = await resolveConfig();
  config.characters = config.characters || {};
  const resolved = await resolveCharacters();
  characters = resolved.characters;
  renderSpawn();
  renderDefaultSphere();
  renderCharacters();
  const stored = await countStoredCharacters();
  $('charcount').textContent = characters.length;
  $('uploadStatus').textContent = stored
    ? `${stored} uploaded${stored < 151 ? ` — add ${151 - stored} more to reach 151` : stored > 200 ? ' — over the 200 target' : ' ✓ in the 151–200 range'}`
    : 'Showing the bundled seed cast. Upload images to replace it.';
}

function renderSpawn() {
  const s = config.spawn;
  $('spawn-count').value = s.count;
  $('spawn-min').value = s.minSpacingFeet;
  $('spawn-max').value = s.maxSpacingFeet;
  $('spawn-radius').value = s.spreadRadiusFeet ?? '';
}

function field(f, value, onChange) {
  const label = document.createElement('label');
  label.textContent = f.label;
  const input = document.createElement('input');
  input.type = f.type;
  if (f.step) input.step = f.step;
  if (f.min != null) input.min = f.min;
  if (f.max != null) input.max = f.max;
  if (f.type === 'checkbox') {
    input.checked = !!value;
    input.addEventListener('change', () => onChange(input.checked));
  } else {
    input.value = value ?? (f.type === 'color' ? '#44aaff' : '');
    input.addEventListener('input', () => onChange(f.type === 'number' ? parseFloat(input.value) : input.value));
  }
  label.appendChild(input);
  return label;
}

function renderDefaultSphere() {
  const c = $('default-sphere');
  c.innerHTML = '';
  for (const f of SPHERE_FIELDS) c.appendChild(field(f, config.defaultSphere[f.key], (v) => (config.defaultSphere[f.key] = v)));
}

function renderCharacters() {
  const list = $('characters');
  const filter = ($('filter').value || '').toLowerCase();
  list.innerHTML = '';
  for (const c of characters) {
    if (filter && !c.name.toLowerCase().includes(filter)) continue;
    const entry = (config.characters[c.id] = config.characters[c.id] || {});
    if (typeof entry.frequency !== 'number') entry.frequency = 1;
    entry.sphere = entry.sphere || {};

    const row = document.createElement('div');
    row.className = 'char';

    const img = document.createElement('img');
    img.src = c.src;
    img.alt = c.name;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = c.name;

    const freqWrap = document.createElement('div');
    freqWrap.className = 'freq';
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
    const freqLabel = document.createElement('span');
    freqLabel.className = 'freqlabel';
    freqLabel.textContent = 'freq';
    freqWrap.append(freqLabel, range, val);

    const tools = document.createElement('div');
    tools.className = 'tools';
    if (c.fromStore) {
      const del = document.createElement('button');
      del.className = 'icon';
      del.textContent = '✕';
      del.title = 'Remove character';
      del.addEventListener('click', async () => {
        await deleteCharacter(c.id);
        delete config.characters[c.id];
        await load();
      });
      tools.appendChild(del);
    }

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Override sphere';
    details.appendChild(summary);
    const ov = document.createElement('div');
    ov.className = 'grid override';
    for (const f of SPHERE_FIELDS) {
      ov.appendChild(field(f, entry.sphere[f.key], (v) => {
        if (v === '' || v == null || (typeof v === 'number' && Number.isNaN(v))) delete entry.sphere[f.key];
        else entry.sphere[f.key] = v;
      }));
    }
    details.appendChild(ov);

    row.append(img, name, freqWrap, tools, details);
    list.appendChild(row);
  }
}

function collect() {
  config.spawn.count = parseInt($('spawn-count').value, 10) || 1;
  config.spawn.minSpacingFeet = parseFloat($('spawn-min').value) || 10;
  config.spawn.maxSpacingFeet = parseFloat($('spawn-max').value) || 20;
  config.spawn.spreadRadiusFeet = parseFloat($('spawn-radius').value) || undefined;
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
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* events */
$('uploadInput').addEventListener('change', async (e) => {
  const files = [...e.target.files].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  $('uploadStatus').textContent = `Uploading ${files.length}…`;
  for (const f of files) await addCharacterFromFile(f);
  e.target.value = '';
  await load();
  toast(`Added ${files.length} character${files.length > 1 ? 's' : ''}`);
});

$('clearBtn').addEventListener('click', async () => {
  if (!confirm('Remove all uploaded characters from this device?')) return;
  await clearCharacters();
  config.characters = {};
  await load();
  toast('Cleared uploaded characters');
});

$('saveBtn').addEventListener('click', async () => {
  collect();
  await saveConfig(config);
  toast('Saved ✓');
});

$('exportBtn').addEventListener('click', async () => {
  collect();
  await saveConfig(config);
  const pack = await exportPack();
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ar-character-pack-${Date.now()}.json`;
  a.click();
  toast('Pack exported');
});

$('importInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const pack = JSON.parse(await file.text());
    await importPack(pack);
    e.target.value = '';
    await load();
    toast('Pack imported ✓');
  } catch (err) {
    toast('Import failed: ' + err.message);
  }
});

$('filter').addEventListener('input', renderCharacters);

load().catch((e) => toast('Load failed: ' + e.message));
