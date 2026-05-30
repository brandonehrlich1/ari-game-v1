/* Authors data/arimon-bible.json — the design source of truth for all 151.
 *
 * - Live slots (already drawn) are reconciled from public/data/cards.json:
 *   their name/number/art are preserved; we attach the design fields.
 * - Open slots are mapped to remaining Gen-1 species in National Dex order
 *   (slot 019 = Pidgeot to finish the Pidgey line; Arbok rolls to a future
 *   promo since slot 024 is already Ekans).
 * - Type/stage/HP/attacks/weakness/retreat/flavor are generated on-brand and
 *   are meant to be curated. Re-running preserves any hand-edited fields that
 *   already exist in arimon-bible.json (merge by slot id).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const biblePath = join(root, 'data', 'arimon-bible.json');
const cardsPath = join(root, 'public', 'data', 'cards.json');

const NAMES = ('Bulbasaur Ivysaur Venusaur Charmander Charmeleon Charizard Squirtle Wartortle Blastoise Caterpie ' +
'Metapod Butterfree Weedle Kakuna Beedrill Pidgey Pidgeotto Pidgeot Rattata Raticate Spearow Fearow Ekans Arbok ' +
'Pikachu Raichu Sandshrew Sandslash NidoranF Nidorina Nidoqueen NidoranM Nidorino Nidoking Clefairy Clefable Vulpix ' +
'Ninetales Jigglypuff Wigglytuff Zubat Golbat Oddish Gloom Vileplume Paras Parasect Venonat Venomoth Diglett Dugtrio ' +
'Meowth Persian Psyduck Golduck Mankey Primeape Growlithe Arcanine Poliwag Poliwhirl Poliwrath Abra Kadabra Alakazam ' +
'Machop Machoke Machamp Bellsprout Weepinbell Victreebel Tentacool Tentacruel Geodude Graveler Golem Ponyta Rapidash ' +
'Slowpoke Slowbro Magnemite Magneton Farfetchd Doduo Dodrio Seel Dewgong Grimer Muk Shellder Cloyster Gastly Haunter ' +
'Gengar Onix Drowzee Hypno Krabby Kingler Voltorb Electrode Exeggcute Exeggutor Cubone Marowak Hitmonlee Hitmonchan ' +
'Lickitung Koffing Weezing Rhyhorn Rhydon Chansey Tangela Kangaskhan Horsea Seadra Goldeen Seaking Staryu Starmie ' +
'MrMime Scyther Jynx Electabuzz Magmar Pinsir Tauros Magikarp Gyarados Lapras Ditto Eevee Vaporeon Jolteon Flareon ' +
'Porygon Omanyte Omastar Kabuto Kabutops Aerodactyl Snorlax Articuno Zapdos Moltres Dratini Dragonair Dragonite ' +
'Mewtwo Mew').split(/\s+/);

const SPECIES = { // a few flavorful "species" labels; default derived otherwise
  default: 'AriMon'
};

const typeMembers = {
  Fire: [4,5,6,37,38,58,59,77,78,126,136,146],
  Water: [7,8,9,54,55,60,61,62,72,73,79,80,86,87,90,91,98,99,116,117,118,119,120,121,129,130,131,134,138,139,140,141,144],
  Electric: [25,26,81,82,100,101,125,135,145],
  Psychic: [63,64,65,92,93,94,96,97,122,124,150,151],
  Fighting: [27,28,50,51,56,57,66,67,68,74,75,76,95,104,105,106,107,111,112],
  Grass: [1,2,3,10,11,12,13,14,15,23,24,29,30,31,32,33,34,41,42,43,44,45,46,47,48,49,69,70,71,88,89,102,103,109,110,114,123,127]
};
function typeForDex(d) {
  for (const [t, list] of Object.entries(typeMembers)) if (list.includes(d)) return t;
  return 'Colorless';
}

const FAMILIES = [
  [1,2,3],[4,5,6],[7,8,9],[10,11,12],[13,14,15],[16,17,18],[19,20],[21,22],[23,24],[25,26],[27,28],
  [29,30,31],[32,33,34],[35,36],[37,38],[39,40],[41,42],[43,44,45],[46,47],[48,49],[50,51],[52,53],
  [54,55],[56,57],[58,59],[60,61,62],[63,64,65],[66,67,68],[69,70,71],[72,73],[74,75,76],[77,78],
  [79,80],[81,82],[83],[84,85],[86,87],[88,89],[90,91],[92,93,94],[95],[96,97],[98,99],[100,101],
  [102,103],[104,105],[106],[107],[108],[109,110],[111,112],[113],[114],[115],[116,117],[118,119],
  [120,121],[122],[123],[124],[125],[126],[127],[128],[129,130],[131],[132],[133],[134],[135],[136],
  [137],[138,139],[140,141],[142],[143],[144],[145],[146],[147,148,149],[150],[151]
];
const stageInfo = new Map();
for (const fam of FAMILIES) fam.forEach((d, i) => stageInfo.set(d, { stage: ['Basic', 'Stage 1', 'Stage 2'][i] || 'Basic', evoFrom: i ? NAMES[fam[i - 1] - 1] : null }));
// eeveelutions are Stage 1 from Eevee
for (const d of [134, 135, 136]) stageInfo.set(d, { stage: 'Stage 1', evoFrom: 'Eevee' });

const ATTACKS = {
  Grass: ['Vine Whip','Leaf Munch','Razor Leaf','Spore Puff','Poison Sting','Toxic Spike','Mega Drain'],
  Fire: ['Ember','Flame Dash','Inferno Flight','Heat Tackle','Sky Blaze','Fire Spin'],
  Water: ['Bubble','Water Gun','Aqua Tail','Splash Crash','Hydro Pump','Wave Slap'],
  Electric: ['Static Take','Thunder Advisory','Spark','Volt Tackle','Zap Jab','Charge Beam'],
  Psychic: ['Psybeam','Mind Crush','Psychic Control','Dream Eater','Confuse Ray','Psywave'],
  Fighting: ['Karate Chop','Seismic Toss','Rock Throw','Double Kick','Earth Power','Low Sweep'],
  Colorless: ['Tackle','Quick Attack','Wing Buffet','Body Slam','Gnaw','Pound','Fury Swipes']
};
const FLAVOR = {
  Grass: ['It naps in Ari’s garden and always smells of fresh leaves.','Quietly tends the little sprouts beside Ari’s window.'],
  Fire: ['It keeps Ari’s room cozy on the coldest nights.','Its tail-glow is Ari’s favorite nightlight.'],
  Water: ['It splashes happily whenever Ari fills the tub.','Loves blowing bubbles for Ari to chase.'],
  Electric: ['It gives the gentlest static boop on Ari’s nose.','Charges up fast and lights up when Ari giggles.'],
  Psychic: ['It always seems to know what Ari is thinking.','Floats Ari’s toys back to the toy box at bedtime.'],
  Fighting: ['It carries Ari’s heaviest blocks without a grumble.','Practices tumbles so Ari can copy along.'],
  Colorless: ['It follows Ari everywhere around the house.','A loyal little buddy that never leaves Ari’s side.']
};
const ENERGY = { Grass:'Grass', Fire:'Fire', Water:'Water', Electric:'Electric', Psychic:'Psychic', Fighting:'Fighting', Colorless:'Colorless' };
const WEAK = { Grass:'Fire', Fire:'Water', Water:'Electric', Electric:'Fighting', Psychic:'Psychic', Fighting:'Psychic', Colorless:'Fighting' };

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }

function designFor(dex, slot) {
  const type = typeForDex(dex);
  const { stage, evoFrom } = stageInfo.get(dex) || { stage: 'Basic', evoFrom: null };
  const legendary = [144,145,146,150,151,149].includes(dex);
  const tier = stage === 'Stage 2' ? 2 : stage === 'Stage 1' ? 1 : 0;
  const hp = (legendary ? 100 : [50,70,100][tier]) + (hash(dex) % 4) * 10;
  const pool = ATTACKS[type];
  const h = hash('atk' + dex);
  const a1 = pool[h % pool.length];
  const a2 = pool[(h >> 3) % pool.length];
  const e = ENERGY[type];
  const cost1 = tier >= 1 ? [e, 'Colorless'] : [e];
  const cost2 = tier === 2 ? [e, e, 'Colorless'] : tier === 1 ? [e, e] : [e, 'Colorless'];
  const dmg1 = String(10 + tier * 10 + (legendary ? 10 : 0));
  const dmg2 = String(20 + tier * 30 + (legendary ? 20 : 0));
  const fl = FLAVOR[type];
  return {
    type, stage, evoFrom,
    hp,
    species: ({Fire:'Flame',Water:'Splash',Grass:'Seed',Electric:'Spark',Psychic:'Dream',Fighting:'Strong',Colorless:'Friend'}[type]) || 'AriMon',
    len: `${1 + (hash('L'+dex) % 4)}' ${(hash('l'+dex) % 12)}"`,
    wt: `${10 + (hash('W'+dex) % 90)} lbs`,
    attacks: a1 === a2
      ? [{ name: a1, cost: cost2, dmg: dmg2 }]
      : [{ name: a1, cost: cost1, dmg: dmg1 }, { name: a2, cost: cost2, dmg: dmg2 }],
    weakness: WEAK[type],
    resistance: null,
    retreat: tier === 2 ? ['Colorless','Colorless'] : ['Colorless'],
    rarity: legendary ? 'Rare Holo' : tier === 2 ? 'Rare' : tier === 1 ? 'Uncommon' : 'Common',
    flavor: [fl[0], fl[1]]
  };
}

// ---- live slot -> dex map (read from the existing creatures) ----
const liveDex = {1:0,/* slot:dex below */};
const LIVE = { '001':null,'002':2,'003':3,'004':4,'005':5,'006':6,'007':7,'008':8,'009':9,'010':1,
  '011':10,'012':11,'013':12,'014':13,'015':14,'016':15,'017':16,'018':17,'020':19,'021':20,
  '022':21,'023':22,'024':23,'025':25,'026':26,'027':27,'028':28,'029':29,'030':30,'133':133,'150':150,'151':151 };

