import * as THREE from 'three';
import { damp, clamp } from '../util.js';

export function baseStats() {
  return {
    maxHp: 100, dmg: 1, atkSpeed: 1, crit: 0.05, critDmg: 1.5, moveSpeed: 1, jumpH: 1, projCount: 0, area: 1,
    pickup: 1, armor: 0, regen: 0.6, luck: 0, extraJumps: 1, projSpeed: 1, kb: 1, lifesteal: 0, slideBoost: 1,
    dashCd: 1, execute: 0, momentum: 0, berserk: 0, thorns: 0, revive: 0, goldMult: 1, xpMult: 1, slideDmg: 0,
  };
}

export const CHARACTERS = {
  bonk: {
    id: 'bonk', name: 'Bonk', icon: '🐻', weapon: 'bolt', unlocked: true,
    desc: 'Bolt Fan. +15% damage, +10 HP.', unlockText: '',
    look: { body: 0xff8a2a, belly: 0xffd9a0, accent: 0xb84a10, ear: 'round', eye: 0x1a1a2a },
    passive: (s) => { s.dmg *= 1.15; s.maxHp += 10; },
  },
  zippy: {
    id: 'zippy', name: 'Zippy', icon: '🐰', weapon: 'lightning', unlocked: false,
    desc: 'Lightning Chain. +15% speed, +10% jump, faster dash.', unlockText: 'Unlock: reach level 8 in a run',
    look: { body: 0x3fd4ff, belly: 0xffffff, accent: 0xff5aa8, ear: 'long', eye: 0x102040 },
    passive: (s) => { s.moveSpeed *= 1.15; s.jumpH *= 1.1; s.dashCd *= 0.8; },
  },
  tortle: {
    id: 'tortle', name: 'Tortle', icon: '🐢', weapon: 'aura', unlocked: false,
    desc: 'Aura Pulse. +40 HP, +3 armor, slower.', unlockText: 'Unlock: 250 kills in one run',
    look: { body: 0x4cd46a, belly: 0xd8f5a0, accent: 0x2a7a3a, ear: 'shell', eye: 0x102010 },
    passive: (s) => { s.maxHp += 40; s.armor += 3; s.moveSpeed *= 0.93; },
  },
  orbi: {
    id: 'orbi', name: 'Orbi', icon: '🧙', weapon: 'orbit', unlocked: false,
    desc: 'Orbit Blades. +20% area, +10% attack speed.', unlockText: 'Unlock: win a run',
    look: { body: 0xb05cff, belly: 0xffe8ff, accent: 0xffd23f, ear: 'hat', eye: 0x201030 },
    passive: (s) => { s.area *= 1.2; s.atkSpeed *= 1.1; },
  },
};
export const CHAR_ORDER = ['bonk', 'zippy', 'tortle', 'orbi'];

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, ...extra });
}

export function buildCharacter(def) {
  const L = def.look;
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  const mats = [];
  const M = (c, e) => { const m = mat(c, e); mats.push(m); return m; };
  const mBody = M(L.body), mBelly = M(L.belly), mAcc = M(L.accent), mEye = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), mPupil = new THREE.MeshStandardMaterial({ color: L.eye, roughness: 0.3 });
  mats.push(mEye, mPupil);
  const sph = (r, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; return o; };
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };

  const torso = sph(0.62, mBody, 0, 0.95, 0, 1, 1.05, 0.85);
  const belly = sph(0.42, mBelly, 0, 0.9, 0.36, 1, 1, 0.55);
  const head = new THREE.Group(); head.position.y = 1.85;
  head.add(sph(0.58, mBody, 0, 0, 0, 1.1, 0.95, 1));
  // eyes
  for (const sx of [-1, 1]) {
    head.add(sph(0.2, mEye, sx * 0.27, 0.08, 0.5, 1, 1.15, 0.6));
    head.add(sph(0.1, mPupil, sx * 0.27, 0.06, 0.6, 1, 1.1, 0.6));
  }
  head.add(sph(0.16, mAcc, 0, -0.14, 0.58, 1.3, 0.8, 0.8)); // snout/nose
  // ears / hat
  if (L.ear === 'round') { for (const sx of [-1, 1]) head.add(sph(0.22, mBody, sx * 0.5, 0.55, 0, 1, 1, 0.7)); }
  else if (L.ear === 'long') { for (const sx of [-1, 1]) { const e = sph(0.17, mBody, sx * 0.25, 0.95, 0, 1, 2.6, 0.7); e.rotation.z = -sx * 0.18; head.add(e); const i = sph(0.09, mAcc, sx * 0.25, 0.95, 0.09, 1, 2.2, 0.5); i.rotation.z = -sx * 0.18; head.add(i); } }
  else if (L.ear === 'hat') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 7), mAcc); cone.position.y = 0.95; cone.rotation.z = 0.15; cone.castShadow = true; head.add(cone);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 10), mAcc); brim.position.y = 0.5; head.add(brim);
  }
  if (L.ear === 'shell') { tilt.add(sph(0.62, mAcc, 0, 1.0, -0.42, 1.05, 1, 0.65)); }

  const mkLimb = (x, y, r, len, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); const o = sph(r, m, 0, -len / 2, 0, 1, len / (r * 2), 1); p.add(o); return p; };
  const legL = mkLimb(-0.3, 0.55, 0.22, 0.6, mAcc), legR = mkLimb(0.3, 0.55, 0.22, 0.6, mAcc);
  const armL = mkLimb(-0.72, 1.3, 0.18, 0.7, mBody), armR = mkLimb(0.72, 1.3, 0.18, 0.7, mBody);
  const tail = sph(0.2, mBelly, 0, 0.55, -0.55);
  tilt.add(torso, belly, head, legL, legR, armL, armR, tail);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, tilt, head, legL, legR, armL, armR, torso, mats, phase: 0, squash: 0, yaw: 0, lean: 0, flash: 0 };
}

