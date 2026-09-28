import * as THREE from 'three';
import { clamp } from '../util.js';

const _c = new THREE.Color();
function rgb(c) {
  if (Array.isArray(c)) return c;
  _c.set(c);
  return [_c.r, _c.g, _c.b];
}
const ID = new THREE.Matrix4();

function makeInst(geo, mat, max, castShadow = false) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  for (let i = 0; i < max; i++) m.setMatrixAt(i, ID);
  m.setColorAt(0, _c.set(0xffffff));
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = castShadow;
  return m;
}

export class Particles {
  constructor(G) {
    this.G = G;
    const MAX = 2200;
    this.MAX = MAX;
    this.n = 0;
    this.px = new Float32Array(MAX); this.py = new Float32Array(MAX); this.pz = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX); this.size = new Float32Array(MAX);
    this.cr = new Float32Array(MAX); this.cg = new Float32Array(MAX); this.cb = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.mesh = makeInst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), MAX);
    G.scene.add(this.mesh);

    // flat rings (shockwaves)
    this.rings = [];
    const rg = new THREE.RingGeometry(0.86, 1, 48);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.frustumCulled = false;
      G.scene.add(m);
      this.rings.push({ m, t: 0, dur: 1, r: 1, on: false });
    }
    // beams
    this.beams = [];
    const bg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      m.visible = false; m.frustumCulled = false;
      G.scene.add(m);
      this.beams.push({ m, t: 0, dur: 0.1, on: false, th: 0.2 });
    }
    // damage numbers (DOM pool)
    this.dnRoot = document.getElementById('dmgnums');
    this.dn = [];
    for (let i = 0; i < 36; i++) {
      const el = document.createElement('div');
      el.className = 'dn'; el.style.display = 'none';
      this.dnRoot.appendChild(el);
      this.dn.push({ el, on: false, x: 0, y: 0, z: 0, t: 0, dur: 0.8, crit: false, vy: 0 });
    }
    this.dnHead = 0;
    this._v = new THREE.Vector3();
  }

  reset() {
    this.n = 0; this.mesh.count = 0;
    for (const r of this.rings) { r.on = false; r.m.visible = false; }
    for (const b of this.beams) { b.on = false; b.m.visible = false; }
    for (const d of this.dn) { d.on = false; d.el.style.display = 'none'; }
  }

  burst(x, y, z, n, color, speed, size, life, up = 0.5, grav = 14) {
    const c = rgb(color);
    for (let k = 0; k < n; k++) {
      if (this.n >= this.MAX) return;
      const i = this.n++;
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1 + up, s = speed * (0.35 + Math.random() * 0.65);
      const w = Math.sqrt(Math.max(0, 1 - Math.min(1, u * u)));
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = Math.cos(a) * w * s; this.vy[i] = u * s; this.vz[i] = Math.sin(a) * w * s;
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6);
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      const v = 0.85 + Math.random() * 0.3;
      this.cr[i] = c[0] * v; this.cg[i] = c[1] * v; this.cb[i] = c[2] * v;
      this.grav[i] = grav;
    }
  }

  trail(x, y, z, color) {
    if (this.n >= this.MAX) return;
    const c = rgb(color), i = this.n++;
    this.px[i] = x + (Math.random() - 0.5) * 0.4; this.py[i] = y + (Math.random() - 0.5) * 0.6; this.pz[i] = z + (Math.random() - 0.5) * 0.4;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
    this.life[i] = this.max[i] = 0.3; this.size[i] = 0.3; this.cr[i] = c[0]; this.cg[i] = c[1]; this.cb[i] = c[2]; this.grav[i] = 0;
  }

  ringFlat(x, y, z, radius, color, dur = 0.35) {
    let r = this.rings.find(q => !q.on) || this.rings[0];
    r.on = true; r.t = 0; r.dur = dur; r.r = radius;
    r.m.position.set(x, y + 0.1, z);
    r.m.material.color.set(color);
    r.m.material.color.multiplyScalar(2);
    r.m.visible = true;
  }

  beam(ax, ay, az, bx, by, bz, color, life = 0.12, th = 0.22) {
    const b = this.beams.find(q => !q.on) || this.beams[0];
    b.on = true; b.t = 0; b.dur = life; b.th = th;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 0.01;
    b.m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    b.m.scale.set(th, th, len);
    b.m.lookAt(bx, by, bz);
    b.m.material.color.copy(rgb2c(color));
    b.m.visible = true;
  }

  number(x, y, z, val, crit, big, color) {
    // skip if flooded
    let slot = null;
    for (let k = 0; k < this.dn.length; k++) {
      const d = this.dn[(this.dnHead + k) % this.dn.length];
      if (!d.on) { slot = d; this.dnHead = (this.dnHead + k + 1) % this.dn.length; break; }
    }
    if (!slot) { if (!crit && !big) return; slot = this.dn[this.dnHead]; this.dnHead = (this.dnHead + 1) % this.dn.length; }
    slot.on = true; slot.x = x + (Math.random() - 0.5) * 0.8; slot.y = y; slot.z = z + (Math.random() - 0.5) * 0.8; slot.t = 0; slot.dur = crit ? 1.0 : 0.7;
    slot.crit = crit; slot.vy = crit ? 3.4 : 2.4;
    const v = Math.round(val);
    slot.el.textContent = v >= 10000 ? (v / 1000).toFixed(0) + 'k' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v);
    slot.el.className = 'dn' + (crit ? ' crit' : '');
    slot.el.style.color = color || (crit ? '' : '#fff');
    slot.el.style.display = 'block';
  }

  update(dt) {
    const n = this.n;
    const arr = this.mesh.instanceMatrix.array, carr = this.mesh.instanceColor.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          this.px[i] = this.px[l]; this.py[i] = this.py[l]; this.pz[i] = this.pz[l];
          this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
          this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.size[i] = this.size[l];
          this.cr[i] = this.cr[l]; this.cg[i] = this.cg[l]; this.cb[i] = this.cb[l]; this.grav[i] = this.grav[l];
        }
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      const drag = 1 - Math.min(1, 2.2 * dt);
      this.vx[i] *= drag; this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      i++;
    }
    const T = this.G.stage ? this.G.stage.terrain : null;
    for (let k = 0; k < this.n; k++) {
      if (T && this.grav[k] > 0 && (k & 1) === 0) {
        const gy = T.heightAt(this.px[k], this.pz[k]) + 0.05;
        if (this.py[k] < gy) { this.py[k] = gy; this.vy[k] = Math.abs(this.vy[k]) * 0.35; }
      }
      const f = this.life[k] / this.max[k];
      const s = this.size[k] * (0.25 + 0.75 * Math.min(1, f * 1.6));
      const o = k * 16;
      arr[o] = s; arr[o + 5] = s; arr[o + 10] = s;
      arr[o + 12] = this.px[k]; arr[o + 13] = this.py[k]; arr[o + 14] = this.pz[k];
      carr[k * 3] = this.cr[k]; carr[k * 3 + 1] = this.cg[k]; carr[k * 3 + 2] = this.cb[k];
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { r.on = false; r.m.visible = false; continue; }
      const e = 1 - (1 - f) * (1 - f);
      r.m.scale.setScalar(Math.max(0.01, r.r * e));
      r.m.material.opacity = 0.9 * (1 - f);
    }
    for (const b of this.beams) {
      if (!b.on) continue;
      b.t += dt;
      const f = b.t / b.dur;
      if (f >= 1) { b.on = false; b.m.visible = false; continue; }
      b.m.material.opacity = 1 - f;
      b.m.scale.x = b.m.scale.y = b.th * (1 - f * 0.6);
    }
  }

  // DOM numbers follow real time and camera
  updateNumbers(dt, cam) {
    const w = window.innerWidth, h = window.innerHeight, v = this._v;
    for (const d of this.dn) {
      if (!d.on) continue;
      d.t += dt;
      const f = d.t / d.dur;
      if (f >= 1) { d.on = false; d.el.style.display = 'none'; continue; }
      d.y += d.vy * dt; d.vy *= 1 - 2.5 * dt;
      v.set(d.x, d.y, d.z).project(cam);
      if (v.z > 1 || v.z < -1) { d.el.style.opacity = 0; continue; }
      const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
      const sc = d.crit ? 1 + Math.max(0, 0.6 - d.t * 3) : 1;
      d.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
      d.el.style.opacity = f < 0.6 ? 1 : 1 - (f - 0.6) / 0.4;
    }
  }
}

