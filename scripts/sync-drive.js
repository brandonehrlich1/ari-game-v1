// Mirror a Google Drive folder of character art into the repo.
//
// How it maps to the game:
//   Drive folder (DRIVE_FOLDER_ID)
//     ├── Ember.png          -> character id "ember",  name "Ember"
//     ├── Marina.jpg         -> character id "marina", name "Marina"
//     └── ...                   (151-200 of these)
//
// Each image file becomes one character. The file is downloaded into
// public/assets/characters/<driveId>.<ext> and recorded in
// data/characters.json. Re-running picks up additions/removals/renames so
// the game's roster updates as the Drive changes.
//
// Auth: a Google service account with read access to the folder.
//   GOOGLE_SERVICE_ACCOUNT_JSON  -> path to the service-account key file
//                                   (or the raw JSON in the env var itself)
//   DRIVE_FOLDER_ID              -> the shared folder's id
//
// Run on a schedule (cron / GitHub Action) and commit the result to keep the
// repo mirror in sync with Drive.
import { mkdirSync, writeFileSync, createWriteStream, readdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'public');
const charDir = join(pub, 'assets', 'characters');

const FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const KEY = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/gif']);
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/gif': 'gif' };

function fail(msg) {
  console.error(`\n[sync-drive] ${msg}\n`);
  process.exit(1);
}

function loadCredentials() {
  if (!KEY) fail('GOOGLE_SERVICE_ACCOUNT_JSON is not set (path to key file or raw JSON).');
  const raw = existsSync(KEY) ? readFileSync(KEY, 'utf8') : KEY;
  try {
    return JSON.parse(raw);
  } catch {
    fail('GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed as JSON.');
  }
}

function slugify(name) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'character';
}

function titleize(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function listFolder(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime)',
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken
    });
    files.push(...res.data.files);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function download(drive, fileId, dest) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );
  await new Promise((resolve, reject) => {
    const out = createWriteStream(dest);
    res.data.on('error', reject).pipe(out).on('finish', resolve).on('error', reject);
  });
}

async function main() {
  if (!FOLDER_ID) fail('DRIVE_FOLDER_ID is not set.');
  const credentials = loadCredentials();

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  const drive = google.drive({ version: 'v3', auth });

  console.log('[sync-drive] Listing folder…');
  const files = (await listFolder(drive, FOLDER_ID))
    .filter((f) => IMAGE_MIMES.has(f.mimeType))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!files.length) fail('No image files found in the folder.');
  console.log(`[sync-drive] Found ${files.length} character images.`);

  mkdirSync(charDir, { recursive: true });

  const characters = [];
  const keepFiles = new Set();
  const usedIds = new Set();

  for (const f of files) {
    const ext = EXT[f.mimeType] || 'png';
    const fileName = `${f.id}.${ext}`;
    keepFiles.add(fileName);
    await download(drive, f.id, join(charDir, fileName));

    let id = slugify(f.name);
    while (usedIds.has(id)) id = `${id}-${f.id.slice(0, 4)}`;
    usedIds.add(id);

    characters.push({
      id,
      name: titleize(f.name),
      image: `assets/characters/${fileName}`,
      driveId: f.id,
      modifiedTime: f.modifiedTime
    });
    console.log(`  ✓ ${f.name} -> ${id}`);
  }

  // Drop art for files that no longer exist in Drive (skip the seed SVGs).
  for (const existing of readdirSync(charDir)) {
    if (!keepFiles.has(existing) && !existing.endsWith('.svg')) {
      rmSync(join(charDir, existing));
      console.log(`  ✗ removed stale ${existing}`);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'google-drive',
    folderId: FOLDER_ID,
    count: characters.length,
    characters
  };
  writeFileSync(join(pub, 'seed-characters.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[sync-drive] Wrote public/seed-characters.json with ${characters.length} characters.`);

  if (characters.length < 151 || characters.length > 200) {
    console.warn(`[sync-drive] Note: roster is ${characters.length}; target is 151-200 characters.`);
  }
}

main().catch((err) => fail(err.stack || String(err)));
