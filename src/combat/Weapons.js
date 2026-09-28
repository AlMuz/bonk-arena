import * as THREE from 'three';
import { buildGeo, G_BOX, G_OCT, G_CONE, G_SPHERE, G_CYL, clamp } from '../util.js';
import { dealDamage } from './Damage.js';

const sc = (lv, k = 0.3) => 1 + k * (lv - 1);
const cdScale = (lv) => Math.pow(0.93, lv - 1);

export const WEAPONS = {
  bolt: {
    id: 'bolt', name: 'Bolt Fan', icon: '🏹', maxLevel: 8, desc: 'Fires a fan of bolts at the nearest foe.',
    lvlText: ['+30% damage', '+1 bolt', 'Fires faster', 'Bolts pierce 1 foe', '+30% damage, +1 bolt', 'Fires faster', '+1 bolt, +30% damage'],
    p: (lv) => ({ dmg: 8 * sc(lv), count: 1 + Math.ceil((lv + 1) / 2), cd: 0.8 * cdScale(lv), pierce: lv >= 4 ? 1 : 0 }),
  },
  orbit: {
    id: 'orbit', name: 'Orbit Blades', icon: '🌀', maxLevel: 8, desc: 'Blades orbit you and shred anything touching them.',
    lvlText: ['+30% damage', '+1 blade', 'Wider orbit, faster spin', '+1 blade', '+30% damage', '+1 blade', 'Blades doubled damage'],
    p: (lv) => ({ dmg: 6.5 * sc(lv) * (lv >= 8 ? 1.6 : 1), count: 2 + Math.floor(lv / 2), radius: 3.2 + lv * 0.18, spin: 2.6 + lv * 0.2 }),
  },
  aura: {
    id: 'aura', name: 'Aura Pulse', icon: '💠', maxLevel: 8, desc: 'Pulses a damaging shockwave around you.',
    lvlText: ['+30% damage', 'Bigger pulses', 'Pulses faster', '+30% damage', 'Bigger pulses', 'Pulses faster', 'Double pulse!'],
    p: (lv) => ({ dmg: 10 * sc(lv), radius: 5 + lv * 0.55, cd: 1.5 * cdScale(lv), double: lv >= 8 }),
  },
  boomerang: {
    id: 'boomerang', name: 'Bonk Boomerang', icon: '🌙', maxLevel: 8, desc: 'A piercing boomerang that returns to you.',
    lvlText: ['+30% damage', '+1 boomerang', 'Throws faster', 'Longer range', '+1 boomerang', '+30% damage', 'Double damage on return'],
    p: (lv) => ({ dmg: 15 * sc(lv), count: 1 + Math.floor(lv / 3) + (lv >= 5 ? 0 : 0), cd: 1.5 * cdScale(lv), range: 13 + lv * 1.4 }),
  },
  lightning: {
    id: 'lightning', name: 'Chain Lightning', icon: '⚡', maxLevel: 8, desc: 'Lightning arcs between nearby enemies.',
    lvlText: ['+30% damage', '+2 chain jumps', 'Zaps faster', '+30% damage', '+2 chain jumps', 'Zaps faster', 'Two bolts at once'],
    p: (lv) => ({ dmg: 13 * sc(lv, 0.28), jumps: 2 + lv + (lv >= 5 ? 1 : 0), cd: 1.2 * cdScale(lv), bolts: lv >= 8 ? 2 : 1 }),
  },
  slam: {
    id: 'slam', name: 'Ground Slam', icon: '💥', maxLevel: 8, desc: 'Slams the ground, launching foes away.',
    lvlText: ['+30% damage', 'Bigger shockwave', 'Slams faster', '+30% damage', 'Bigger shockwave', 'Slams faster', 'Aftershock ring'],
    p: (lv) => ({ dmg: 24 * sc(lv), radius: 7 + lv * 0.6, cd: 3.1 * cdScale(lv), after: lv >= 8 }),
  },
  missiles: {
    id: 'missiles', name: 'Homing Missiles', icon: '🚀', maxLevel: 8, desc: 'Missiles chase enemies and explode.',
    lvlText: ['+30% damage', '+1 missile', 'Fires faster', 'Bigger blasts', '+1 missile', '+30% damage', '+2 missiles'],
    p: (lv) => ({ dmg: 18 * sc(lv), count: 2 + Math.floor(lv / 2) + (lv >= 8 ? 1 : 0), cd: 2.2 * cdScale(lv), aoe: 2.4 + lv * 0.18 }),
  },
  trail: {
    id: 'trail', name: 'Fire Trail', icon: '🔥', maxLevel: 8, desc: 'You leave burning ground behind you.',
    lvlText: ['+30% damage', 'Bigger flames', 'Burns longer', '+30% damage', 'Bigger flames', 'Burns longer', 'Inferno: triple damage'],
    p: (lv) => ({ dmg: 5 * sc(lv) * (lv >= 8 ? 2.2 : 1), radius: 1.5 + lv * 0.17, life: 2.8 + lv * 0.35 }),
  },
};
export const WEAPON_ORDER = ['bolt', 'orbit', 'aura', 'boomerang', 'lightning', 'slam', 'missiles', 'trail'];

