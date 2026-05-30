#!/usr/bin/env node
/**
 * build-cards-manifest.mjs
 *
 * Regenerates public/data/cards.json from the PNG filenames in
 * public/assets/cards/ — so you never have to hand-edit game.js (or the
 * manifest) just to register a newly dropped-in card.
 *
 * Usage:
 *   node scripts/build-cards-manifest.mjs          # write the manifest
 *   node scripts/build-cards-manifest.mjs --check  # verify only, non-zero exit if stale
 *   npm run build:cards
 *
 * Filename conventions supported (both currently in the repo):
 *   001-turtwig-ari.png   ->  id 001, name "Turtwig Ari"
 *   007_SquirtAri.png     ->  id 007, name "Squirt Ari"
 *
 * For each card we derive:
 *   id      first three digits of the filename
 *   number  "###/151"
 *   name    humanized from the filename (kebab/snake/camelCase aware)
 *   src     assets/cards/<filename>   (web path relative to public/)
 *
 * Manual metadata in the existing cards.json is PRESERVED and wins over the
 * derived values, so you can curate `name`, `type`, `rarity` (or any extra
 * field) by hand and they survive re-runs. Add `"lockName": true` to a card if
 * you want to keep a hand-tuned name even when the file is renamed.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cardsDir = join(root, 'public', 'assets', 'cards');
const manifestPath = join(root, 'public', 'data', 'cards.json');

const SET_TOTAL = 151;
const SET_ID = 'arimon-151-v1';
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;

function fail(msg) {
  console.error(`\n[build-cards] ${msg}\n`);
  process.exit(1);
}

/** Turn a raw filename stem into a friendly display name. */
function humanize(stem) {
  // drop the leading id + separator: "001-turtwig-ari" -> "turtwig-ari"
  let rest = stem.replace(/^\d{3}[-_\s]*/, '');
  if (!rest) return '';
  // split on separators AND camelCase boundaries
  rest = rest
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim();
  return rest
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function loadExisting() {
  if (!existsSync(manifestPath)) return { byId: new Map(), raw: null };
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const byId = new Map((raw.cards || []).map((c) => [String(c.id).padStart(3, '0'), c]));
    return { byId, raw };
  } catch (e) {
    console.warn(`[build-cards] existing cards.json unreadable, ignoring: ${e.message}`);
    return { byId: new Map(), raw: null };
  }
}

function build() {
  if (!existsSync(cardsDir)) fail(`card folder not found: ${cardsDir}`);

  const files = readdirSync(cardsDir)
    .filter((f) => IMAGE_EXT.test(f))
    .sort();

  if (!files.length) fail('no card images found in public/assets/cards/');

  const { byId } = loadExisting();
  const seen = new Map();
  const cards = [];

  for (const file of files) {
    const m = file.match(/^(\d{3})/);
    if (!m) {
      console.warn(`[build-cards] skipping (no leading 3-digit id): ${file}`);
      continue;
    }
    const id = m[1];
    if (seen.has(id)) {
      console.warn(`[build-cards] duplicate id ${id}: "${file}" ignored (keeping "${seen.get(id)}")`);
      continue;
    }
    seen.set(id, file);

    const stem = file.replace(IMAGE_EXT, '');
    const derivedName = humanize(stem) || `AriMon ${id}`;
    const prev = byId.get(id) || {};

    // Manual name wins; derived name used otherwise (unless file changed and
    // lockName isn't set, in which case we refresh from the new filename).
    const name = prev.lockName && prev.name ? prev.name : prev.name || derivedName;

    const card = {
      id,
      number: `${id}/${SET_TOTAL}`,
      name,
      src: `assets/cards/${file}`
    };
    // carry forward curated metadata if present
    for (const key of ['type', 'rarity', 'lockName']) {
      if (prev[key] !== undefined) card[key] = prev[key];
    }
    cards.push(card);
  }

  cards.sort((a, b) => Number(a.id) - Number(b.id));
  return { setId: SET_ID, total: SET_TOTAL, cards };
}

const check = process.argv.includes('--check');
const manifest = build();
const json = JSON.stringify(manifest, null, 2) + '\n';

if (check) {
  const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '';
  if (current.trim() !== json.trim()) {
    fail('cards.json is out of date — run `npm run build:cards`.');
  }
  console.log(`[build-cards] up to date (${manifest.cards.length} cards).`);
} else {
  writeFileSync(manifestPath, json);
  console.log(`[build-cards] wrote ${manifest.cards.length} cards -> public/data/cards.json`);
  console.log('  ' + manifest.cards.map((c) => `${c.id}:${c.name}`).join('  '));
}
