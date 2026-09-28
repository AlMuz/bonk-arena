import * as THREE from 'three';
import { buildGeo, G_BOX, G_SPHERE, G_LOWSPHERE, G_CONE, G_CYL, clamp } from '../util.js';
import { hurtPlayer, dealDamage } from '../combat/Damage.js';

const eye = (x, y, z, s = 0.16) => [
  { g: G_SPHERE, c: 0xffffff, p: [x, y, z], s: [s, s * 1.15, s * 0.7] },
  { g: G_SPHERE, c: 0x150a25, p: [x * 1.02, y - s * 0.05, z + s * 0.6], s: [s * 0.5, s * 0.6, s * 0.4] },
];

const GEO = {
  swarmer: () => buildGeo([
    { g: G_SPHERE, c: 0xff4fa3, p: [0, 0.5, 0], s: [0.55, 0.5, 0.55] },
    { g: G_SPHERE, c: 0xffa0d0, p: [0, 0.35, 0.3], s: [0.34, 0.26, 0.24] },
    ...eye(-0.2, 0.68, 0.42), ...eye(0.2, 0.68, 0.42),
    { g: G_BOX, c: 0x9a1f62, p: [-0.22, 0.08, 0.05], s: [0.22, 0.16, 0.3] }, { g: G_BOX, c: 0x9a1f62, p: [0.22, 0.08, 0.05], s: [0.22, 0.16, 0.3] },
    { g: G_CONE, c: 0xffe14d, p: [0, 1.05, 0], s: [0.1, 0.25, 0.1] },
  ]),
  runner: () => buildGeo([
    { g: G_SPHERE, c: 0xffd42a, p: [0, 0.5, 0], s: [0.38, 0.55, 0.42] },
    { g: G_CONE, c: 0xff5a1f, p: [0, 1.1, -0.05], s: [0.1, 0.4, 0.28], r: [-0.3, 0, 0] },
    { g: G_CONE, c: 0xff5a1f, p: [0, 0.95, -0.25], s: [0.1, 0.35, 0.22], r: [-0.7, 0, 0] },
    ...eye(-0.16, 0.66, 0.34, 0.13), ...eye(0.16, 0.66, 0.34, 0.13),
    { g: G_BOX, c: 0x1a0a20, p: [-0.16, 0.8, 0.4], s: [0.2, 0.05, 0.05], r: [0, 0, -0.5] }, { g: G_BOX, c: 0x1a0a20, p: [0.16, 0.8, 0.4], s: [0.2, 0.05, 0.05], r: [0, 0, 0.5] },
    { g: G_CONE, c: 0xc98a00, p: [-0.15, 0.1, 0.1], s: [0.12, 0.3, 0.12], r: [1.5, 0, 0] }, { g: G_CONE, c: 0xc98a00, p: [0.15, 0.1, 0.1], s: [0.12, 0.3, 0.12], r: [1.5, 0, 0] },
  ]),
  tank: () => buildGeo([
    { g: G_BOX, c: 0x2ab5a0, p: [0, 0.95, 0], s: [1.7, 1.4, 1.5] },
    { g: G_BOX, c: 0x1c7d70, p: [0, 0.3, 0], s: [1.9, 0.6, 1.7] },
    { g: G_BOX, c: 0x62e0c8, p: [0, 1.55, 0.05], s: [1.5, 0.25, 1.3] },
    { g: G_CONE, c: 0x0f3f38, p: [-0.5, 1.9, -0.2], s: [0.28, 0.6, 0.28] }, { g: G_CONE, c: 0x0f3f38, p: [0.5, 1.9, -0.2], s: [0.28, 0.6, 0.28] }, { g: G_CONE, c: 0x0f3f38, p: [0, 1.95, 0.35], s: [0.28, 0.6, 0.28] },
    ...eye(-0.38, 1.05, 0.72, 0.2), ...eye(0.38, 1.05, 0.72, 0.2),
    { g: G_BOX, c: 0x0a2622, p: [0, 0.6, 0.78], s: [0.9, 0.22, 0.1] },
  ]),
  shooter: () => buildGeo([
    { g: G_SPHERE, c: 0x7a4dff, p: [0, 0.7, 0], s: [0.6, 0.7, 0.6] },
    { g: G_CONE, c: 0x5a32c8, p: [0, 0.0, 0], s: [0.55, 0.9, 0.55], r: [Math.PI, 0, 0] },
    { g: G_SPHERE, c: 0xffffff, p: [0, 0.8, 0.4], s: [0.3, 0.3, 0.2] }, { g: G_SPHERE, c: 0xff7a1a, p: [0, 0.8, 0.52], s: [0.16, 0.16, 0.12] },
    { g: G_SPHERE, c: 0xb89aff, p: [-0.55, 0.55, 0], s: [0.2, 0.2, 0.2] }, { g: G_SPHERE, c: 0xb89aff, p: [0.55, 0.55, 0], s: [0.2, 0.2, 0.2] },
  ]),
  exploder: () => buildGeo([
    { g: G_SPHERE, c: 0xff3a2a, p: [0, 0.6, 0], s: [0.62, 0.6, 0.62] },
    { g: G_BOX, c: 0x2a0a10, p: [0, 0.6, 0], s: [1.3, 0.16, 1.3] },
    { g: G_CYL, c: 0x3a2a2a, p: [0, 1.28, 0], s: [0.08, 0.3, 0.08] },
    { g: G_SPHERE, c: 0xffe14d, p: [0, 1.5, 0], s: [0.16, 0.16, 0.16] },
    ...eye(-0.22, 0.75, 0.48, 0.15), ...eye(0.22, 0.75, 0.48, 0.15),
    { g: G_BOX, c: 0x2a0a10, p: [0, 0.42, 0.55], s: [0.5, 0.14, 0.1] },
  ]),
  elite: () => buildGeo([
    { g: G_SPHERE, c: 0xffb020, p: [0, 1.3, 0], s: [1.1, 1.15, 1.0] },
    { g: G_SPHERE, c: 0xffe08a, p: [0, 1.05, 0.55], s: [0.7, 0.6, 0.4] },
    { g: G_CONE, c: 0xd10f2f, p: [-0.7, 2.45, 0], s: [0.25, 0.9, 0.25], r: [0, 0, 0.5] }, { g: G_CONE, c: 0xd10f2f, p: [0.7, 2.45, 0], s: [0.25, 0.9, 0.25], r: [0, 0, -0.5] },
    { g: G_CONE, c: 0xffe14d, p: [0, 2.6, 0], s: [0.22, 0.6, 0.22] }, { g: G_CONE, c: 0xffe14d, p: [-0.4, 2.45, 0], s: [0.18, 0.45, 0.18] }, { g: G_CONE, c: 0xffe14d, p: [0.4, 2.45, 0], s: [0.18, 0.45, 0.18] },
    ...eye(-0.4, 1.55, 0.85, 0.24), ...eye(0.4, 1.55, 0.85, 0.24),
    { g: G_BOX, c: 0x2a0a10, p: [-0.4, 1.9, 0.88], s: [0.5, 0.1, 0.1], r: [0, 0, -0.4] }, { g: G_BOX, c: 0x2a0a10, p: [0.4, 1.9, 0.88], s: [0.5, 0.1, 0.1], r: [0, 0, 0.4] },
    { g: G_BOX, c: 0x5a1a10, p: [0, 0.9, 0.95], s: [0.9, 0.2, 0.1] },
    { g: G_BOX, c: 0xd08a10, p: [-0.6, 0.3, 0], s: [0.5, 0.6, 0.6] }, { g: G_BOX, c: 0xd08a10, p: [0.6, 0.3, 0], s: [0.5, 0.6, 0.6] },
    { g: G_SPHERE, c: 0xffb020, p: [-1.15, 1.3, 0.1], s: [0.35, 0.6, 0.35] }, { g: G_SPHERE, c: 0xffb020, p: [1.15, 1.3, 0.1], s: [0.35, 0.6, 0.35] },
  ]),
};

