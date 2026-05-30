/* Client-side persistence — no backend required.
 *
 * Characters you upload (their image blobs) and your tuning config live in the
 * browser via IndexedDB, so the app is fully self-contained and deployable as a
 * static site. Until you upload your own cast, it falls back to the bundled
 * seed roster + default config shipped with the site.
 *
 * Note: storage is per-device/per-browser. Upload your 151-200 characters on
 * the same device you'll play on, or use Export/Import in the admin panel to
 * move a pack between devices.
 */
const DB_NAME = 'ar-character-hunt';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(name, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const store = tx.objectStore(name);
    let result;
    Promise.resolve(fn(store))
      .then((r) => (result = r))
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function slugify(name) {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'character'
  );
}

function titleize(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ---------- characters ---------- */

export async function getStoredCharacters() {
  return withStore('characters', 'readonly', (s) => reqAsPromise(s.getAll()));
}

export async function countStoredCharacters() {
  return withStore('characters', 'readonly', (s) => reqAsPromise(s.count()));
}

export async function addCharacterFromFile(file) {
  const baseId = slugify(file.name);
  const existing = new Set((await getStoredCharacters()).map((c) => c.id));
  let id = baseId;
  let n = 2;
  while (existing.has(id)) id = `${baseId}-${n++}`;
  const record = {
    id,
    name: titleize(file.name),
    type: file.type || 'image/png',
    blob: file,
    addedAt: Date.now()
  };
  await withStore('characters', 'readwrite', (s) => s.put(record));
  return record;
}

export async function renameCharacter(id, name) {
  await withStore('characters', 'readwrite', async (s) => {
    const rec = await reqAsPromise(s.get(id));
    if (rec) {
      rec.name = name;
      s.put(rec);
    }
  });
}

export async function deleteCharacter(id) {
  await withStore('characters', 'readwrite', (s) => s.delete(id));
}

export async function clearCharacters() {
  await withStore('characters', 'readwrite', (s) => s.clear());
}

/* ---------- config ---------- */

export async function getStoredConfig() {
  return withStore('meta', 'readonly', (s) => reqAsPromise(s.get('config')));
}

export async function saveConfig(config) {
  await withStore('meta', 'readwrite', (s) => s.put(config, 'config'));
}

/* ---------- resolved views used by the game / admin ---------- */

// Returns { characters: [{id, name, src, fromStore}], source }.
// Uploaded characters take precedence; otherwise the bundled seed roster.
export async function resolveCharacters() {
  const stored = await getStoredCharacters();
  if (stored.length) {
    return {
      source: 'uploads',
      characters: stored
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, name: c.name, src: URL.createObjectURL(c.blob), fromStore: true }))
    };
  }
  const seed = await fetch('seed-characters.json').then((r) => r.json());
  return {
    source: 'seed',
    characters: seed.characters.map((c) => ({ id: c.id, name: c.name, src: c.image, fromStore: false }))
  };
}

export async function resolveConfig() {
  const stored = await getStoredConfig();
  if (stored) return stored;
  return fetch('default-config.json').then((r) => r.json());
}

/* ---------- export / import (move a pack between devices) ---------- */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportPack() {
  const [characters, config] = [await getStoredCharacters(), await getStoredConfig()];
  const out = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config: config || null,
    characters: await Promise.all(
      characters.map(async (c) => ({ id: c.id, name: c.name, type: c.type, data: await blobToDataUrl(c.blob) }))
    )
  };
  return out;
}

export async function importPack(pack) {
  if (!pack || !Array.isArray(pack.characters)) throw new Error('Invalid pack file');
  for (const c of pack.characters) {
    const blob = await dataUrlToBlob(c.data);
    await withStore('characters', 'readwrite', (s) =>
      s.put({ id: c.id, name: c.name, type: c.type, blob, addedAt: Date.now() })
    );
  }
  if (pack.config) await saveConfig(pack.config);
}
