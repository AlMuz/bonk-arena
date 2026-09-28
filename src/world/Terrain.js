import * as THREE from 'three';
import { makeNoise, fbm, mulberry32, smooth, clamp, lerp, buildGeo, G_BOX, G_SPHERE, G_LOWSPHERE, G_CONE, G_CYL, G_OCT, TAU } from '../util.js';
import { groundTexture, rockTexture, stoneTexture, propTexture } from './Textures.js';

export const HALF = 120;
export const STEP = 1;
export const N = HALF * 2 / STEP + 1;
export const ISLAND_R = 90;
const VOID_H = -45;

export class Terrain {
  constructor(theme, seed) {
    this.theme = theme;
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed + 77);
    this.group = new THREE.Group();
    this.circles = [];
    this.boxes = [];
    this.grid = new Map();
    this.features = [];
    this.spawnFlat = { x: 0, z: 0, r: 10 };
    const a = this.rnd() * TAU;
    this.arena = { x: Math.cos(a) * 66, z: Math.sin(a) * 66, r: 18, angle: a };
    this.makeFeatures();
    this.heights = new Float32Array(N * N);
    this.rockAmt = new Float32Array(N * N);
    this.bakeHeights();
    this.buildMesh();
    this.buildUnderside();
    this.buildProps();
    this.buildTufts();
  }

  islandRadius(ang) {
    const n = this.noise2(Math.cos(ang) * 1.6 + 40, Math.sin(ang) * 1.6 + 40);
    return ISLAND_R - 8 + n * 14;
  }

  makeFeatures() {
    const r = this.rnd;
    // 2 slide hills + 1 launch ramp, kept away from spawn and arena
    const used = [this.arena];
    const place = (minD, maxD, tries = 40) => {
      for (let i = 0; i < tries; i++) {
        const a = r() * TAU, d = minD + r() * (maxD - minD);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (used.every(u => Math.hypot(u.x - x, u.z - z) > 42)) { used.push({ x, z }); return { x, z }; }
      }
      return { x: -40, z: 30 };
    };
    for (let i = 0; i < 2; i++) {
      const p = place(30, 58);
      this.features.push({ kind: 'hill', x: p.x, z: p.z, sig: 13 + r() * 4, h: 13 + r() * 4 });
    }
    const p = place(28, 55);
    const ang = r() * TAU;
    this.features.push({ kind: 'ramp', x: p.x, z: p.z, dx: Math.cos(ang), dz: Math.sin(ang), len: 34, wid: 9, h: 11 });
    // pits
    for (let i = 0; i < 3; i++) {
      const q = place(20, 70);
      this.features.push({ kind: 'pit', x: q.x, z: q.z, sig: 4 + r() * 2, h: -3.5 });
    }
  }

  rawHeight(x, z) {
    const rr = Math.hypot(x, z);
    const ang = Math.atan2(z, x);
    const R = this.islandRadius(ang);
    let h = (fbm(this.noise, x * 0.022, z * 0.022, 4) - 0.5) * 10 + (fbm(this.noise, x * 0.07 + 30, z * 0.07 + 30, 2) - 0.5) * 1.6;
    for (const f of this.features) {
      if (f.kind === 'hill' || f.kind === 'pit') {
        const d2 = (x - f.x) ** 2 + (z - f.z) ** 2;
        h += f.h * Math.exp(-d2 / (2 * f.sig * f.sig));
      } else {
        // ramp: rises slowly along dir, drops off a lip at the end
        const rx = x - f.x, rz = z - f.z;
        const along = rx * f.dx + rz * f.dz;
        const lat = -rx * f.dz + rz * f.dx;
        const t = along / f.len + 0.5; // 0..1 across ramp
        if (t > -0.1 && t < 1.15) {
          const side = Math.exp(-(lat * lat) / (2 * f.wid * f.wid));
          let prof = t < 0 ? smooth(-0.1, 0, t) * 0 : t < 0.92 ? Math.pow(t / 0.92, 1.6) : 1 - smooth(0.92, 1.06, t);
          h += f.h * prof * side;
        }
      }
    }
    // flat spawn
    const ds = Math.hypot(x - this.spawnFlat.x, z - this.spawnFlat.z);
    const ws = 1 - smooth(this.spawnFlat.r, this.spawnFlat.r + 12, ds);
    h = lerp(h, 0.4, ws);
    // boss arena
    const da = Math.hypot(x - this.arena.x, z - this.arena.z);
    const wa = 1 - smooth(this.arena.r, this.arena.r + 10, da);
    h = lerp(h, 0.6, wa);
    // cliff
    const t = clamp((rr - (R - 2.5)) / 5, 0, 1);
    const cliff = t * t * (3 - 2 * t);
    // bevel a little rocky lip before the drop
    h = lerp(h, VOID_H, cliff);
    return h;
  }

  bakeHeights() {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        this.heights[j * N + i] = this.rawHeight(i * STEP - HALF, j * STEP - HALF);
      }
    }
  }

  heightAt(x, z) {
    const gx = (x + HALF) / STEP, gz = (z + HALF) / STEP;
    if (gx < 0 || gz < 0 || gx >= N - 1 || gz >= N - 1) return VOID_H;
    const i = gx | 0, j = gz | 0;
    const fx = gx - i, fz = gz - j;
    const H = this.heights, k = j * N + i;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + N], h11 = H[k + N + 1];
    return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  gradient(x, z, out) {
    const e = 0.6;
    out.x = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    out.z = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return out;
  }

  // walkable island ground (not the cliff/void)
  isLand(x, z) { return this.heightAt(x, z) > -3; }

  buildMesh() {
    const th = this.theme.ground;
    const pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3), rock = new Float32Array(N * N), uv = new Float32Array(N * N * 2);
    const cl = new THREE.Color(th.low), ch = new THREE.Color(th.high), cr = new THREE.Color(th.rock), tmp = new THREE.Color();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const x = i * STEP - HALF, z = j * STEP - HALF, h = this.heights[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 7; uv[k * 2 + 1] = z / 7;
        // slope
        const hx = this.heights[j * N + Math.min(N - 1, i + 1)] - this.heights[j * N + Math.max(0, i - 1)];
        const hz = this.heights[Math.min(N - 1, j + 1) * N + i] - this.heights[Math.max(0, j - 1) * N + i];
        const slope = Math.hypot(hx, hz) / (2 * STEP);
        const n = fbm(this.noise, x * 0.05 + 9, z * 0.05 + 9, 3);
        tmp.copy(cl).lerp(ch, clamp((h + 4) / 20 + (n - 0.5) * 0.9, 0, 1));
        const ra = smooth(0.75, 1.3, slope) + (h < -4.5 ? 1 : 0);
        const rv = clamp(ra, 0, 1);
        rock[k] = rv;
        tmp.lerp(cr, rv * 0.75);
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
      }
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        if (this.heights[a] <= VOID_H + 0.01 && this.heights[b] <= VOID_H + 0.01 && this.heights[c] <= VOID_H + 0.01 && this.heights[d] <= VOID_H + 0.01) continue;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    const rockTex = rockTexture(this.theme.id);
    const mat = new THREE.MeshStandardMaterial({ map: groundTexture(th.kind), vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rockMap = { value: rockTex };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRock;\nvarying float vRock;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRock;\nuniform sampler2D rockMap;')
        .replace('#include <map_fragment>', 'vec4 gT = texture2D(map, vMapUv); vec4 rT = texture2D(rockMap, vMapUv * 0.8); diffuseColor *= mix(gT, rT, vRock);');
    };
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    this.mesh = mesh;
    this.group.add(mesh);
  }

  buildUnderside() {
    const seg = 56, rings = 7;
    const pos = [], col = [], uv = [], idx = [];
    const c1 = new THREE.Color(this.theme.ground.rock), c2 = new THREE.Color(this.theme.ground.rock).multiplyScalar(0.45), tmp = new THREE.Color();
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * TAU;
        const R0 = this.islandRadius(a) + 3.5;
        const jag = 0.85 + this.noise(s * 0.7, r * 1.3 + 5) * 0.3;
        const rad = R0 * Math.pow(1 - t, 0.75) * (r === 0 ? 1 : jag);
        const y = VOID_H + 1 - t * 62 + (r === 0 ? 0 : (this.noise(s * 0.9 + 3, r) - 0.5) * 6);
        pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad);
        tmp.copy(c1).lerp(c2, t);
        col.push(tmp.r, tmp.g, tmp.b);
        uv.push(s / 6, r / 2);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < seg; s++) {
        const a = r * seg + s, b = r * seg + ((s + 1) % seg), c = a + seg, d = b + seg;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rockTexture(this.theme.id), vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }));
    this.group.add(m);
  }

  // ---------- props -------------
  addCircle(x, z, r, h) {
    const c = { x, z, r, h };
    this.circles.push(c);
    this.bucket(x, z, c, 'c');
  }
  addBox(x0, z0, x1, z1, h) {
    const b = { x0, z0, x1, z1, h };
    this.boxes.push(b);
    for (let gx = Math.floor(x0 / 8); gx <= Math.floor(x1 / 8); gx++) for (let gz = Math.floor(z0 / 8); gz <= Math.floor(z1 / 8); gz++) this.pushBucket(gx, gz, b, 'b');
  }
  bucket(x, z, o, t) { this.pushBucket(Math.floor(x / 8), Math.floor(z / 8), o, t); }
  pushBucket(gx, gz, o, t) {
    const k = gx * 1000 + gz;
    let a = this.grid.get(k);
    if (!a) { a = []; this.grid.set(k, a); }
    a.push(o); o.t = t;
  }

  // push a circle (x,z,r) out of colliders; returns true if moved. Ground-level y is checked so we can jump over low stuff
  resolve(p, r, y) {
    let hit = false;
    const gx0 = Math.floor((p.x - r) / 8), gx1 = Math.floor((p.x + r) / 8), gz0 = Math.floor((p.z - r) / 8), gz1 = Math.floor((p.z + r) / 8);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const a = this.grid.get(gx * 1000 + gz);
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const o = a[i];
          if (o.t === 'c') {
            const gy = this.heightAt(o.x, o.z);
            if (y > gy + o.h) continue;
            const dx = p.x - o.x, dz = p.z - o.z, rr = r + o.r, d2 = dx * dx + dz * dz;
            if (d2 < rr * rr) {
              const d = Math.sqrt(d2) || 0.001;
              p.x = o.x + (dx / d) * rr; p.z = o.z + (dz / d) * rr; hit = true;
            }
          } else {
            const gy = this.heightAt((o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2);
            if (y > gy + o.h) continue;
            const cx = clamp(p.x, o.x0, o.x1), cz = clamp(p.z, o.z0, o.z1);
            const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
            if (d2 < r * r) {
              if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; }
              else {
                const l = p.x - o.x0, rt = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z, m = Math.min(l, rt, t, b);
                if (m === l) p.x = o.x0 - r; else if (m === rt) p.x = o.x1 + r; else if (m === t) p.z = o.z0 - r; else p.z = o.z1 + r;
              }
              hit = true;
            }
          }
        }
      }
    }
    return hit;
  }

  slopeAt(x, z) {
    const gx = this.heightAt(x + 1, z) - this.heightAt(x - 1, z), gz = this.heightAt(x, z + 1) - this.heightAt(x, z - 1);
    return Math.hypot(gx, gz) / 2;
  }

  // find a free flat-ish spot on land
  randomSpot(rnd, minR, maxR, maxSlope = 0.5, avoid = []) {
    for (let i = 0; i < 80; i++) {
      const a = rnd() * TAU, d = minR + rnd() * (maxR - minR);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.isLand(x, z) || this.slopeAt(x, z) > maxSlope) continue;
      if (this.heightAt(x, z) < -1) continue;
      if (Math.hypot(x - this.arena.x, z - this.arena.z) < this.arena.r + 4) continue;
      if (avoid.some(o => Math.hypot(o.x - x, o.z - z) < o.d)) continue;
      const R = this.islandRadius(Math.atan2(z, x));
      if (d > R - 6) continue;
      return { x, z };
    }
    return null;
  }

  buildProps() {
    const th = this.theme, pr = th.props, rnd = this.rnd;
    const pc = pr.colors;
    const kinds = {};
    const make = (kind, count, geoParts, mat, collide, scaleRange = [0.9, 1.6], opts = {}) => {
      if (!count) return;
      const geo = buildGeo(geoParts);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true; mesh.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
      let n = 0;
      for (let tries = 0; tries < count * 6 && n < count; tries++) {
        const spot = this.randomSpot(rnd, opts.minR || 12, ISLAND_R - 4, opts.maxSlope || 0.7);
        if (!spot) continue;
        if (Math.hypot(spot.x, spot.z) < 10) continue;
        const sc = lerp(scaleRange[0], scaleRange[1], rnd());
        const ry = opts.rot90 ? (rnd() < 0.5 ? 0 : Math.PI / 2) : rnd() * TAU;
        const y = this.heightAt(spot.x, spot.z) - (opts.sink || 0);
        e.set(opts.tilt ? (rnd() - 0.5) * 0.3 : 0, ry, opts.tilt ? (rnd() - 0.5) * 0.3 : 0);
        q.setFromEuler(e);
        p.set(spot.x, y, spot.z);
        s.set(sc * (opts.sx || 1), sc * (opts.sy || 1) * (0.85 + rnd() * 0.3), sc * (opts.sx || 1));
        m.compose(p, q, s);
        mesh.setMatrixAt(n, m);
        const v = 0.85 + rnd() * 0.3;
        col.setRGB(v, v * (0.95 + rnd() * 0.1), v);
        mesh.setColorAt(n, col);
        collide(spot.x, spot.z, sc, ry);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
      kinds[kind] = mesh;
    };
    const propMat = new THREE.MeshStandardMaterial({ map: propTexture(), vertexColors: true, flatShading: true, roughness: 0.9 });
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), vertexColors: true, flatShading: true, roughness: 0.95 });
    const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.25, metalness: 0.1, emissive: new THREE.Color(pc.crystal), emissiveIntensity: 0.55 });

    // trees
    if (pr.tree === 'round') {
      make('tree', pr.trees, [
        { g: G_CYL, c: pc.trunk, p: [0, 1.1, 0], s: [0.35, 2.2, 0.35] },
        { g: G_SPHERE, c: pc.leaf1, p: [0, 3.2, 0], s: [1.7, 1.5, 1.7] },
        { g: G_SPHERE, c: pc.leaf2, p: [0.6, 4.2, 0.2], s: [1.2, 1.1, 1.2] },
        { g: G_SPHERE, c: pc.leaf1, p: [-0.7, 3.9, -0.3], s: [1.1, 1.0, 1.1] },
      ], propMat, (x, z, sc) => this.addCircle(x, z, 0.55 * sc, 6));
    } else if (pr.tree === 'pine') {
      make('tree', pr.trees, [
        { g: G_CYL, c: pc.trunk, p: [0, 0.9, 0], s: [0.3, 1.8, 0.3] },
        { g: G_CONE, c: pc.leaf1, p: [0, 2.6, 0], s: [1.8, 2.2, 1.8] },
        { g: G_CONE, c: pc.leaf2, p: [0, 4.0, 0], s: [1.4, 1.9, 1.4] },
        { g: G_CONE, c: pc.leaf1, p: [0, 5.2, 0], s: [0.95, 1.6, 0.95] },
      ], propMat, (x, z, sc) => this.addCircle(x, z, 0.5 * sc, 7));
    } else if (pr.tree === 'cactus') {
      make('tree', pr.trees, [
        { g: G_CYL, c: pc.leaf1, p: [0, 1.6, 0], s: [0.5, 3.2, 0.5] },
        { g: G_CYL, c: pc.leaf2, p: [0.8, 2.0, 0], s: [0.3, 1.2, 0.3] },
        { g: G_CYL, c: pc.leaf2, p: [0.4, 1.4, 0], s: [0.5, 0.3, 0.3], r: [0, 0, Math.PI / 2] },
        { g: G_CYL, c: pc.leaf2, p: [-0.75, 2.5, 0], s: [0.28, 1.0, 0.28] },
        { g: G_CYL, c: pc.leaf2, p: [-0.4, 2.0, 0], s: [0.5, 0.28, 0.28], r: [0, 0, Math.PI / 2] },
      ], propMat, (x, z, sc) => this.addCircle(x, z, 0.6 * sc, 6));
    } else if (pr.tree === 'spire') {
      make('tree', pr.trees, [
        { g: G_CONE, c: pc.trunk, p: [0, 2.5, 0], s: [1.1, 5, 1.1] },
        { g: G_CONE, c: pc.leaf1, p: [0.9, 1.4, 0.3], s: [0.6, 2.8, 0.6] },
        { g: G_CONE, c: pc.leaf2, p: [-0.8, 1.0, -0.4], s: [0.5, 2.0, 0.5] },
      ], stoneMat, (x, z, sc) => this.addCircle(x, z, 0.8 * sc, 6));
    }
    // rocks
    make('rock', pr.rocks, [
      { g: G_SPHERE, c: pc.rock1, p: [0, 0.6, 0], s: [1.3, 0.9, 1.1] },
      { g: G_LOWSPHERE, c: pc.rock2, p: [0.9, 0.35, 0.3], s: [0.7, 0.55, 0.65] },
    ], stoneMat, (x, z, sc) => this.addCircle(x, z, 1.15 * sc, 1.4 * sc), [0.8, 2.2], { tilt: true, sink: 0.15, maxSlope: 0.9 });
    // crystals
    make('crystal', pr.crystals, [
      { g: G_OCT, c: pc.crystal, p: [0, 1.8, 0], s: [0.7, 2.2, 0.7] },
      { g: G_OCT, c: pc.crystal2, p: [0.7, 1.0, 0.2], s: [0.4, 1.3, 0.4], r: [0, 0, -0.3] },
      { g: G_OCT, c: pc.crystal2, p: [-0.6, 0.9, -0.2], s: [0.35, 1.1, 0.35], r: [0, 0, 0.35] },
    ], glowMat, (x, z, sc) => this.addCircle(x, z, 0.7 * sc, 4), [0.9, 1.9], { maxSlope: 0.9 });
    // ruins: pillars cluster + axis-aligned wall
    const nRuins = pr.ruins;
    if (nRuins) {
      const geo = buildGeo([
        { g: G_BOX, c: pc.ruin, p: [0, 1.4, 0], s: [7, 2.8, 1.1] },
        { g: G_BOX, c: pc.ruin2, p: [-2.4, 3.2, 0], s: [2, 1.2, 1.1] },
        { g: G_CYL, c: pc.ruin2, p: [-3.8, 2.0, 2.5], s: [0.6, 4, 0.6] },
        { g: G_CYL, c: pc.ruin, p: [3.4, 1.4, 2.7], s: [0.6, 2.8, 0.6] },
        { g: G_BOX, c: pc.ruin2, p: [3.4, 3.0, 2.7], s: [1.4, 0.4, 1.4] },
        { g: G_BOX, c: pc.ruin, p: [0, 0.2, 3.0], s: [6, 0.4, 2.6] },
      ]);
      const mesh = new THREE.InstancedMesh(geo, stoneMat, nRuins);
      mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      let n = 0;
      for (let tries = 0; tries < 200 && n < nRuins; tries++) {
        const spot = this.randomSpot(rnd, 18, ISLAND_R - 12, 0.3);
        if (!spot) continue;
        const rot90 = rnd() < 0.5;
        const ry = rot90 ? Math.PI / 2 : 0;
        const y = this.heightAt(spot.x, spot.z) - 0.1;
        e.set(0, ry, 0); q.setFromEuler(e);
        m.compose(new THREE.Vector3(spot.x, y, spot.z), q, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(n++, m);
        // rotate local coordinates (x,z) by ry (90deg: x'=z, z'=-x)
        const rot = (lx, lz) => (rot90 ? [spot.x + lz, spot.z - lx] : [spot.x + lx, spot.z + lz]);
        const hw = (w, d) => (rot90 ? [d, w] : [w, d]);
        const [wx, wz] = hw(3.5, 0.55);
        this.addBox(spot.x - wx, spot.z - wz, spot.x + wx, spot.z + wz, 2.8);
        let [px, pz] = rot(-3.8, 2.5); this.addCircle(px, pz, 0.6, 4);
        [px, pz] = rot(3.4, 2.7); this.addCircle(px, pz, 0.6, 2.8);
      }
      mesh.count = n;
      this.group.add(mesh);
    }
  }

  buildTufts() {
    const pc = this.theme.props.colors;
    const geo = buildGeo([
      { g: G_CONE, c: pc.tuft, p: [0, 0.35, 0], s: [0.12, 0.7, 0.12], r: [0.2, 0, 0.1] },
      { g: G_CONE, c: pc.tuft, p: [0.15, 0.3, 0.05], s: [0.1, 0.55, 0.1], r: [0, 0, -0.3] },
      { g: G_CONE, c: pc.tuft, p: [-0.12, 0.3, -0.05], s: [0.1, 0.6, 0.1], r: [-0.2, 0, 0.3] },
    ]);
    const n = 900;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), rnd = this.rnd;
    let k = 0;
    for (let t = 0; t < n * 3 && k < n; t++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * (ISLAND_R - 6);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.isLand(x, z) || this.heightAt(x, z) < -1) continue;
      e.set(0, rnd() * TAU, 0); q.setFromEuler(e);
      const s = 0.8 + rnd() * 1.2;
      m.compose(new THREE.Vector3(x, this.heightAt(x, z), z), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(k++, m);
    }
    mesh.count = k; mesh.frustumCulled = false; mesh.receiveShadow = true;
    this.group.add(mesh);
  }
}
