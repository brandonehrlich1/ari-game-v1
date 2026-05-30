/* Compose finished AriMon cards from the bible + generated character art.
 *
 * For every bible card that has raw art at tools/art-raw/<id>.png, renders the
 * locked frame with the card's text and writes the finished card to
 * public/assets/cards/<id>_<Name>Ari.png — which the deploy workflow then
 * auto-registers via `npm run build:cards`.
 *
 * Live cards (already drawn full cards) are skipped. Pass PREVIEW=1 to instead
 * render placeholder (art-less) cards for a range to /tmp for review.
 *
 *   node tools/compose-cards.mjs                 # compose all that have art
 *   PREVIEW=031-039 node tools/compose-cards.mjs # preview frames only
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { renderCard } from './render-card.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bible = JSON.parse(readFileSync(join(root, 'data', 'arimon-bible.json'), 'utf8'));
const artDir = join(root, 'tools', 'art-raw');
const cardsDir = join(root, 'public', 'assets', 'cards');

async function preview(range) {
  const [a, b] = range.split('-').map(Number);
  const ids = bible.cards.filter((c) => +c.id >= a && +c.id <= (b || a));
  const bufs = [];
  for (const c of ids) bufs.push(await renderCard(c));
  const cols = 3, w = 520, h = 728, gap = 16;
  const rows = Math.ceil(bufs.length / cols);
  const sheet = sharp({ create: { width: cols * w + gap * (cols + 1), height: rows * h + gap * (rows + 1), channels: 4, background: '#0c1020' } });
  const comp = bufs.map((input, i) => ({ input, left: gap + (i % cols) * (w + gap), top: gap + Math.floor(i / cols) * (h + gap) }));
  const outPath = `/tmp/arimon-proposal/preview-${range}.png`;
  mkdirSync('/tmp/arimon-proposal', { recursive: true });
  await sheet.composite(comp).png().toFile(outPath);
  console.log('wrote', outPath);
}

async function composeAll() {
  mkdirSync(cardsDir, { recursive: true });
  let n = 0;
  for (const c of bible.cards) {
    if (c.status === 'live') continue;
    const art = join(artDir, `${c.id}.png`);
    if (!existsSync(art)) continue;
    const png = await renderCard(c, { artPath: art });
    const file = `${c.id}_${c.name}.png`;
    writeFileSync(join(cardsDir, file), png);
    console.log('composed', file);
    n++;
  }
  console.log(`\nComposed ${n} cards into public/assets/cards/. Run \`npm run build:cards\` (or just push — CI does it).`);
}

if (process.env.PREVIEW) await preview(process.env.PREVIEW);
else await composeAll();
