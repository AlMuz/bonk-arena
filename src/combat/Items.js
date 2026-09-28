import { baseStats } from '../player/Characters.js';
import { WEAPONS, WEAPON_ORDER } from './Weapons.js';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR = { common: '#cfd6e6', rare: '#4da3ff', epic: '#c05bff', legendary: '#ffb02e' };

const I = (id, name, icon, rarity, desc, mod, extra = {}) => ({ id, name, icon, rarity, desc, mod, ...extra });

export const ITEMS = [
  // common
  I('spicy', 'Spicy Sauce', '🌶️', 'common', '+12% damage', s => { s.dmg *= 1.12; }),
  I('rapid', 'Rapid Hands', '✋', 'common', '+10% attack speed', s => { s.atkSpeed *= 1.1; }),
  I('sneakers', 'Sneakers', '👟', 'common', '+8% move speed', s => { s.moveSpeed *= 1.08; }),
  I('springs', 'Springs', '🦘', 'common', '+12% jump height', s => { s.jumpH *= 1.12; }),
  I('magnet', 'Magnet', '🧲', 'common', '+35% pickup range', s => { s.pickup *= 1.35; }),
  I('plate', 'Iron Plate', '🛡️', 'common', '+2 armor', s => { s.armor += 2; }),
  I('heartjar', 'Heart Jar', '❤️', 'common', '+20 max HP', s => { s.maxHp += 20; }),
  I('moss', 'Regen Moss', '🌿', 'common', '+0.9 HP/sec', s => { s.regen += 0.9; }),
  I('boom', 'Big Boom', '💣', 'common', '+12% area', s => { s.area *= 1.12; }),
  I('glove', 'Bonk Glove', '🥊', 'common', '+30% knockback', s => { s.kb *= 1.3; }),
  I('xpcrystal', 'XP Crystal', '💎', 'common', '+15% XP gain', s => { s.xpMult *= 1.15; }),
  I('coin', 'Lucky Coin', '🎰', 'common', '+20% gold, +5 luck', s => { s.goldMult *= 1.2; s.luck += 5; }),
  I('wax', 'Slide Wax', '🧪', 'common', '+15% slide power', s => { s.slideBoost *= 1.15; }),
  // rare
  I('sharpeye', 'Sharp Eye', '👁️', 'rare', '+9% crit chance', s => { s.crit += 0.09; }),
  I('gauntlet', 'Crit Gauntlet', '🧤', 'rare', '+30% crit damage', s => { s.critDmg += 0.3; }),
  I('clover', 'Four Leaf Clover', '🍀', 'rare', '+15 luck, +4% crit', s => { s.luck += 15; s.crit += 0.04; }),
  I('fang', 'Vampire Fang', '🦷', 'rare', 'Heal 1 HP per kill', s => { s.lifesteal += 1; }),
  I('chrono', 'Chrono Watch', '⌚', 'rare', '-15% dash cooldown', s => { s.dashCd *= 0.85; }),
  I('momentum', 'Momentum Charm', '🌀', 'rare', 'More damage the faster you move', s => { s.momentum += 1; }),
  I('thorns', 'Thorn Cloak', '🌵', 'rare', 'Damage burst when hit', s => { s.thorns += 1; }),
  I('slideblades', 'Slide Blades', '⛸️', 'rare', 'Sliding shreds nearby foes', s => { s.slideDmg += 1; s.slideBoost *= 1.08; }),
  I('purse', 'Bounty Purse', '💰', 'rare', '+30% gold, +10% XP', s => { s.goldMult *= 1.3; s.xpMult *= 1.1; }),
  I('wings', 'Tiny Wings', '🕊️', 'rare', '+1 extra jump', s => { s.extraJumps += 1; }, { max: 3 }),
  // epic
  I('multishot', 'Multishot Ring', '💍', 'epic', '+1 projectile', s => { s.projCount += 1; }),
  I('glass', 'Glass Cannon', '🔮', 'epic', '+45% damage, -20 max HP', s => { s.dmg *= 1.45; s.maxHp = Math.max(30, s.maxHp - 20); }),
  I('berserk', 'Berserker Mask', '👹', 'epic', 'Up to +80% damage when hurt', s => { s.berserk += 0.8; }),
  I('titan', 'Titan Heart', '💗', 'epic', '+50 max HP, +1.5 HP/sec', s => { s.maxHp += 50; s.regen += 1.5; }),
  I('turbo', 'Turbo Boots', '🚀', 'epic', '+18% speed, +10% jump', s => { s.moveSpeed *= 1.18; s.jumpH *= 1.1; }),
  I('prism', 'Prism Lens', '🔍', 'epic', '+25% area, +10% crit', s => { s.area *= 1.25; s.crit += 0.1; }),
  // legendary
  I('executioner', "Executioner's Axe", '⚔️', 'legendary', 'Foes under 12% HP die. +15% damage', s => { s.execute += 0.12; s.dmg *= 1.15; }),
  I('phoenix', 'Phoenix Feather', '🔥', 'legendary', 'Revive once with 60% HP', s => { s.revive += 1; }, { max: 3 }),
  I('overclock', 'Overclock Core', '⚙️', 'legendary', '+30% attack & projectile speed', s => { s.atkSpeed *= 1.3; s.projSpeed *= 1.3; }),
  I('twin', 'Twin Souls', '👥', 'legendary', '+2 projectiles', s => { s.projCount += 2; }),
  I('crown', 'Crown of Bonk', '👑', 'legendary', '+30% damage, +10% crit, +20% XP', s => { s.dmg *= 1.3; s.crit += 0.1; s.xpMult *= 1.2; }),
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

export function recalcStats(P) {
  const s = baseStats();
  P.def.passive(s);
  for (const id in P.items) {
    const it = ITEM_BY_ID[id];
    for (let k = 0; k < P.items[id]; k++) it.mod(s);
  }
  const oldMax = P.stats ? P.stats.maxHp : s.maxHp;
  P.stats = s;
  if (P.hp !== undefined) {
    if (s.maxHp > oldMax) P.hp += s.maxHp - oldMax;
    P.hp = Math.min(P.hp, s.maxHp);
  }
}

export function rollRarity(luck, boost = 0, rnd = Math.random) {
  const w = [60 - boost * 0.5, 28 + luck * 0.5 + boost * 0.3, 9 + luck * 0.4 + boost * 0.3, 1.5 + luck * 0.2 + boost * 0.1];
  let sum = 0;
  for (const x of w) sum += Math.max(0, x);
  let r = rnd() * sum;
  for (let i = 0; i < 4; i++) { r -= Math.max(0, w[i]); if (r <= 0) return RARITIES[i]; }
  return 'common';
}

export function randomItem(P, rarityBoost = 0, minRarity = 0) {
  const luck = P.stats.luck;
  let r = rollRarity(luck, rarityBoost);
  if (RARITIES.indexOf(r) < minRarity) r = RARITIES[minRarity];
  for (let k = 0; k < 4; k++) {
    const pool = ITEMS.filter(i => i.rarity === r && (P.items[i.id] || 0) < (i.max || 99));
    if (pool.length) return pool[(Math.random() * pool.length) | 0];
    r = RARITIES[Math.max(0, RARITIES.indexOf(r) - 1)];
  }
  return ITEMS[0];
}

export function giveItem(G, item) {
  const P = G.player;
  P.items[item.id] = (P.items[item.id] || 0) + 1;
  recalcStats(P);
  G.hud.refreshIcons();
}

// ------------- level-up choices ---------------
function weaponRarity(level) { return level < 3 ? 'common' : level < 5 ? 'rare' : level < 7 ? 'epic' : 'legendary'; }

export function generateChoices(G, n = 3) {
  const P = G.player, W = G.weapons;
  const pool = [];
  for (const it of ITEMS) if ((P.items[it.id] || 0) < (it.max || 99)) pool.push({ kind: 'item', id: it.id, rarity: it.rarity, name: it.name, icon: it.icon, desc: it.desc, stacks: P.items[it.id] || 0 });
  for (const wid of WEAPON_ORDER) {
    const def = WEAPONS[wid], w = W.get(wid);
    if (w) {
      if (w.level < def.maxLevel) pool.push({ kind: 'wupg', id: wid, rarity: weaponRarity(w.level), name: def.name + ' Lv' + (w.level + 1), icon: def.icon, desc: def.lvlText[w.level - 1], stacks: w.level });
    } else if (W.list.length < 6) pool.push({ kind: 'weapon', id: wid, rarity: 'rare', name: def.name, icon: def.icon, desc: def.desc, stacks: 0, isNew: true });
  }
  const chosen = [];
  const take = (c) => { chosen.push(c); pool.splice(pool.indexOf(c), 1); };
  if (G.level <= 5 && W.list.length < 4) {
    const nw = pool.filter(c => c.kind === 'weapon');
    if (nw.length) take(nw[(Math.random() * nw.length) | 0]);
  }
  let guard = 0;
  while (chosen.length < n && pool.length && guard++ < 50) {
    const r = rollRarity(P.stats.luck);
    let c = pool.filter(x => x.rarity === r);
    if (!c.length) c = pool;
    take(c[(Math.random() * c.length) | 0]);
  }
  // shuffle so the forced weapon isn't always slot 1
  for (let i = chosen.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[chosen[i], chosen[j]] = [chosen[j], chosen[i]]; }
  return chosen;
}

export function applyChoice(G, c) {
  const P = G.player;
  if (c.kind === 'item') {
    giveItem(G, ITEM_BY_ID[c.id]);
  } else if (c.kind === 'weapon') {
    G.weapons.add(c.id);
  } else {
    G.weapons.levelUp(c.id);
  }
  G.hud.refreshIcons();
  G.audio.sfx('select');
}
