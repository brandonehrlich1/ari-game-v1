// Slice the "AriMon — Complete Set" sheet into 151 individual character cards.
//
// The sheet is a grid of tiles in National-Dex order, with a title tile at the
// very start (top-left) and a logo tile at the very end (bottom-right). We crop
// each character tile, name it AriMon-style (AriBulbasaur … AriMew), write them
// to public/assets/characters/, and regenerate public/seed-characters.json.
//
// Grid geometry is tunable via env so it can be aligned to the exact image:
//   IMG     source image path           (default assets/arimon-sheet.png)
//   COLS    number of columns           (required-ish; default 14)
//   ROWS    number of rows              (default 11)
//   SKIP    comma list of linear cell indices that are NOT characters
//           (reading order, 0-based; default "0,<last>" = title + logo)
//   INSET   fraction trimmed off each tile edge to drop gutters/borders
//           (default 0.04)
//   LIMIT   stop after N characters (default 151)
//
// After slicing it also writes assets/_contact-sheet.png — a labeled montage —
// so the grid alignment can be eyeballed and SKIP/COLS/ROWS retuned if needed.
import sharp from 'sharp';
import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'public');
const charDir = join(pub, 'assets', 'characters');

const IMG = process.env.IMG || join(root, 'assets', 'arimon-sheet.png');
const COLS = parseInt(process.env.COLS || '14', 10);
const ROWS = parseInt(process.env.ROWS || '11', 10);
const INSET = parseFloat(process.env.INSET || '0.04');
const LIMIT = parseInt(process.env.LIMIT || '151', 10);

// National Dex 1-151 (gets the "Ari" prefix to match the sheet).
const DEX = `Bulbasaur Ivysaur Venusaur Charmander Charmeleon Charizard Squirtle Wartortle Blastoise Caterpie Metapod Butterfree Weedle Kakuna Beedrill Pidgey Pidgeotto Pidgeot Rattata Raticate Spearow Fearow Ekans Arbok Pikachu Raichu Sandshrew Sandslash NidoranF Nidorina Nidoqueen NidoranM Nidorino Nidoking Clefairy Clefable Vulpix Ninetales Jigglypuff Wigglytuff Zubat Golbat Oddish Gloom Vileplume Paras Parasect Venonat Venomoth Diglett Dugtrio Meowth Persian Psyduck Golduck Mankey Primeape Growlithe Arcanine Poliwag Poliwhirl Poliwrath Abra Kadabra Alakazam Machop Machoke Machamp Bellsprout Weepinbell Victreebel Tentacool Tentacruel Geodude Graveler Golem Ponyta Rapidash Slowpoke Slowbro Magnemite Magneton Farfetchd Doduo Dodrio Seel Dewgong Grimer Muk Shellder Cloyster Gastly Haunter Gengar Onix Drowzee Hypno Krabby Kingler Voltorb Electrode Exeggcute Exeggutor Cubone Marowak Hitmonlee Hitmonchan Lickitung Koffing Weezing Rhyhorn Rhydon Chansey Tangela Kangaskhan Horsea Seadra Goldeen Seaking Staryu Starmie MrMime Scyther Jynx Electabuzz Magmar Pinsir Tauros Magikarp Gyarados Lapras Ditto Eevee Vaporeon Jolteon Flareon Porygon Omanyte Omastar Kabuto Kabutops Aerodactyl Snorlax Articuno Zapdos Moltres Dratini Dragonair Dragonite Mewtwo Mew`.split(/\s+/);

function fail(m) { console.error(`\n[slice] ${m}\n`); process.exit(1); }

async function main() {
  if (!existsSync(IMG)) fail(`Source image not found at ${IMG}. Set IMG=path/to/sheet.png`);

  const total = COLS * ROWS;
  const lastIndex = total - 1;
  const skip = new Set(
    (process.env.SKIP || `0,${lastIndex}`).split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n))
  );

  const meta = await sharp(IMG).metadata();
  const W = meta.width, H = meta.height;
  const cw = W / COLS, ch = H / ROWS;
  const insetX = Math.round(cw * INSET), insetY = Math.round(ch * INSET);
  console.log(`[slice] ${IMG}  ${W}x${H}  grid ${COLS}x${ROWS}  cell ${cw.toFixed(1)}x${ch.toFixed(1)}  inset ${insetX},${insetY}`);
  console.log(`[slice] skipping cells: ${[...skip].sort((a, b) => a - b).join(', ')}`);

  // fresh character art (keep nothing stale)
  if (existsSync(charDir)) for (const f of readdirSync(charDir)) rmSync(join(charDir, f));
  mkdirSync(charDir, { recursive: true });

  const characters = [];
  let n = 0;
  for (let i = 0; i < total && characters.length < LIMIT; i++) {
    if (skip.has(i)) continue;
    const col = i % COLS, row = (i / COLS) | 0;
    const left = Math.round(col * cw) + insetX;
    const top = Math.round(row * ch) + insetY;
    const width = Math.max(1, Math.round(cw) - insetX * 2);
    const height = Math.max(1, Math.round(ch) - insetY * 2);

    const dex = DEX[n] || `Mon${n + 1}`;
    const num = String(n + 1).padStart(3, '0');
    const id = `ari${num}-${dex.toLowerCase()}`;
    const file = `${id}.png`;
    await sharp(IMG).extract({ left, top, width, height }).png().toFile(join(charDir, file));

    characters.push({ id, name: `Ari${dex}`, dex: n + 1, image: `assets/characters/${file}` });
    n++;
  }

  writeFileSync(
    join(pub, 'seed-characters.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: 'arimon-sheet', count: characters.length, characters }, null, 2) + '\n'
  );
  console.log(`[slice] wrote ${characters.length} cards + seed-characters.json`);

  // contact sheet for visual verification
  const thumb = 120;
  const perRow = COLS;
  const rowsOut = Math.ceil(characters.length / perRow);
  const composites = [];
  for (let i = 0; i < characters.length; i++) {
    const buf = await sharp(join(charDir, `${characters[i].id}.png`)).resize(thumb, thumb, { fit: 'contain', background: '#111' }).toBuffer();
    composites.push({ input: buf, left: (i % perRow) * thumb, top: ((i / perRow) | 0) * thumb });
  }
  await sharp({ create: { width: perRow * thumb, height: rowsOut * thumb, channels: 3, background: '#111' } })
    .composite(composites).png().toFile(join(root, 'assets', '_contact-sheet.png'));
  console.log('[slice] wrote assets/_contact-sheet.png for verification');
}

main().catch((e) => fail(e.stack || String(e)));