const T = (id, name, o) => ({ id, name, ...o });
const list = [
  T(0, 'swarmer', { hp: 12, speed: 4.4, dmg: 6, r: 0.5, h: 1.1, xp: 1, kbRes: 1, color: [3, 0.6, 1.8] }),
  T(1, 'runner', { hp: 8, speed: 8.2, dmg: 5, r: 0.42, h: 1.2, xp: 1, kbRes: 1.2, color: [3.5, 2.6, 0.4] }),
  T(2, 'tank', { hp: 95, speed: 3.0, dmg: 14, r: 1.05, h: 2.0, xp: 7, kbRes: 0.35, color: [0.6, 2.5, 2.2] }),
  T(3, 'shooter', { hp: 24, speed: 3.6, dmg: 9, r: 0.55, h: 1.4, xp: 3, kbRes: 1, color: [1.6, 0.8, 3.5] }),
  T(4, 'exploder', { hp: 18, speed: 6.6, dmg: 24, r: 0.6, h: 1.3, xp: 3, kbRes: 1, color: [3.5, 0.6, 0.4] }),
  T(5, 'elite', { hp: 650, speed: 4.2, dmg: 22, r: 1.5, h: 3.0, xp: 45, kbRes: 0.12, color: [3.5, 2.4, 0.4] }),
  T(6, 'boss', { hp: 6000, speed: 3.6, dmg: 24, r: 3.6, h: 9, xp: 0, kbRes: 0, color: [3, 0.8, 0.6] }),
];
export const ENEMY_TYPES = { list, swarmer: list[0], runner: list[1], tank: list[2], shooter: list[3], exploder: list[4], elite: list[5], boss: list[6], names: ['swarmer', 'runner', 'tank', 'shooter', 'exploder', 'elite'] };

