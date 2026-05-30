// Tiny Express backend:
//   - serves the AR game (public/) over HTTPS-friendly static hosting
//   - GET  /api/characters  -> the Drive-mirrored roster (data/characters.json)
//   - GET  /api/config      -> sphere + spawn settings (data/config.json)
//   - PUT  /api/config      -> admin panel saves settings here
//   - POST /api/sync        -> triggers a Drive re-sync (if configured)
import express from 'express';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'data');
const publicDir = join(root, 'public');
const configPath = join(dataDir, 'config.json');
const charactersPath = join(dataDir, 'characters.json');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Basic admin guard: set ADMIN_TOKEN to require a token on writes.
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return next(); // open in dev if unset
  const provided = req.get('x-admin-token') || req.query.token;
  if (provided === token) return next();
  res.status(401).json({ error: 'unauthorized' });
}

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, 'utf8'));
}

app.get('/api/characters', async (_req, res) => {
  const data = await readJson(charactersPath, { characters: [], count: 0, source: 'none' });
  res.json(data);
});

app.get('/api/config', async (_req, res) => {
  const data = await readJson(configPath, {});
  res.json(data);
});

app.put('/api/config', requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !body.spawn || !body.defaultSphere) {
    return res.status(400).json({ error: 'config must include spawn and defaultSphere' });
  }
  await writeFile(configPath, JSON.stringify(body, null, 2) + '\n');
  res.json({ ok: true });
});

app.post('/api/sync', requireAdmin, (_req, res) => {
  if (!process.env.DRIVE_FOLDER_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return res.status(400).json({ error: 'Drive sync not configured (set DRIVE_FOLDER_ID and GOOGLE_SERVICE_ACCOUNT_JSON).' });
  }
  const child = spawn('node', [join(root, 'scripts', 'sync-drive.js')], { cwd: root });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  child.on('close', (code) => {
    res.status(code === 0 ? 200 : 500).json({ ok: code === 0, code, log });
  });
});

app.use(express.static(publicDir));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`ari-game-v1 running on http://localhost:${port}`);
  console.log(`  game:  http://localhost:${port}/`);
  console.log(`  admin: http://localhost:${port}/admin.html`);
});