function rgb2c(c) { const a = rgb(c); return new THREE.Color(a[0], a[1], a[2]); }

// ------------------ XP gems, gold ------------------
const GEM_COL = [[0.4, 1.4, 4], [0.6, 4, 1.2], [3, 0.9, 4.5], [4, 3, 0.4]];
const GEM_SIZE = [0.32, 0.46, 0.66, 0.42];

export class Gems {
  constructor(G) {
    this.G = G;
    const MAX = 1400;
    this.MAX = MAX;
    this.n = 0;
    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX); this.z = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX); this.vz = new Float32Array(MAX);
    this.type = new Uint8Array(MAX); this.val = new Float32Array(MAX); this.state = new Uint8Array(MAX);
    this.age = new Float32Array(MAX);
    this.mesh = makeInst(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    G.scene.add(this.mesh);
    this.combo = 0; this.comboT = 0;
    this.vacuum = false;
  }
  reset() { this.n = 0; this.mesh.count = 0; this.combo = 0; this.vacuum = false; }

  spawn(x, z, type, val, y) {
    const G = this.G;
    if (this.n >= this.MAX) { // flooded: award directly
      if (type === 3) G.addGold(val); else G.addXp(val);
      return;
    }
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.y[i] = y == null ? G.stage.terrain.heightAt(x, z) + 0.6 : y;
    const a = Math.random() * 6.283, s = 2 + Math.random() * 3.5;
    this.vx[i] = Math.cos(a) * s; this.vz[i] = Math.sin(a) * s; this.vy[i] = 5 + Math.random() * 4;
    this.type[i] = type; this.val[i] = val; this.state[i] = 0; this.age[i] = 0;
  }
  spawnXp(x, z, value) {
    const type = value < 5 ? 0 : value < 20 ? 1 : 2;
    this.spawn(x, z, type, value);
  }

  update(dt) {
    const G = this.G, P = G.player, T = G.stage.terrain;
    const range = 3.4 * P.stats.pickup, r2 = range * range;
    const arr = this.mesh.instanceMatrix.array, carr = this.mesh.instanceColor.array;
    const t = G.time;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    const px = P.x, pz = P.z, py = P.y + 1;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      const dx = px - this.x[i], dz = pz - this.z[i], dy = py - this.y[i];
      const d2 = dx * dx + dz * dz + dy * dy;
      if (this.state[i] === 0 && (d2 < r2 || this.vacuum) && this.age[i] > 0.35) this.state[i] = 1;
      if (this.state[i] === 1) {
        const d = Math.sqrt(d2) || 0.001;
        const sp = 14 + this.age[i] * 6 + (this.vacuum ? 20 : 0) + Math.max(0, P.speed - 8);
        const step = Math.min(d, sp * dt);
        this.x[i] += dx / d * step; this.y[i] += dy / d * step; this.z[i] += dz / d * step;
        if (d < 1.0) {
          this.collect(i);
          const l = --this.n;
          if (i !== l) {
            this.x[i] = this.x[l]; this.y[i] = this.y[l]; this.z[i] = this.z[l]; this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l]; this.vz[i] = this.vz[l];
            this.type[i] = this.type[l]; this.val[i] = this.val[l]; this.state[i] = this.state[l]; this.age[i] = this.age[l];
          }
          continue;
        }
      } else {
        // pop physics
        const gy = T.heightAt(this.x[i], this.z[i]) + 0.55;
        if (this.y[i] > gy + 0.01 || this.vy[i] > 0) {
          this.vy[i] -= 26 * dt;
          this.x[i] += this.vx[i] * dt; this.z[i] += this.vz[i] * dt; this.y[i] += this.vy[i] * dt;
          if (this.y[i] < gy) { this.y[i] = gy; this.vy[i] = -this.vy[i] * 0.4; this.vx[i] *= 0.6; this.vz[i] *= 0.6; if (Math.abs(this.vy[i]) < 1) this.vy[i] = 0; }
        } else this.y[i] = gy + Math.sin(t * 3 + i) * 0.08;
      }
      i++;
    }
    for (let k = 0; k < this.n; k++) {
      const ty = this.type[k], s = GEM_SIZE[ty] * (0.9 + 0.1 * Math.sin(t * 6 + k)), a = t * 2.4 + k, c = Math.cos(a), sn = Math.sin(a);
      const o = k * 16;
      arr[o] = c * s; arr[o + 2] = -sn * s; arr[o + 5] = s * 1.3; arr[o + 8] = sn * s; arr[o + 10] = c * s;
      arr[o + 12] = this.x[k]; arr[o + 13] = this.y[k]; arr[o + 14] = this.z[k];
      const col = GEM_COL[ty];
      carr[k * 3] = col[0]; carr[k * 3 + 1] = col[1]; carr[k * 3 + 2] = col[2];
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  collect(i) {
    const G = this.G;
    if (this.type[i] === 3) { G.addGold(this.val[i]); G.audio.sfx('coin'); }
    else { G.addXp(this.val[i]); this.combo = Math.min(this.combo + 1, 14); this.comboT = 0.45; G.audio.gem(this.combo); }
    G.particles.burst(this.x[i], this.y[i], this.z[i], 3, GEM_COL[this.type[i]], 4, 0.1, 0.3);
  }
}