const PROJ_MAX = 260;
let PID = 1;

export class Weapons {
  constructor(G) {
    this.G = G;
    this.list = [];
    const n = PROJ_MAX;
    this.n = 0;
    const F = () => new Float32Array(n);
    this.a = new Uint8Array(n); this.kind = new Uint8Array(n); this.state = new Uint8Array(n);
    this.x = F(); this.y = F(); this.z = F(); this.vx = F(); this.vz = F(); this.life = F(); this.dmg = F(); this.r = F();
    this.pierce = new Int8Array(n); this.pid = new Int32Array(n); this.tgt = new Int32Array(n); this.tuid = new Uint32Array(n);
    this.ox = F(); this.oz = F(); this.range = F(); this.aoe = F(); this.tt = F(); this.ret = new Uint8Array(n);
    // meshes
    const id = new THREE.Matrix4();
    const mk = (geo, max, mat) => { const m = new THREE.InstancedMesh(geo, mat, max); for (let i = 0; i < max; i++) m.setMatrixAt(i, id); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.count = 0; m.frustumCulled = false; G.scene.add(m); return m; };
    const bm = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.boltMesh = mk(buildGeo([{ g: G_OCT, c: 0xffffff, s: [0.16, 0.16, 0.75] }]), n, bm());
    this.missMesh = mk(buildGeo([{ g: G_CONE, c: 0xffffff, p: [0, 0, 0.25], s: [0.2, 0.7, 0.2], r: [Math.PI / 2, 0, 0] }, { g: G_SPHERE, c: 0xffb060, p: [0, 0, -0.25], s: [0.15, 0.15, 0.22] }]), n, bm());
    this.boomMesh = mk(buildGeo([{ g: G_BOX, c: 0xffffff, p: [0.35, 0, 0], s: [0.9, 0.09, 0.32], r: [0, -0.35, 0] }, { g: G_BOX, c: 0xffffff, p: [-0.35, 0, 0], s: [0.9, 0.09, 0.32], r: [0, 0.35, 0] }]), 40, bm());
    this.bladeMesh = mk(buildGeo([{ g: G_BOX, c: 0xffffff, s: [0.22, 0.12, 1.5] }, { g: G_CONE, c: 0xffffff, p: [0, 0, 0.95], s: [0.2, 0.5, 0.12], r: [Math.PI / 2, 0, 0] }, { g: G_CONE, c: 0xffffff, p: [0, 0, -0.95], s: [0.2, 0.5, 0.12], r: [-Math.PI / 2, 0, 0] }]), 24, bm());
    // fire puddles
    const cg = new THREE.CircleGeometry(1, 20); cg.rotateX(-Math.PI / 2);
    this.puddleMesh = mk(cg, 100, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.pud = { x: new Float32Array(100), z: new Float32Array(100), life: new Float32Array(100), max: new Float32Array(100), r: new Float32Array(100), dmg: new Float32Array(100), t: new Float32Array(100), n: 0 };
    this.blades = { n: 0, ang: 0 };
    this.bladeHit = new Float32Array(1); // unused
  }

  reset() {
    this.list.length = 0;
    this.a.fill(0); this.n = 0;
    this.pud.n = 0; this.blades.n = 0;
    for (const m of [this.boltMesh, this.missMesh, this.boomMesh, this.bladeMesh, this.puddleMesh]) m.count = 0;
  }

  get(id) { return this.list.find(w => w.id === id); }
  add(id) {
    if (this.get(id)) return;
    this.list.push({ id, def: WEAPONS[id], level: 1, t: 0.4, pulse: 0, x: 0 });
    this.G.hud.refreshIcons();
    this.G.toast(WEAPONS[id].icon + ' ' + WEAPONS[id].name + ' acquired!', '#ffd23f');
  }
  levelUp(id) {
    const w = this.get(id);
    if (w && w.level < w.def.maxLevel) { w.level++; this.G.toast(w.def.icon + ' ' + w.def.name + ' Lv' + w.level, '#ffd23f'); }
    this.G.hud.refreshIcons();
  }

  // -------- projectile pool ---------
  spawnProj(kind, x, y, z, vx, vz, dmg, o = {}) {
    let i = -1;
    for (let k = 0; k < PROJ_MAX; k++) if (!this.a[k]) { i = k; break; }
    if (i < 0) return -1;
    this.a[i] = 1; this.kind[i] = kind; this.state[i] = 0;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.vx[i] = vx; this.vz[i] = vz;
    this.life[i] = o.life || 2; this.dmg[i] = dmg; this.r[i] = o.r || 0.5;
    this.pierce[i] = o.pierce || 0; this.pid[i] = PID++; this.tgt[i] = -1; this.tuid[i] = 0;
    this.ox[i] = x; this.oz[i] = z; this.range[i] = o.range || 0; this.aoe[i] = o.aoe || 0; this.tt[i] = 0; this.ret[i] = o.ret || 0;
    return i;
  }

  aimDir(range = 40) {
    const G = this.G, P = G.player, E = G.enemies;
    const j = E.nearest(P.x, P.z, range);
    if (j >= 0) { const dx = E.x[j] - P.x, dz = E.z[j] - P.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l, j }; }
    return { x: P.fx, z: P.fz, j: -1 };
  }

