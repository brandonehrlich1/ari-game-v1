// Generates placeholder character art + a default roster/config so the static
// site works the moment it loads, before anyone uploads their own characters.
//
// Outputs (all under public/, which is what gets published to GitHub Pages):
//   public/assets/characters/*.svg   -> placeholder art
//   public/seed-characters.json      -> default roster (relative image paths)
//   public/default-config.json       -> default spawn + sphere settings
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pub = join(root, 'public');
const charDir = join(pub, 'assets', 'characters');
mkdirSync(charDir, { recursive: true });

const seeds = [
  ['ember', 'Ember', '#ff5a3c'],
  ['marina', 'Marina', '#2eb8c4'],
  ['flint', 'Flint', '#9b6b3a'],
  ['lumen', 'Lumen', '#f4d35e'],
  ['violetta', 'Violetta', '#8a4fff'],
  ['mossy', 'Mossy', '#4caf50'],
  ['cobalt', 'Cobalt', '#2b56c4'],
  ['rosa', 'Rosa', '#ff6fa5'],
  ['ashen', 'Ashen', '#7a7f87'],
  ['solis', 'Solis', '#ff9f1c'],
  ['nyx', 'Nyx', '#3a3a5a'],
  ['coral', 'Coral', '#ff7f6b']
];

function avatarSvg(name, color) {
  const initial = name[0].toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="70%">
    <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
    <stop offset="100%" stop-color="${color}" stop-opacity="0.55"/>
  </radialGradient></defs>
  <rect width="256" height="256" rx="40" fill="url(#g)"/>
  <circle cx="128" cy="104" r="48" fill="#ffffff" fill-opacity="0.92"/>
  <rect x="64" y="160" width="128" height="72" rx="36" fill="#ffffff" fill-opacity="0.92"/>
  <text x="128" y="120" font-family="Arial, sans-serif" font-size="56" font-weight="700"
        fill="${color}" text-anchor="middle" dominant-baseline="middle">${initial}</text>
</svg>`;
}

const characters = seeds.map(([id, name, color]) => {
  writeFileSync(join(charDir, `${id}.svg`), avatarSvg(name, color));
  return { id, name, image: `assets/characters/${id}.svg`, color };
});

writeFileSync(
  join(pub, 'seed-characters.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: 'seed', count: characters.length, characters }, null, 2) + '\n'
);

const defaultConfig = {
  spawn: {
    minSpacingFeet: 10,
    maxSpacingFeet: 20,
    count: 24,
    spreadRadiusFeet: 120,
    placement: 'metric'
  },
  defaultSphere: {
    radius: 0.6,
    color: '#44aaff',
    opacity: 0.4,
    metalness: 0.1,
    roughness: 0.4,
    wireframe: false,
    characterScale: 1.5,
    bobble: true
  },
  characters: {}
};
writeFileSync(join(pub, 'default-config.json'), JSON.stringify(defaultConfig, null, 2) + '\n');

console.log(`Seeded ${characters.length} characters + default-config.json into public/`);
