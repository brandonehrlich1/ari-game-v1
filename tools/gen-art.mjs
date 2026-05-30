/* At-scale character-art generator (provider-agnostic).
 *
 * Reads data/arimon-bible.json, builds a style-locked prompt per "todo" card
 * (see tools/STYLE_PROMPT.md), calls an image model, and writes transparent
 * character art to tools/art-raw/<id>.png. Then run tools/compose-cards.mjs to
 * drop each into the AriMon frame and publish to public/assets/cards/.
 *
 * It does NOT run inside this repo's CI by default — image generation needs your
 * API key and incurs cost. Run locally or wire into a manual workflow.
 *
 * Env:
 *   ART_PROVIDER   openai | google         (default: openai)
 *   OPENAI_API_KEY (for openai, model gpt-image-1)
 *   GEMINI_API_KEY (for google, Imagen via the Generative Language API)
 *   ART_ONLY       comma list of slot ids to (re)generate, e.g. 019,031,032
 *   ART_LIMIT      max number to generate this run (default: all todo)
 *   ART_FORCE      "1" to overwrite existing art-raw files
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bible = JSON.parse(readFileSync(join(root, 'data', 'arimon-bible.json'), 'utf8'));
const stylePath = join(root, 'tools', 'STYLE_PROMPT.md');
const outDir = join(root, 'tools', 'art-raw');
mkdirSync(outDir, { recursive: true });

const PROVIDER = (process.env.ART_PROVIDER || 'openai').toLowerCase();
const only = (process.env.ART_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const limit = process.env.ART_LIMIT ? parseInt(process.env.ART_LIMIT, 10) : Infinity;
const force = process.env.ART_FORCE === '1';

// extract the "Base style" block from the markdown contract
const styleMd = readFileSync(stylePath, 'utf8');
const baseStyle = (styleMd.match(/## Base style[^]*?>\s*([^]*?)\n\n/)?.[1] || '')
  .split('\n').map((l) => l.replace(/^>\s?/, '').trim()).join(' ').trim();

function promptFor(c) {
  const evo = c.evoFrom ? `evolves from ${c.evoFrom}` : 'a basic-stage creature';
  return `${baseStyle} ${c.name} — a ${c.type}-type ${c.species} AriMon, ${evo}. ${c.stage}.`;
}

async function genOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1024', background: 'transparent', n: 1 })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, 'base64');
}

async function genGoogle(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } })
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.predictions[0].bytesBase64Encoded, 'base64');
}

const gen = PROVIDER === 'google' ? genGoogle : genOpenAI;

async function main() {
  let todo = bible.cards.filter((c) => c.status === 'todo');
  if (only.length) todo = todo.filter((c) => only.includes(c.id));
  let made = 0;
  for (const c of todo) {
    if (made >= limit) break;
    const out = join(outDir, `${c.id}.png`);
    if (existsSync(out) && !force) { console.log(`skip ${c.id} (exists)`); continue; }
    const prompt = promptFor(c);
    process.stdout.write(`gen ${c.id} ${c.name} … `);
    try {
      const png = await gen(prompt);
      writeFileSync(out, png);
      console.log('ok');
      made++;
    } catch (e) {
      console.log('FAIL — ' + e.message);
    }
  }
  const have = readdirSync(outDir).filter((f) => f.endsWith('.png')).length;
  console.log(`\nGenerated ${made} this run · ${have} raw art files total · provider=${PROVIDER}`);
  console.log('Next: node tools/compose-cards.mjs');
}

main().catch((e) => { console.error(e); process.exit(1); });