  // -------- main update ---------
  update(dt) {
    const G = this.G, P = G.player, S = P.stats;
    for (const w of this.list) {
      const p = w.def.p(w.level);
      switch (w.id) {
        case 'bolt': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            const aim = this.aimDir();
            if (aim.j < 0) { w.t = 0.15; break; }
            w.t = p.cd;
            const n = p.count + S.projCount, base = Math.atan2(aim.z, aim.x), spd = 34 * S.projSpeed;
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.17;
              this.spawnProj(0, P.x, P.y + 1.2, P.z, Math.cos(a) * spd, Math.sin(a) * spd, p.dmg, { life: 1.1, r: 0.55 * Math.sqrt(S.area), pierce: p.pierce });
            }
            G.audio.sfx('shoot');
          }
          break;
        }
        case 'orbit': this.updateOrbit(w, p, dt); break;
        case 'aura': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            w.t = p.cd;
            this.pulse(P.x, P.z, p.radius * S.area, p.dmg, 0x55ffee, 6);
            if (p.double) setTimeout(() => { if (G.state === 'PLAYING') this.pulse(P.x, P.z, p.radius * S.area * 1.3, p.dmg * 0.7, 0x99ffff, 6); }, 220);
          }
          break;
        }
        case 'boomerang': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            const aim = this.aimDir(45);
            if (aim.j < 0) { w.t = 0.2; break; }
            w.t = p.cd;
            const n = p.count + S.projCount, base = Math.atan2(aim.z, aim.x);
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2) * 0.5, spd = 24 * S.projSpeed;
              this.spawnProj(2, P.x, P.y + 1.1, P.z, Math.cos(a) * spd, Math.sin(a) * spd, p.dmg, { life: 6, r: 1.0 * Math.sqrt(S.area), range: p.range * Math.sqrt(S.area), pierce: 99, ret: w.level >= 8 ? 1 : 0 });
            }
            G.audio.sfx('whoosh');
          }
          break;
        }
        case 'lightning': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            const first = G.enemies.nearest(P.x, P.z, 24);
            if (first < 0) { w.t = 0.15; break; }
            w.t = p.cd;
            for (let b = 0; b < p.bolts; b++) this.chain(p, first, S.projCount, b);
            G.audio.sfx('zap');
          }
          break;
        }
        case 'slam': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            w.t = p.cd;
            const r = p.radius * S.area;
            this.pulse(P.x, P.z, r, p.dmg, 0xffb040, 16);
            G.audio.sfx('slam'); G.shakeCam(0.32);
            G.particles.burst(P.x, P.y + 0.3, P.z, 26, [3, 1.8, 0.5], 12, 0.24, 0.6);
            if (p.after) setTimeout(() => { if (G.state === 'PLAYING') { this.pulse(P.x, P.z, r * 1.5, p.dmg * 0.8, 0xff8030, 16); G.shakeCam(0.2); } }, 260);
          }
          break;
        }
        case 'missiles': {
          w.t -= dt * S.atkSpeed;
          if (w.t <= 0) {
            if (G.enemies.nearest(P.x, P.z, 40) < 0) { w.t = 0.2; break; }
            w.t = p.cd;
            const n = p.count + S.projCount;
            for (let k = 0; k < n; k++) {
              const a = Math.random() * 6.283, spd = 12 * S.projSpeed;
              this.spawnProj(1, P.x, P.y + 1.6, P.z, Math.cos(a) * spd, Math.sin(a) * spd, p.dmg, { life: 3.2, r: 0.7, aoe: p.aoe * Math.sqrt(S.area) });
            }
            G.audio.sfx('missile');
          }
          break;
        }
        case 'trail': this.updateTrail(w, p, dt); break;
      }
    }
    this.updateProjectiles(dt);
    this.updatePuddles(dt);
  }

  pulse(x, z, r, dmg, color, kb) {
    const G = this.G, E = G.enemies;
    G.particles.ringFlat(x, G.stage.terrain.heightAt(x, z), z, r, color, 0.42);
    const n = E.queryCircle(x, z, r);
    const buf = Array.from(E.qbuf.subarray(0, n));
    for (const j of buf) {
      const dx = E.x[j] - x, dz = E.z[j] - z, l = Math.hypot(dx, dz) || 1;
      dealDamage(G, j, dmg, { kx: dx / l, kz: dz / l, kb, noHitstop: buf.length > 6 });
    }
  }

  chain(p, first, extra, idx) {
    const G = this.G, E = G.enemies, P = G.player;
    let cur = first, px = P.x, py = P.y + 1.6, pz = P.z;
    const seen = new Set();
    let target = idx > 0 ? -1 : first;
    if (idx > 0) { // second bolt picks a different target
      let best = -1, bd = 24 * 24;
      for (let i = 0; i < E.hi; i++) { if (!E.active[i] || i === first || (i === 0 && E.inv[0] > 0)) continue; const dx = E.x[i] - P.x, dz = E.z[i] - P.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      target = best;
    }
    cur = target;
    const jumps = p.jumps + extra;
    for (let k = 0; k <= jumps && cur >= 0; k++) {
      seen.add(cur);
      const tx = E.x[cur], ty = E.y[cur] + 1.0, tz = E.z[cur];
      // jagged beam
      const segs = 3;
      let ax = px, ay = py, az = pz;
      for (let s = 1; s <= segs; s++) {
        const f = s / segs, j = s < segs ? 0.9 : 0;
        const bx = px + (tx - px) * f + (Math.random() - 0.5) * j, by = py + (ty - py) * f + (Math.random() - 0.5) * j, bz = pz + (tz - pz) * f + (Math.random() - 0.5) * j;
        G.particles.beam(ax, ay, az, bx, by, bz, [1.6, 2.6, 4], 0.16, 0.16);
        ax = bx; ay = by; az = bz;
      }
      G.particles.burst(tx, ty, tz, 4, [1.5, 2.5, 4], 6, 0.12, 0.3);
      const dx = tx - px, dz = tz - pz, l = Math.hypot(dx, dz) || 1;
      dealDamage(G, cur, p.dmg, { kx: dx / l, kz: dz / l, kb: 2, noHitstop: k > 0 });
      px = tx; py = ty; pz = tz;
      // next: nearest unseen within 9
      let best = -1, bd = 81;
      for (let i = 0; i < E.hi; i++) {
        if (!E.active[i] || seen.has(i) || (i === 0 && E.inv[0] > 0)) continue;
        const ddx = E.x[i] - tx, ddz = E.z[i] - tz, d = ddx * ddx + ddz * ddz;
        if (d < bd) { bd = d; best = i; }
      }
      cur = best;
    }
  }

  updateOrbit(w, p, dt) {
    const G = this.G, P = G.player, S = P.stats, E = G.enemies;
    const n = p.count + S.projCount, R = p.radius * Math.sqrt(S.area);
    this.blades.ang += dt * p.spin * (0.8 + 0.2 * S.atkSpeed) * S.atkSpeed ** 0.5;
    const arr = this.bladeMesh.instanceMatrix.array, carr = this.bladeMesh.instanceColor.array;
    const cnt = Math.min(n, 24);
    for (let k = 0; k < cnt; k++) {
      const a = this.blades.ang + (k / cnt) * 6.2832;
      const bx = P.x + Math.cos(a) * R, bz = P.z + Math.sin(a) * R, by = P.y + 1.1 + Math.sin(a * 2 + G_time(G)) * 0.15;
      // blade points tangent to circle: forward vector = (-sin a, cos a)
      const th = Math.atan2(-Math.sin(a), Math.cos(a)), c = Math.cos(th), s = Math.sin(th), sz = 1 * Math.sqrt(S.area);
      const o = k * 16;
      arr[o] = c * sz; arr[o + 2] = -s * sz; arr[o + 5] = sz; arr[o + 8] = s * sz; arr[o + 10] = c * sz;
      arr[o + 12] = bx; arr[o + 13] = by; arr[o + 14] = bz;
      carr[k * 3] = 2.2; carr[k * 3 + 1] = 3.4; carr[k * 3 + 2] = 4;
      const m = E.queryCircle(bx, bz, 0.9 * sz);
      for (let q = 0; q < m; q++) {
        const j = E.qbuf[q];
        const pidKey = -1000 - k;
        if (E.lastPid[j] === pidKey && G.time - E.lastPidT[j] < 0.32) continue;
        E.lastPid[j] = pidKey; E.lastPidT[j] = G.time;
        const dx = E.x[j] - P.x, dz = E.z[j] - P.z, l = Math.hypot(dx, dz) || 1;
        dealDamage(G, j, p.dmg, { kx: dx / l, kz: dz / l, kb: 3.5, noHitstop: true });
        if (Math.random() < 0.5) G.particles.burst(bx, by, bz, 2, [2, 3, 4], 4, 0.1, 0.25);
      }
    }
    this.bladeMesh.count = cnt;
    this.bladeMesh.instanceMatrix.needsUpdate = true; this.bladeMesh.instanceColor.needsUpdate = true;
  }

  updateTrail(w, p, dt) {
    const G = this.G, P = G.player, S = P.stats;
    w.x -= dt;
    const moving = P.speed > 2.5 && P.grounded;
    if (w.x <= 0 && (moving || (P.grounded && w.x < -0.4))) {
      w.x = 0.14;
      const q = this.pud;
      if (q.n < 100) {
        const i = q.n++;
        q.x[i] = P.x - P.vx * 0.02; q.z[i] = P.z - P.vz * 0.02; q.life[i] = q.max[i] = p.life; q.r[i] = p.radius * Math.sqrt(S.area); q.dmg[i] = p.dmg; q.t[i] = 0;
      }
    }
  }

  updatePuddles(dt) {
    const G = this.G, q = this.pud, E = G.enemies, T = G.stage.terrain;
    const arr = this.puddleMesh.instanceMatrix.array, carr = this.puddleMesh.instanceColor.array;
    let i = 0;
    while (i < q.n) {
      q.life[i] -= dt; q.t[i] -= dt;
      if (q.life[i] <= 0) {
        const l = --q.n;
        if (i !== l) { q.x[i] = q.x[l]; q.z[i] = q.z[l]; q.life[i] = q.life[l]; q.max[i] = q.max[l]; q.r[i] = q.r[l]; q.dmg[i] = q.dmg[l]; q.t[i] = q.t[l]; }
        continue;
      }
      if (q.t[i] <= 0) {
        q.t[i] = 0.3;
        const n = E.queryCircle(q.x[i], q.z[i], q.r[i]);
        for (let k = 0; k < n; k++) { const j = E.qbuf[k]; dealDamage(G, j, q.dmg[i], { kb: 0, noHitstop: true, noCrit: false }); }
        if (Math.random() < 0.5) G.particles.burst(q.x[i], T.heightAt(q.x[i], q.z[i]) + 0.2, q.z[i], 1, [3, 1.2, 0.2], 3, 0.14, 0.5, 2, -4);
      }
      i++;
    }
    for (let k = 0; k < q.n; k++) {
      const f = q.life[k] / q.max[k], r = q.r[k] * (0.85 + 0.15 * Math.sin(G.time * 8 + k)) * Math.min(1, (q.max[k] - q.life[k]) * 5 + 0.2);
      const o = k * 16;
      arr[o] = r; arr[o + 5] = 1; arr[o + 10] = r;
      arr[o + 12] = q.x[k]; arr[o + 13] = T.heightAt(q.x[k], q.z[k]) + 0.18; arr[o + 14] = q.z[k];
      const b = Math.min(1, f * 2);
      carr[k * 3] = 2.6 * b; carr[k * 3 + 1] = 0.9 * b; carr[k * 3 + 2] = 0.12 * b;
    }
    this.puddleMesh.count = q.n;
    this.puddleMesh.instanceMatrix.needsUpdate = true; this.puddleMesh.instanceColor.needsUpdate = true;
  }

  updateProjectiles(dt) {
    const G = this.G, P = G.player, E = G.enemies, T = G.stage.terrain, S = P.stats;
    const cnts = [0, 0, 0];
    const meshes = [this.boltMesh, this.missMesh, this.boomMesh];
    const cols = [[1.2, 3.2, 4.5], [4, 1.6, 0.5], [3.2, 4, 0.8]];
    for (let i = 0; i < PROJ_MAX; i++) {
      if (!this.a[i]) continue;
      const kind = this.kind[i];
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.a[i] = 0; continue; }
      if (kind === 1) {
        // homing missile
        let t = this.tgt[i];
        if (t < 0 || !E.active[t] || E.uid[t] !== this.tuid[i]) { t = E.nearest(this.x[i], this.z[i], 60); this.tgt[i] = t; if (t >= 0) this.tuid[i] = E.uid[t]; }
        this.tt[i] += dt;
        const sp = Math.min(30, 12 + this.tt[i] * 30) * S.projSpeed;
        let dx = this.vx[i], dz = this.vz[i], l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        if (this.tt[i] > 0.18 && t >= 0) {
          let tx = E.x[t] - this.x[i], tz = E.z[t] - this.z[i]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
          const turn = Math.min(1, dt * 7);
          dx += (tx - dx) * turn; dz += (tz - dz) * turn;
          const nl = Math.hypot(dx, dz) || 1; dx /= nl; dz /= nl;
        }
        this.vx[i] = dx * sp; this.vz[i] = dz * sp;
        if (Math.random() < 0.7) G.particles.trail(this.x[i], this.y[i], this.z[i], [3, 1.4, 0.3]);
      } else if (kind === 2) {
        // boomerang
        this.tt[i] += dt;
        if (this.state[i] === 0) {
          const d = Math.hypot(this.x[i] - this.ox[i], this.z[i] - this.oz[i]);
          const sp = Math.hypot(this.vx[i], this.vz[i]);
          this.vx[i] *= 1 - dt * 0.9; this.vz[i] *= 1 - dt * 0.9;
          if (d > this.range[i] || sp < 6) this.state[i] = 1;
        } else {
          const dx = P.x - this.x[i], dz = P.z - this.z[i], l = Math.hypot(dx, dz) || 1;
          const sp = Math.min(36, 14 + (this.tt[i]) * 10) * S.projSpeed;
          this.vx[i] += (dx / l * sp - this.vx[i]) * Math.min(1, dt * 6); this.vz[i] += (dz / l * sp - this.vz[i]) * Math.min(1, dt * 6);
          if (l < 1.3) { this.a[i] = 0; continue; }
        }
      }
      this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt;
      const gy = T.heightAt(this.x[i], this.z[i]);
      if (kind === 0) { if (gy > this.y[i] - 0.1) { this.a[i] = 0; G.particles.burst(this.x[i], this.y[i], this.z[i], 3, [1.2, 3, 4], 5, 0.1, 0.25); continue; } }
      else this.y[i] += (gy + (kind === 1 ? 1.6 : 1.2) - this.y[i]) * Math.min(1, dt * 8);
      // collisions
      const n = E.queryCircle(this.x[i], this.z[i], this.r[i]);
      let dead = false;
      for (let k = 0; k < n; k++) {
        const j = E.qbuf[k];
        const rehit = kind === 2 ? 0.28 : 999;
        if (E.lastPid[j] === this.pid[i] && G.time - E.lastPidT[j] < rehit) continue;
        E.lastPid[j] = this.pid[i]; E.lastPidT[j] = G.time;
        const sp = Math.hypot(this.vx[i], this.vz[i]) || 1;
        const kx = this.vx[i] / sp, kz = this.vz[i] / sp;
        if (kind === 1) { this.explode(i, j); dead = true; break; }
        const mult = kind === 2 && this.ret[i] && this.state[i] === 1 ? 2 : 1;
        dealDamage(G, j, this.dmg[i] * mult, { kx, kz, kb: kind === 2 ? 3 : 4 });
        G.particles.burst(this.x[i], this.y[i], this.z[i], 3, cols[kind], 6, 0.1, 0.25);
        if (kind === 0) { if (this.pierce[i]-- <= 0) { dead = true; break; } }
      }
      if (dead) { this.a[i] = 0; continue; }
      // render
      const m = meshes[kind], o = cnts[kind]++ * 16, arr = m.instanceMatrix.array;
      const th = kind === 2 ? G.time * 16 + i : Math.atan2(this.vx[i], this.vz[i]), c = Math.cos(th), s = Math.sin(th);
      const sz = kind === 2 ? Math.sqrt(S.area) * 1.15 : Math.sqrt(S.area);
      arr[o] = c * sz; arr[o + 2] = -s * sz; arr[o + 5] = sz; arr[o + 8] = s * sz; arr[o + 10] = c * sz;
      arr[o + 12] = this.x[i]; arr[o + 13] = this.y[i]; arr[o + 14] = this.z[i];
      const carr = m.instanceColor.array, co = (o / 16) * 3;
      carr[co] = cols[kind][0]; carr[co + 1] = cols[kind][1]; carr[co + 2] = cols[kind][2];
      if (kind === 0 && Math.random() < 0.3) G.particles.trail(this.x[i], this.y[i], this.z[i], [0.8, 2, 3]);
    }
    for (let k = 0; k < 3; k++) { meshes[k].count = cnts[k]; meshes[k].instanceMatrix.needsUpdate = true; meshes[k].instanceColor.needsUpdate = true; }
  }

  explode(i, hitIdx) {
    const G = this.G, E = G.enemies, R = this.aoe[i];
    const x = this.x[i], z = this.z[i];
    G.particles.ringFlat(x, this.y[i] - 0.8, z, R, 0xff8a30, 0.3);
    G.particles.burst(x, this.y[i], z, 22, [4, 1.8, 0.4], 10, 0.22, 0.5);
    G.audio.sfx('explode');
    G.shakeCam(0.1);
    const n = E.queryCircle(x, z, R), buf = Array.from(E.qbuf.subarray(0, n));
    for (const j of buf) { const dx = E.x[j] - x, dz = E.z[j] - z, l = Math.hypot(dx, dz) || 1; dealDamage(G, j, this.dmg[i], { kx: dx / l, kz: dz / l, kb: 7, noHitstop: buf.length > 3 }); }
  }
}

function G_time(G) { return G.time; }