// ------------------ telegraphs ------------------
export class Telegraphs {
  constructor(G) {
    this.G = G;
    this.list = [];
    const mkMat = (o) => new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const cg = new THREE.CircleGeometry(1, 40); cg.rotateX(-Math.PI / 2);
    const rgeo = new THREE.RingGeometry(0.94, 1, 48); rgeo.rotateX(-Math.PI / 2);
    const lg = new THREE.PlaneGeometry(1, 1); lg.rotateX(-Math.PI / 2); lg.translate(0.5, 0, 0);
    for (let i = 0; i < 24; i++) {
      const g = new THREE.Group();
      const back = new THREE.Mesh(cg, mkMat(0.12)), fill = new THREE.Mesh(cg, mkMat(0.26)), ring = new THREE.Mesh(rgeo, mkMat(0.95));
      const lback = new THREE.Mesh(lg, mkMat(0.1)), lfill = new THREE.Mesh(lg, mkMat(0.28));
      for (const m of [back, fill, ring, lback, lfill]) { m.renderOrder = 50; m.frustumCulled = false; g.add(m); }
      g.visible = false;
      G.scene.add(g);
      this.list.push({ g, back, fill, ring, lback, lfill, on: false, t: 0, dur: 1, cb: null, cancel: null, kind: 0 });
    }
  }
  reset() { for (const t of this.list) { t.on = false; t.g.visible = false; } }
  slot() { return this.list.find(t => !t.on); }