// procedural animation: squash, stretch, bob, tilt
export function animateCharacter(m, s, dt) {
  const speed = s.speed;
  const run = clamp(speed / 12, 0, 1.6);
  m.phase += dt * (6 + speed * 0.9) * (s.grounded && !s.sliding ? 1 : 0.3);
  const ph = m.phase;
  let sy = 1, sx = 1, targetLean = 0, legA = 0, armA = 0, bob = 0, headTilt = 0, bodyTilt = 0;
  if (s.sliding) {
    // seated slide pose, leaning back, legs forward
    targetLean = -0.55; sy = 0.72; sx = 1.1; legA = -1.25; armA = 0.9; bob = -0.22; bodyTilt = 0;
  } else if (!s.grounded) {
    const up = s.vy > 0;
    sy = up ? 1.14 : 0.98; sx = up ? 0.92 : 1.03;
    legA = up ? 0.5 : -0.45; armA = up ? -2.3 : -1.6;
    targetLean = clamp(speed / 30, 0, 0.35);
  } else if (speed > 0.6) {
    legA = Math.sin(ph) * 0.95 * Math.min(1, run + 0.3);
    armA = -Math.sin(ph) * 0.9 * Math.min(1, run + 0.3);
    bob = Math.abs(Math.sin(ph)) * 0.16 * run;
    targetLean = clamp(speed / 22, 0, 0.5);
    sy = 1 + Math.sin(ph * 2) * 0.035;
    sx = 1 - Math.sin(ph * 2) * 0.025;
  } else {
    sy = 1 + Math.sin(s.time * 3) * 0.028; sx = 1 - Math.sin(s.time * 3) * 0.02;
    armA = Math.sin(s.time * 3) * 0.08;
  }
  // landing squash + hit squash
  m.squash = Math.max(0, m.squash - dt * 4.5);
  const sq = m.squash * m.squash;
  sy *= 1 - sq * 0.35; sx *= 1 + sq * 0.28;
  if (s.hit > 0) { const h = s.hit; sx *= 1 + h * 0.25; sy *= 1 - h * 0.2; bodyTilt = Math.sin(s.time * 60) * 0.12 * h; }
  if (s.dashT > 0) { sy *= 0.85; sx *= 0.85; targetLean = 0.8; }
  m.lean = damp(m.lean, targetLean, 14, dt);
  m.tilt.rotation.x = m.lean;
  m.tilt.rotation.z = bodyTilt;
  m.tilt.scale.set(sx, sy, sx);
  m.tilt.position.y = bob;
  m.legL.rotation.x = legA; m.legR.rotation.x = s.sliding ? legA : -legA;
  m.armL.rotation.x = s.sliding ? armA : -armA * (s.grounded ? 1 : 0.6); m.armR.rotation.x = s.sliding ? armA : armA * (s.grounded ? 1 : 0.6);
  m.armL.rotation.z = s.grounded ? 0.15 : 0.9; m.armR.rotation.z = s.grounded ? -0.15 : -0.9;
  m.head.rotation.x = -m.lean * 0.6;
  m.head.rotation.z = Math.sin(ph * 0.5) * 0.05 * run;
  // face yaw
  m.root.rotation.y = s.yaw;
  // flash white on damage
  const f = s.flash;
  for (const mt of m.mats) if (mt.emissive) { mt.emissive.setRGB(f, f, f); }
}