const cards = JSON.parse(readFileSync(cardsPath, 'utf8'));
const liveById = new Map(cards.cards.map((c) => [c.id, c]));
const prev = existsSync(biblePath) ? JSON.parse(readFileSync(biblePath, 'utf8')).cards || [] : [];
const prevById = new Map(prev.map((c) => [c.id, c]));

const openSlots = [];
for (let n = 1; n <= 151; n++) { const id = String(n).padStart(3, '0'); if (!liveById.has(id)) openSlots.push(n); }

const out = [];
for (let n = 1; n <= 151; n++) {
  const id = String(n).padStart(3, '0');
  const live = liveById.get(id);
  const dex = live ? LIVE[id] : (n === 19 ? 18 : n); // open slot N -> dex N (019 -> Pidgeot 18)
  const baseName = dex ? NAMES[dex - 1] : (live ? live.name : `Ari${id}`);
  const design = dex ? designFor(dex, n) : { type: live?.type || 'Colorless', stage: 'Basic', hp: 60, species: 'Friend', len: `1' 0"`, wt: '12 lbs', attacks: [{ name: 'Tackle', cost: ['Colorless'], dmg: '10' }], weakness: 'Fighting', resistance: null, retreat: ['Colorless'], rarity: 'Rare', flavor: ['Ari’s one-of-a-kind partner.', 'The very first card of the whole hunt.'] };

  const entry = {
    id,
    number: `${id}/151`,
    name: live ? live.name : `${baseName}Ari`,
    dex: dex || null,
    status: live ? 'live' : 'todo',
    artFile: live ? live.src : null,
    type: live?.type || design.type,
    rarity: live?.rarity || design.rarity,
    stage: design.stage,
    evoFrom: design.evoFrom || null,
    hp: design.hp,
    species: design.species,
    len: design.len,
    wt: design.wt,
    attacks: design.attacks,
    weakness: design.weakness,
    resistance: design.resistance,
    retreat: design.retreat,
    flavor: design.flavor
  };
  // preserve any previously hand-curated fields
  const old = prevById.get(id);
  if (old) for (const k of ['name','type','rarity','stage','evoFrom','hp','species','len','wt','attacks','weakness','resistance','retreat','flavor']) if (old[`_lock_${k}`]) entry[k] = old[k];
  out.push(entry);
}

const bible = {
  set: 'AriMon Base Set',
  total: 151,
  generatedAt: new Date().toISOString(),
  live: out.filter((c) => c.status === 'live').length,
  todo: out.filter((c) => c.status === 'todo').length,
  cards: out
};
writeFileSync(biblePath, JSON.stringify(bible, null, 2) + '\n');
console.log(`Wrote ${out.length} bible entries (${bible.live} live, ${bible.todo} to author) -> data/arimon-bible.json`);