  circle(x, z, r, dur, cb, cancel) {
    const t = this.slot(); if (!t) { if (cb) cb(); return; }
    t.on = true; t.kind = 0; t.t = 0; t.dur = dur; t.cb = cb; t.cancel = cancel; t.r = r; t.x = x; t.z = z;
    t.g.visible = true;
    t.back.visible = t.fill.visible = t.ring.visible = true; t.lback.visible = t.lfill.visible = false;
    const y = this.G.stage.terrain.heightAt(x, z) + 0.3;
    t.g.position.set(x, y, z); t.g.rotation.y = 0;
    t.back.scale.setScalar(r); t.ring.scale.setScalar(r); t.fill.scale.setScalar(0.01);
    return t;
  }
  line(x, z, ang, len, wid, dur, cb, cancel) {
    const t = this.slot(); if (!t) { if (cb) cb(); return; }
    t.on = true; t.kind = 1; t.t = 0; t.dur = dur; t.cb = cb; t.cancel = cancel; t.len = len; t.wid = wid; t.x = x; t.z = z; t.ang = ang;
    t.g.visible = true;
    t.back.visible = t.fill.visible = t.ring.visible = false; t.lback.visible = t.lfill.visible = true;
    const y = this.G.stage.terrain.heightAt(x, z) + 0.35;
    t.g.position.set(x, y, z); t.g.rotation.y = -ang;
    t.lback.scale.set(len, 1, wid); t.lfill.scale.set(0.01, 1, wid);
    return t;
  }
  update(dt) {
    for (const t of this.list) {
      if (!t.on) continue;
      t.t += dt;
      if (t.cancel && t.cancel()) { t.on = false; t.g.visible = false; continue; }
      const f = clamp(t.t / t.dur, 0, 1);
      if (t.kind === 0) t.fill.scale.setScalar(Math.max(0.01, t.r * f));
      else t.lfill.scale.x = Math.max(0.01, t.len * f);
      const blink = 0.75 + 0.25 * Math.sin(t.t * 22);
      t.ring.material.opacity = 0.95 * blink;
      if (f >= 1) { t.on = false; t.g.visible = false; if (t.cb) t.cb(); }
    }
  }
}
