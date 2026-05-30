// Local dev preview server. The app itself is fully static and self-contained
// (characters + config live in the browser via IndexedDB), so in production it
// is served straight from GitHub Pages — no backend required. This just serves
// public/ locally so you can try it on http://localhost:3000.
import express from 'express';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = express();
app.use(express.static(publicDir));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`ari-game-v1 (dev) on http://localhost:${port}`);
  console.log(`  game:  http://localhost:${port}/`);
  console.log(`  admin: http://localhost:${port}/admin.html`);
});
