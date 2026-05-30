/* AriMon card compositor.
 *
 * renderCard(entry, { artPath }) -> PNG Buffer
 *
 * `entry` is one record from data/arimon-bible.json. If `artPath` is given, that
 * character image is composited into the art window; otherwise a labeled
 * "art slot" placeholder is drawn. The frame, typography and all text are code,
 * so every one of the 151 cards is pixel-consistent.
 */
import sharp from 'sharp';

export const TYPE = {
  Grass:    { pip: '#6fbf5e', tint: '#eef6e6', accent: '#3f7a32' },
  Fire:     { pip: '#e8553b', tint: '#fbe9e2', accent: '#b33a25' },
  Water:    { pip: '#4aa3e0', tint: '#e6f1fb', accent: '#2f6fa8' },
  Electric: { pip: '#f2c531', tint: '#fbf6df', accent: '#b8901a' },
  Psychic:  { pip: '#a25fd0', tint: '#f1e8fa', accent: '#7038a0' },
  Fighting: { pip: '#c97a3a', tint: '#f3ebe1', accent: '#8f4f1d' },
  Colorless:{ pip: '#d8d8d8', tint: '#f4f1e6', accent: '#9a8f6a' }
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pip = (x, y, c) => `<circle cx="${x}" cy="${y}" r="11" fill="${(TYPE[c] || TYPE.Colorless).pip}" stroke="#555" stroke-width="1.5"/>`;
const pips = (x, y, arr) => (arr || []).map((c, i) => pip(x + i * 24, y, c)).join('');

function frameSvg(e, hasArt) {
  const t = TYPE[e.type] || TYPE.Colorless;
  const attacks = (e.attacks || []).slice(0, 2).map((a, i) => {
    const y = 432 + i * 64;
    const nameX = 56 + (a.cost?.length || 0) * 24 + 6;
    return `${pips(56, y, a.cost)}
      <text x="${nameX}" y="${y + 6}" font-family="DejaVu Sans" font-weight="800" font-size="19" fill="#1d1d1d">${esc(a.name)}</text>
      <text x="476" y="${y + 6}" text-anchor="end" font-family="DejaVu Sans" font-weight="800" font-size="22" fill="#1d1d1d">${esc(a.dmg)}</text>
      ${a.text ? `<text x="${nameX}" y="${y + 24}" font-family="DejaVu Sans" font-size="11.5" fill="#444">${esc(a.text)}</text>` : ''}`;
  }).join('');
  // Finished-looking placeholder: a cute type-tinted chibi mascot (swaps to real art).
  const artPlaceholder = hasArt ? '' : `
    <g opacity="0.96">
      <ellipse cx="260" cy="300" rx="84" ry="20" fill="#000" opacity="0.10"/>
      <path d="M212 150 q-14 -34 8 -40 q20 -4 24 28 z" fill="${t.pip}" stroke="${t.accent}" stroke-width="3"/>
      <path d="M308 150 q14 -34 -8 -40 q-20 -4 -24 28 z" fill="${t.pip}" stroke="${t.accent}" stroke-width="3"/>
      <ellipse cx="260" cy="218" rx="78" ry="70" fill="${t.pip}" stroke="${t.accent}" stroke-width="3"/>
      <ellipse cx="260" cy="238" rx="46" ry="40" fill="#ffffff" opacity="0.45"/>
      <circle cx="236" cy="206" r="15" fill="#fff"/><circle cx="284" cy="206" r="15" fill="#fff"/>
      <circle cx="238" cy="208" r="6.5" fill="#23202a"/><circle cx="286" cy="208" r="6.5" fill="#23202a"/>
      <circle cx="226" cy="230" r="8" fill="#ff9ab0" opacity="0.7"/><circle cx="294" cy="230" r="8" fill="#ff9ab0" opacity="0.7"/>
      <path d="M248 230 q12 12 24 0" fill="none" stroke="#23202a" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="236" cy="286" rx="15" ry="9" fill="${t.accent}"/><ellipse cx="284" cy="286" rx="15" ry="9" fill="${t.accent}"/>
    </g>
    <text x="260" y="352" text-anchor="middle" font-family="DejaVu Sans" font-size="11" font-weight="700" fill="${t.accent}" opacity="0.65">AriMon · art coming soon</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="728" viewBox="0 0 520 728">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9dd4b"/><stop offset="0.5" stop-color="#efc02f"/><stop offset="1" stop-color="#d79b1c"/></linearGradient>
    <radialGradient id="art" cx="0.5" cy="0.42" r="0.75"><stop offset="0" stop-color="${t.tint}"/><stop offset="1" stop-color="${t.pip}" stop-opacity="0.55"/></radialGradient>
    <linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e7b6"/><stop offset="1" stop-color="#e8d79a"/></linearGradient>
    <filter id="sh"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.3"/></filter>
  </defs>
  <rect width="520" height="728" rx="26" fill="url(#b)"/>
  <rect x="18" y="56" width="484" height="654" rx="10" fill="${t.tint}" stroke="#b98e22" stroke-width="2"/>
  <text x="32" y="40" font-family="DejaVu Sans" font-weight="800" font-size="22" fill="#2b3a8c">Ari<tspan fill="#e23b2e">M</tspan>on</text>
  <text x="140" y="26" font-family="DejaVu Sans" font-size="10" fill="#6b5a17">${esc(e.stage)}</text>
  <text x="140" y="48" font-family="DejaVu Sans" font-weight="800" font-size="25" fill="#1d1d1d">${esc(e.name)}</text>
  <text x="462" y="40" text-anchor="end" font-family="DejaVu Sans" font-weight="800" font-size="22" fill="#1d1d1d">${e.hp} HP</text>
  <circle cx="490" cy="33" r="13" fill="${t.pip}" stroke="${t.accent}" stroke-width="2"/>
  <rect x="40" y="72" width="440" height="298" rx="6" fill="url(#art)" stroke="#caa53a" stroke-width="6" filter="url(#sh)"/>
  ${artPlaceholder}
  <rect x="40" y="380" width="440" height="22" rx="4" fill="#efe3a8"/>
  <text x="50" y="396" font-family="DejaVu Serif" font-style="italic" font-size="12.5" fill="#5a4d18">${esc(e.species)} AriMon.  Length ${esc(e.len)},  Weight ${esc(e.wt)}.</text>
  ${attacks}
  <line x1="40" y1="566" x2="480" y2="566" stroke="#cbb46a" stroke-width="1.5"/>
  <text x="78" y="586" text-anchor="middle" font-family="DejaVu Sans" font-size="11" fill="#6b5a17">weakness</text>
  <text x="250" y="586" text-anchor="middle" font-family="DejaVu Sans" font-size="11" fill="#6b5a17">resistance</text>
  <text x="430" y="586" text-anchor="middle" font-family="DejaVu Sans" font-size="11" fill="#6b5a17">retreat</text>
  ${e.weakness ? `<circle cx="64" cy="610" r="11" fill="${(TYPE[e.weakness] || TYPE.Colorless).pip}" stroke="#555" stroke-width="1.5"/><text x="80" y="615" font-family="DejaVu Sans" font-weight="800" font-size="13">x2</text>` : ''}
  <text x="250" y="615" text-anchor="middle" font-family="DejaVu Sans" font-size="13" fill="#999">${e.resistance ? '-30' : '—'}</text>
  ${pips(404, 610, e.retreat)}
  <rect x="40" y="628" width="440" height="50" rx="6" fill="url(#fl)" stroke="#c7a93a" stroke-width="1.5"/>
  <text x="54" y="650" font-family="DejaVu Serif" font-style="italic" font-size="12.5" fill="#5a4d18">${esc(e.flavor?.[0])}</text>
  <text x="54" y="668" font-family="DejaVu Serif" font-style="italic" font-size="12.5" fill="#5a4d18">${esc(e.flavor?.[1] || '')}</text>
  <text x="40" y="700" font-family="DejaVu Sans" font-size="9.5" fill="#6b5a17">Illus. Ari Studios   ·   © 1999 Ari Studios / AriMon GameFreak</text>
  <text x="476" y="702" text-anchor="end" font-family="DejaVu Sans" font-weight="800" font-size="13" fill="#1d1d1d">${esc(e.number)}</text>
  </svg>`;
}

export async function renderCard(entry, { artPath } = {}) {
  const base = sharp(Buffer.from(frameSvg(entry, !!artPath)));
  if (artPath) {
    // fit the character art inside the art window (x40..480, y72..370)
    const art = await sharp(artPath).resize(420, 286, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const meta = await sharp(art).metadata();
    const left = 40 + Math.round((440 - meta.width) / 2);
    const top = 72 + Math.round((298 - meta.height) / 2);
    return base.composite([{ input: art, left, top }]).png().toBuffer();
  }
  return base.png().toBuffer();
}