const MAX = 720;
const HC = 4, HN = 64, HOFF = 128;

export class Enemies {
  constructor(G) {
    this.G = G;
    this.MAX = MAX;
    const f = (C, v = 0) => new C(MAX).fill(v);
    this.active = f(Uint8Array); this.type = f(Uint8Array); this.state = f(Uint8Array);
    this.x = f(Float32Array); this.y = f(Float32Array); this.z = f(Float32Array);
    this.kvx = f(Float32Array); this.kvz = f(Float32Array);
    this.hp = f(Float32Array); this.maxhp = f(Float32Array); this.speed = f(Float32Array);
    this.flash = f(Float32Array); this.squash = f(Float32Array); this.timer = f(Float32Array); this.stT = f(Float32Array);
    this.r = f(Float32Array); this.dmg = f(Float32Array); this.rot = f(Float32Array); this.anim = f(Float32Array);
    this.uid = f(Uint32Array); this.lastPid = f(Int32Array, -1); this.lastPidT = f(Float32Array);
    this.kbRes = f(Float32Array); this.inv = f(Float32Array); this.xp = f(Float32Array); this.sc = f(Float32Array, 1);
    this.free = [];
    this.hi = 1;
    this.count = 0;
    this.uidN = 1;
    this.qbuf = new Int32Array(MAX);
    // hash
    this.hCount = new Uint16Array(HN * HN + 1);
    this.hStart = new Uint16Array(HN * HN + 1);
    this.hItems = new Uint16Array(MAX);
    this.hCell = new Uint16Array(MAX);

    // instanced meshes
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.65, metalness: 0.0 });
    this.meshes = [];
    this.cnt = [0, 0, 0, 0, 0, 0];
    const id = new THREE.Matrix4();
    for (let t = 0; t < 6; t++) {
      const m = new THREE.InstancedMesh(GEO[list[t].name](), mat, MAX);
      for (let i = 0; i < MAX; i++) m.setMatrixAt(i, id);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = false;
      G.scene.add(m);
      this.meshes.push(m);
    }

    // enemy projectiles
    const PM = 160;
    this.PM = PM;
    this.pa = new Uint8Array(PM); this.px = new Float32Array(PM); this.py = new Float32Array(PM); this.pz = new Float32Array(PM);
    this.pvx = new Float32Array(PM); this.pvz = new Float32Array(PM); this.plife = new Float32Array(PM); this.pdmg = new Float32Array(PM); this.pr = new Float32Array(PM);
    this.pmesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PM);
    for (let i = 0; i < PM; i++) this.pmesh.setMatrixAt(i, id);
    this.pmesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.pmesh.count = 0; this.pmesh.frustumCulled = false;
    G.scene.add(this.pmesh);
    this.reset();
  }

  reset() {
    this.active.fill(0);
    this.free.length = 0;
    for (let i = MAX - 1; i >= 1; i--) this.free.push(i);
    this.hi = 1; this.count = 0;
    this.pa.fill(0);
    this.hCount.fill(0);
    for (const m of this.meshes) m.count = 0;
    this.pmesh.count = 0;
  }

  spawn(typeId, x, z, o = {}) {
    if (typeId === 6) return this.spawnBoss(x, z, o);
    if (!this.free.length) return -1;
    const i = this.free.pop();
    const ty = list[typeId], d = this.G.diff;
    this.active[i] = 1; this.type[i] = typeId; this.state[i] = 0;
    this.x[i] = x; this.z[i] = z; this.y[i] = this.G.stage.terrain.heightAt(x, z);
    this.kvx[i] = this.kvz[i] = 0;
    const hpS = (o.hpMul || 1) * d.hp;
    this.hp[i] = this.maxhp[i] = ty.hp * hpS;
    this.speed[i] = ty.speed * d.speed * (0.9 + Math.random() * 0.2) * (o.speedMul || 1);
    this.flash[i] = 0; this.squash[i] = 0;
    this.timer[i] = 1 + Math.random() * 3; this.stT[i] = 0;
    this.sc[i] = o.scale || 1;
    this.r[i] = ty.r * this.sc[i]; this.dmg[i] = ty.dmg * d.dmg;
    this.rot[i] = Math.random() * 6.28; this.anim[i] = Math.random() * 10;
    this.uid[i] = this.uidN++;
    this.lastPid[i] = -1;
    this.kbRes[i] = ty.kbRes; this.inv[i] = 0; this.xp[i] = ty.xp * (o.xpMul || 1);
    if (i >= this.hi) this.hi = i + 1;
    this.count++;
    return i;
  }

  spawnBoss(x, z, o) {
    const i = 0, ty = list[6], d = this.G.diff;
    this.active[i] = 1; this.type[i] = 6; this.state[i] = 0;
    this.x[i] = x; this.z[i] = z; this.y[i] = this.G.stage.terrain.heightAt(x, z);
    this.kvx[i] = this.kvz[i] = 0;
    this.hp[i] = this.maxhp[i] = ty.hp * (o.hpMul || 1);
    this.speed[i] = ty.speed; this.flash[i] = 0; this.squash[i] = 0; this.timer[i] = 3; this.stT[i] = 0;
    this.r[i] = ty.r; this.dmg[i] = ty.dmg * d.dmg; this.rot[i] = 0; this.anim[i] = 0;
    this.uid[i] = this.uidN++; this.lastPid[i] = -1; this.kbRes[i] = 0; this.inv[i] = 999; this.sc[i] = 1;
    if (this.hi < 1) this.hi = 1;
    this.count++;
    return 0;
  }

  remove(i) {
    if (!this.active[i]) return;
    this.active[i] = 0; this.count--;
    if (i > 0) this.free.push(i);
  }

  kill(i, o = {}) {
    const G = this.G, P = G.player, ty = list[this.type[i]];
    const x = this.x[i], z = this.z[i], y = this.y[i];
    G.kills++; G.runStats.kills++;
    if (this.type[i] === 6) { this.remove(i); G.boss.onDeath(x, y, z); return; }
    const xp = this.xp[i] * (this.type[i] === 5 ? 1 : 1);
    if (this.type[i] === 5) {
      const n = 12;
      for (let k = 0; k < n; k++) G.gems.spawn(x, z, 2, xp / n);
    } else G.gems.spawnXp(x, z, xp);
    const goldChance = this.type[i] === 2 ? 0.4 : this.type[i] === 5 ? 1 : 0.1;
    if (Math.random() < goldChance) {
      const v = Math.max(1, Math.round((this.type[i] === 5 ? 25 : this.type[i] === 2 ? 5 : 2) * P.stats.goldMult));
      G.gems.spawn(x, z, 3, v);
    }
    const c = ty.color;
    G.particles.burst(x, y + ty.h * 0.5, z, o.quiet ? 2 : this.type[i] === 5 ? 40 : 12, c, this.type[i] === 5 ? 12 : 9, this.type[i] === 5 ? 0.3 : 0.2, 0.55);
    if (!o.quiet) G.audio.sfx('kill');
    const now = G.time;
    if (!o.noHitstop && (this.type[i] >= 2 && this.type[i] !== 4 || now - (G.lastKillStop || 0) > 0.18)) {
      G.hitStop(this.type[i] === 5 ? 0.08 : 0.035); G.lastKillStop = now;
    }
    if (P.stats.lifesteal > 0 && P.hp < P.stats.maxHp) P.hp = Math.min(P.stats.maxHp, P.hp + P.stats.lifesteal);
    if (this.type[i] === 5) {
      G.stage.spawnFreeChest(x, z);
      G.shakeCam(0.5);
      G.toast('Elite slain! A golden chest appears!', '#ffe14d');
      G.particles.ringFlat(x, y, z, 8, 0xffd23f, 0.5);
    }
    G.onKill(i);
    this.remove(i);
  }

  // ---------- spatial hash ----------
  rebuildHash() {
    const cnt = this.hCount, cell = this.hCell;
    cnt.fill(0);
    const hi = this.hi;
    for (let i = 0; i < hi; i++) {
      if (!this.active[i]) continue;
      const cx = clamp(((this.x[i] + HOFF) / HC) | 0, 0, HN - 1), cz = clamp(((this.z[i] + HOFF) / HC) | 0, 0, HN - 1);
      const c = cz * HN + cx;
      cell[i] = c; cnt[c]++;
    }
    let s = 0;
    for (let c = 0; c < HN * HN; c++) { this.hStart[c] = s; s += cnt[c]; cnt[c] = 0; }
    this.hStart[HN * HN] = s;
    for (let i = 0; i < hi; i++) {
      if (!this.active[i]) continue;
      const c = cell[i];
      this.hItems[this.hStart[c] + cnt[c]++] = i;
    }
  }

  queryCircle(x, z, r) {
    let n = 0;
    const x0 = clamp(((x - r - 2 + HOFF) / HC) | 0, 0, HN - 1), x1 = clamp(((x + r + 2 + HOFF) / HC) | 0, 0, HN - 1);
    const z0 = clamp(((z - r - 2 + HOFF) / HC) | 0, 0, HN - 1), z1 = clamp(((z + r + 2 + HOFF) / HC) | 0, 0, HN - 1);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cz * HN + cx;
        for (let k = this.hStart[c], e = this.hStart[c] + this.hCount[c]; k < e; k++) {
          const j = this.hItems[k];
          if (!this.active[j]) continue;
          const dx = this.x[j] - x, dz = this.z[j] - z, rr = r + this.r[j];
          if (dx * dx + dz * dz < rr * rr) this.qbuf[n++] = j;
        }
      }
    }
    return n;
  }

  nearest(x, z, range, skip = -1) {
    let best = -1, bd = range * range;
    for (let i = 0; i < this.hi; i++) {
      if (!this.active[i] || i === skip) continue;
      if (i === 0 && this.inv[0] > 0) continue;
      const dx = this.x[i] - x, dz = this.z[i] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------- enemy projectiles ----------
  fire(x, y, z, dx, dz, speed, dmg, life = 5, r = 0.5) {
    for (let i = 0; i < this.PM; i++) {
      if (this.pa[i]) continue;
      const l = Math.hypot(dx, dz) || 1;
      this.pa[i] = 1; this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.pvx[i] = dx / l * speed; this.pvz[i] = dz / l * speed; this.plife[i] = life; this.pdmg[i] = dmg; this.pr[i] = r;
      return i;
    }
    return -1;
  }

  update(dt) {
    const G = this.G, P = G.player, Tn = G.stage.terrain, px = P.x, pz = P.z;
    const tmp = { x: 0, z: 0 };
    const hi = this.hi;
    const tint = G.stage.theme.enemyTint;
    for (let i = 1; i < hi; i++) {
      if (!this.active[i]) continue;
      const type = this.type[i];
      let x = this.x[i], z = this.z[i];
      const dx = px - x, dz = pz - z, d = Math.hypot(dx, dz) || 0.001;
      const nx = dx / d, nz = dz / d;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 7);
      this.squash[i] = Math.max(0, this.squash[i] - dt * 6);
      this.anim[i] += dt * (4 + this.speed[i] * 0.8);
      this.inv[i] = Math.max(0, this.inv[i] - dt);
      // knockback
      const kvl = Math.abs(this.kvx[i]) + Math.abs(this.kvz[i]);
      let mx = this.kvx[i] * dt, mz = this.kvz[i] * dt;
      const drag = Math.max(0, 1 - 7 * dt);
      this.kvx[i] *= drag; this.kvz[i] *= drag;
      // behaviour
      let move = this.speed[i] * (kvl > 6 ? 0.25 : 1);
      this.timer[i] -= dt;
      if (type === 3) { // shooter
        if (this.state[i] === 1) {
          move = 0;
          this.stT[i] -= dt;
          if (this.stT[i] <= 0) {
            this.state[i] = 0; this.timer[i] = 2.2 + Math.random() * 1.2;
            const ax = px - this.x[i], az = pz - this.z[i];
            this.fire(this.x[i], this.y[i] + 1.1, this.z[i], ax, az, 13, this.dmg[i], 6, 0.5);
            G.audio.sfx('spit');
          }
        } else {
          if (d < 9) move = -this.speed[i] * 0.9; else if (d < 15) move = this.speed[i] * 0.12;
          if (this.timer[i] <= 0 && d < 26) { this.state[i] = 1; this.stT[i] = 0.75; }
        }
      } else if (type === 4) { // exploder
        if (this.state[i] === 1) {
          move = 0; this.stT[i] -= dt;
        } else if (d < 3.3) {
          this.state[i] = 1; this.stT[i] = 0.8;
          const uid = this.uid[i], ii = i;
          G.audio.sfx('telegraph');
          G.telegraphs.circle(x, z, 4.4, 0.8, () => {
            if (this.active[ii] && this.uid[ii] === uid) {
              const ex = this.x[ii], ez = this.z[ii];
              G.particles.burst(ex, this.y[ii] + 0.8, ez, 40, [4, 1.6, 0.3], 14, 0.3, 0.7);
              G.particles.ringFlat(ex, this.y[ii], ez, 4.4, 0xff6a2a, 0.35);
              G.audio.sfx('explode'); G.shakeCam(0.35);
              if (Math.hypot(P.x - ex, P.z - ez) < 4.4 + P.radius) hurtPlayer(G, this.dmg[ii], ex, ez);
              // chain damage to the horde
              const n = this.queryCircle(ex, ez, 4.4), buf = Array.from(this.qbuf.subarray(0, n));
              for (const j of buf) if (j !== ii && this.type[j] !== 6) dealDamage(G, j, 30, { kx: (this.x[j] - ex) * 0.3, kz: (this.z[j] - ez) * 0.3, kb: 8, raw: true, noCrit: true, noHitstop: true });
              this.kill(ii, { noHitstop: true });
            }
          }, () => !(this.active[ii] && this.uid[ii] === uid));
        }
      } else if (type === 5) { // elite
        if (this.state[i] === 1) {
          move *= 0.15; this.stT[i] -= dt;
          if (this.stT[i] <= 0) this.state[i] = 0;
        } else if (this.timer[i] <= 0 && d < 24) {
          this.state[i] = 1; this.stT[i] = 1.25; this.timer[i] = 4.5 + Math.random() * 2;
          const uid = this.uid[i], ii = i, tx = px, tz = pz;
          G.audio.sfx('telegraph');
          G.telegraphs.circle(tx, tz, 6, 1.15, () => {
            G.particles.ringFlat(tx, Tn.heightAt(tx, tz), tz, 6, 0xff5030, 0.4);
            G.particles.burst(tx, Tn.heightAt(tx, tz) + 0.5, tz, 30, [4, 1.2, 0.4], 12, 0.25, 0.6);
            G.audio.sfx('slam'); G.shakeCam(0.4);
            if (Math.hypot(P.x - tx, P.z - tz) < 6 + P.radius && P.y < Tn.heightAt(tx, tz) + 2.2) hurtPlayer(G, this.dmg[ii] * 1.5, tx, tz);
          });
        }
      }
      // steering
      let sx = nx * move * dt, sz = nz * move * dt;
      // separation via hash from last frame
      {
        const r = this.r[i];
        const cx = clamp(((x + HOFF) / HC) | 0, 0, HN - 1), cz = clamp(((z + HOFF) / HC) | 0, 0, HN - 1);
        let pushx = 0, pushz = 0, cnt = 0;
        for (let oz = -1; oz <= 1 && cnt < 8; oz++) {
          const zz = cz + oz; if (zz < 0 || zz >= HN) continue;
          for (let ox = -1; ox <= 1 && cnt < 8; ox++) {
            const xx = cx + ox; if (xx < 0 || xx >= HN) continue;
            const c = zz * HN + xx;
            for (let k = this.hStart[c], e = this.hStart[c] + this.hCount[c]; k < e; k++) {
              const j = this.hItems[k];
              if (j === i || !this.active[j]) continue;
              const ddx = x - this.x[j], ddz = z - this.z[j], rr = r + this.r[j], d2 = ddx * ddx + ddz * ddz;
              if (d2 < rr * rr && d2 > 1e-6) { const dd = Math.sqrt(d2), f = (rr - dd) / rr; pushx += ddx / dd * f; pushz += ddz / dd * f; cnt++; }
            }
          }
        }
        sx += pushx * 6 * dt; sz += pushz * 6 * dt;
      }
      let nxp = x + sx + mx, nzp = z + sz + mz;
      // cliff / void guard
      if (Tn.heightAt(nxp, nzp) < -2) { nxp = x; nzp = z; this.kvx[i] = this.kvz[i] = 0; }
      tmp.x = nxp; tmp.z = nzp;
      Tn.resolve(tmp, this.r[i] * 0.8, this.y[i]);
      x = tmp.x; z = tmp.z;
      this.x[i] = x; this.z[i] = z;
      const gy = Tn.heightAt(x, z);
      this.y[i] = gy;
      // face target
      let tr = Math.atan2(nx, nz), dr = tr - this.rot[i];
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      this.rot[i] += dr * Math.min(1, dt * 10);
      // contact damage
      if (d < this.r[i] + P.radius + 0.05 && type !== 3 && !(type === 4 && this.state[i] === 1) && P.iframes <= 0 && P.y < gy + this.sc[i] * list[type].h) {
        hurtPlayer(G, this.dmg[i], x, z);
      }
    }
    this.rebuildHashCounts();
    this.updateProjectiles(dt);
  }

  // hCount was zeroed during rebuild's second pass; rebuild after movement so weapons see current positions
  rebuildHashCounts() {
    this.rebuildHash();
    // rebuildHash leaves hCount filled with per-cell counts (used by queries & separation)
  }

  updateProjectiles(dt) {
    const G = this.G, P = G.player, T = G.stage.terrain;
    const arr = this.pmesh.instanceMatrix.array, carr = this.pmesh.instanceColor.array;
    let n = 0;
    for (let i = 0; i < this.PM; i++) {
      if (!this.pa[i]) continue;
      this.plife[i] -= dt;
      this.px[i] += this.pvx[i] * dt; this.pz[i] += this.pvz[i] * dt;
      const gy = T.heightAt(this.px[i], this.pz[i]);
      this.py[i] = Math.max(this.py[i] - 0 * dt, gy + 1.0);
      if (this.plife[i] <= 0 || gy < -3) { this.pa[i] = 0; continue; }
      const dx = P.x - this.px[i], dz = P.z - this.pz[i], dy = P.y + 1 - this.py[i];
      const rr = this.pr[i] + P.radius;
      if (dx * dx + dz * dz < rr * rr && Math.abs(dy) < 1.8) {
        if (hurtPlayer(G, this.pdmg[i], this.px[i] - this.pvx[i], this.pz[i] - this.pvz[i])) {
          G.particles.burst(this.px[i], this.py[i], this.pz[i], 10, [4, 1.5, 0.3], 8, 0.16, 0.4);
          this.pa[i] = 0; continue;
        }
      }
      const o = n * 16, s = this.pr[i] * (1 + 0.15 * Math.sin(G.time * 20 + i));
      arr[o] = s; arr[o + 5] = s; arr[o + 10] = s;
      arr[o + 12] = this.px[i]; arr[o + 13] = this.py[i]; arr[o + 14] = this.pz[i];
      carr[n * 3] = 4; carr[n * 3 + 1] = 1.3; carr[n * 3 + 2] = 0.3;
      if (Math.random() < 0.4) G.particles.trail(this.px[i], this.py[i], this.pz[i], [3, 0.8, 0.2]);
      n++;
    }
    this.pmesh.count = n;
    this.pmesh.instanceMatrix.needsUpdate = true;
    this.pmesh.instanceColor.needsUpdate = true;
  }

  // ---------- rendering ----------
  render() {
    const G = this.G, tint = G.stage.theme.enemyTint, t = G.time;
    const cnt = this.cnt; cnt.fill(0);
    for (let i = 1; i < this.hi; i++) {
      if (!this.active[i]) continue;
      const ty = this.type[i];
      if (ty > 5) continue;
      const mesh = this.meshes[ty];
      const k = cnt[ty]++;
      const arr = mesh.instanceMatrix.array, o = k * 16;
      const sq = this.squash[i], sc = this.sc[i];
      let sy = sc * (1 - 0.32 * sq * sq + Math.sin(this.anim[i] * 2) * 0.03), sx = sc * (1 + 0.28 * sq * sq - Math.sin(this.anim[i] * 2) * 0.02);
      if (ty === 4 && this.state[i] === 1) { const b = Math.sin(t * 40) * 0.08; sx *= 1.15 + b; sy *= 1.15 + b; }
      let yo = 0;
      if (ty === 3) yo = 0.7 + Math.sin(this.anim[i] * 0.7) * 0.2;
      else yo = Math.abs(Math.sin(this.anim[i])) * 0.12 * sc;
      const c = Math.cos(this.rot[i]), s = Math.sin(this.rot[i]);
      arr[o] = c * sx; arr[o + 1] = 0; arr[o + 2] = -s * sx; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = sy; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = s * sx; arr[o + 9] = 0; arr[o + 10] = c * sx; arr[o + 11] = 0;
      arr[o + 12] = this.x[i]; arr[o + 13] = this.y[i] + yo; arr[o + 14] = this.z[i]; arr[o + 15] = 1;
      const carr = mesh.instanceColor.array, co = k * 3;
      const f = this.flash[i];
      if (f > 0.05) { const w = 1 + f * 3.2; carr[co] = w; carr[co + 1] = w; carr[co + 2] = w; }
      else if (ty === 4 && this.state[i] === 1) { const b = Math.sin(t * 30) > 0 ? 3.2 : 0.7; carr[co] = b; carr[co + 1] = b * 0.35; carr[co + 2] = b * 0.3; }
      else if (ty === 3 && this.state[i] === 1) { carr[co] = 3; carr[co + 1] = 1.7; carr[co + 2] = 0.5; }
      else { carr[co] = tint[0]; carr[co + 1] = tint[1]; carr[co + 2] = tint[2]; }
    }
    for (let ty = 0; ty < 6; ty++) {
      const m = this.meshes[ty];
      m.count = cnt[ty];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}
