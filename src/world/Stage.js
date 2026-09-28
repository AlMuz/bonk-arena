import * as THREE from 'three';
import { Terrain, ISLAND_R } from './Terrain.js';
import { mulberry32, buildGeo, G_BOX, G_CYL, G_OCT, G_SPHERE, G_CONE, TAU, lerp } from '../util.js';
import { rockTexture, stoneTexture, groundTexture } from './Textures.js';

const P = (o) => o;
export const THEMES = {
  meadow: P({
    id: 'meadow', name: 'Sunny Meadow', icon: '🌳', desc: 'Grass, rocks, trees.',
    sky: [0x3f98ff, 0xbfe8ff], fog: 0xbfe8ff, sun: 0xfff0d0, hemi: [0xbfe0ff, 0x6a8f4a],
    ground: { kind: 'grass', low: 0x38a04a, high: 0x9ede4e, rock: 0x8f8078 },
    grade: { tint: [1.04, 1.0, 0.94], sat: 1.18, contrast: 1.06 },
    props: { tree: 'round', trees: 170, rocks: 80, crystals: 14, ruins: 8, colors: { trunk: 0x8a5a2b, leaf1: 0x2fbf5a, leaf2: 0x86e85c, rock1: 0xa3a9b6, rock2: 0x808797, crystal: 0x5be0ff, crystal2: 0xb26bff, ruin: 0xd6ceb6, ruin2: 0xada48c, tuft: 0x4fb840 } },
    enemyTint: [1, 1, 1],
  }),
  desert: P({
    id: 'desert', name: 'Scorched Dunes', icon: '🌵', desc: 'Cacti and sand. Unlock: beat Meadow.', unlock: 'meadow',
    sky: [0xff9a3c, 0xffe6b0], fog: 0xffd9a0, sun: 0xffe0a0, hemi: [0xffe0b0, 0xc8843c],
    ground: { kind: 'sand', low: 0xe0aa50, high: 0xffe49a, rock: 0xb87038 },
    grade: { tint: [1.08, 1.0, 0.88], sat: 1.2, contrast: 1.08 },
    props: { tree: 'cactus', trees: 120, rocks: 90, crystals: 10, ruins: 12, colors: { trunk: 0x8a5a2b, leaf1: 0x3fa864, leaf2: 0x66cf7a, rock1: 0xd09858, rock2: 0xa87040, crystal: 0xff7ad0, crystal2: 0xffc23c, ruin: 0xe8d4a0, ruin2: 0xc4a874, tuft: 0xb8a040 } },
    enemyTint: [1.15, 0.95, 0.75],
  }),
  snow: P({
    id: 'snow', name: 'Frostpeak', icon: '❄️', desc: 'Snowy pines. Unlock: beat Dunes.', unlock: 'desert',
    sky: [0x6a9cf0, 0xe8f3ff], fog: 0xdcecff, sun: 0xe8f0ff, hemi: [0xd0e4ff, 0x8fa4c8],
    ground: { kind: 'snow', low: 0xc0d8f8, high: 0xffffff, rock: 0x7a8cb0 },
    grade: { tint: [0.95, 1.0, 1.08], sat: 1.05, contrast: 1.08 },
    props: { tree: 'pine', trees: 190, rocks: 70, crystals: 28, ruins: 8, colors: { trunk: 0x6a4a30, leaf1: 0x2c8a6a, leaf2: 0xeaf6ff, rock1: 0xa8bad8, rock2: 0x8098c0, crystal: 0x9fe8ff, crystal2: 0x7aa8ff, ruin: 0xc8d4e8, ruin2: 0x9fb0cc, tuft: 0xdff0ff } },
    enemyTint: [0.8, 0.95, 1.25],
  }),
  lava: P({
    id: 'lava', name: 'Ember Core', icon: '🌋', desc: 'Molten rock. Unlock: beat Frostpeak.', unlock: 'snow',
    sky: [0x2a0a3a, 0xff6a30], fog: 0x6a2038, sun: 0xffa060, hemi: [0xff8a60, 0x3a1830],
    ground: { kind: 'lava', low: 0x4a3450, high: 0x7c5468, rock: 0x2e1c28 },
    grade: { tint: [1.12, 0.94, 0.9], sat: 1.25, contrast: 1.15 },
    props: { tree: 'spire', trees: 90, rocks: 70, crystals: 44, ruins: 8, colors: { trunk: 0x3a2a3a, leaf1: 0xff7a1a, leaf2: 0xffc02a, rock1: 0x5a4658, rock2: 0x3e2e3e, crystal: 0xff6a1a, crystal2: 0xffd03c, ruin: 0x6a5468, ruin2: 0x4a3848, tuft: 0x8a3a2a } },
    enemyTint: [1.3, 0.8, 0.7],
  }),
};
export const THEME_ORDER = ['meadow', 'desert', 'snow', 'lava'];

export const SHRINE_TYPES = {
  curse: { name: 'Curse Shrine', color: 0xb44cff, hint: 'Enemies grow stronger (+25%), you gain an EPIC item' },
  challenge: { name: 'Challenge Shrine', color: 0xffa02e, hint: 'Slay 30 foes in 35s for a golden chest' },
  blood: { name: 'Blood Shrine', color: 0xff3a4a, hint: 'Sacrifice 30% HP for a RARE item' },
};

export class Stage {
  constructor(G, theme, seed) {
    this.G = G;
    this.theme = theme;
    this.seed = seed;
    this.group = new THREE.Group();
    this.terrain = new Terrain(theme, seed);
    this.group.add(this.terrain.group);
    this.rnd = mulberry32(seed * 3 + 11);
    this.dark = 0;
    this.chests = [];
    this.shrines = [];
    this.altar = null;
    this.portal = null;
    this.buildSky();
    this.buildLights();
    this.buildDecor();
    this.placeShrines();
    this.placeChests();
    this.buildAltar();
    G.scene.add(this.group);
    G.scene.fog = new THREE.Fog(theme.fog, 70, 320);
    G.scene.background = new THREE.Color(theme.fog);
    this.fogBase = new THREE.Color(theme.fog);
    this.fogDark = new THREE.Color(0x3a0a20);
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(500, 24, 16);
    const pos = geo.attributes.position, col = [];
    const top = new THREE.Color(this.theme.sky[0]), hor = new THREE.Color(this.theme.sky[1]), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 500;
      const t = Math.pow(Math.max(0, y), 0.6);
      c.copy(hor).lerp(top, t);
      if (y < 0) c.copy(hor).multiplyScalar(0.85 + y * 0.3);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
  }

  buildLights() {
    const th = this.theme;
    this.hemi = new THREE.HemisphereLight(th.hemi[0], th.hemi[1], 1.1);
    this.sun = new THREE.DirectionalLight(th.sun, 2.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.35;
    this.sun.shadow.radius = 3;
    this.sunOff = new THREE.Vector3(60, 100, 45);
    this.group.add(this.hemi, this.sun, this.sun.target);
  }

  buildDecor() {
    const rnd = mulberry32(this.seed + 5);
    const stoneMat = new THREE.MeshStandardMaterial({ map: rockTexture(this.theme.id), color: new THREE.Color(this.theme.ground.rock).lerp(new THREE.Color(0xffffff), 0.35), flatShading: true, roughness: 1 });
    this.floaters = [];
    for (let i = 0; i < 12; i++) {
      const a = rnd() * TAU, d = 105 + rnd() * 70, s = 3 + rnd() * 9;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), stoneMat);
      rock.scale.set(s, s * (0.6 + rnd() * 0.5), s);
      rock.position.set(Math.cos(a) * d, -25 + rnd() * 50, Math.sin(a) * d);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true;
      // grassy top cap for bigger ones
      if (s > 6) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.15, 7), new THREE.MeshStandardMaterial({ map: groundTexture(this.theme.ground.kind), color: this.theme.ground.high, flatShading: true }));
        cap.position.y = 0.55; cap.rotation.copy(new THREE.Euler(0, 0, 0));
        rock.userData.cap = cap;
      }
      this.group.add(rock);
      this.floaters.push({ m: rock, y0: rock.position.y, ph: rnd() * 6, sp: 0.2 + rnd() * 0.4 });
    }
    // floating platforms with a mini tree
    const platMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xd0d0e0, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const a = rnd() * TAU, d = 103 + rnd() * 25;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 2.4, 2.2, 8), platMat);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.4, 8), new THREE.MeshStandardMaterial({ map: groundTexture(this.theme.ground.kind), color: this.theme.ground.high, flatShading: true }));
      top.position.y = 1.2;
      g.add(base, top);
      g.position.set(Math.cos(a) * d, -3 + rnd() * 14, Math.sin(a) * d);
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.group.add(g);
      this.floaters.push({ m: g, y0: g.position.y, ph: rnd() * 6, sp: 0.3 + rnd() * 0.3 });
    }
    // clouds
    const cloudGeo = buildGeo([
      { g: G_SPHERE, c: 0xffffff, p: [0, 0, 0], s: [6, 3, 4] }, { g: G_SPHERE, c: 0xf2f6ff, p: [5, -0.5, 0.5], s: [4.5, 2.6, 3.5] },
      { g: G_SPHERE, c: 0xffffff, p: [-5, -0.3, -0.5], s: [4, 2.4, 3.2] },
    ]);
    const cloudMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: true, opacity: 0.85 });
    this.clouds = [];
    const dark = this.theme.id === 'lava' ? 0.35 : 1;
    cloudMat.color.setScalar(dark);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(cloudGeo, cloudMat);
      const a = rnd() * TAU, d = 60 + rnd() * 200;
      c.position.set(Math.cos(a) * d, 50 + rnd() * 40, Math.sin(a) * d);
      c.scale.setScalar(1.5 + rnd() * 2.5);
      this.group.add(c);
      this.clouds.push(c);
    }
  }

  spotList() {
    return [...this.chests, ...this.shrines, this.altar].filter(Boolean).map(o => ({ x: o.x, z: o.z, d: 16 }));
  }

  placeShrines() {
    const types = ['curse', 'challenge', 'blood'];
    const t = this.terrain;
    for (let i = 0; i < 3; i++) {
      const sector = (i / 3) * TAU + this.rnd() * 0.8;
      let spot = null;
      for (let k = 0; k < 40 && !spot; k++) {
        const a = sector + (this.rnd() - 0.5) * 1.4, d = 30 + this.rnd() * 38;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (t.isLand(x, z) && t.slopeAt(x, z) < 0.35 && !this.spotList().some(o => Math.hypot(o.x - x, o.z - z) < 30) && Math.hypot(x - t.arena.x, z - t.arena.z) > t.arena.r + 6) spot = { x, z };
      }
      spot = spot || t.randomSpot(this.rnd, 25, 70, 0.4) || { x: 30 * (i - 1), z: 30 };
      const type = types[i];
      const y = t.heightAt(spot.x, spot.z);
      const cfg = SHRINE_TYPES[type];
      const g = new THREE.Group();
      const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xd8d8e8, flatShading: true });
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 1.2, 6), stone);
      ped.position.y = 0.6;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 2.4, 6), stone);
      pil.position.y = 2.2;
      const orbMat = new THREE.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 2.4, flatShading: true });
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), orbMat);
      orb.position.y = 4.1;
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 32), new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
      g.add(ped, pil, orb, ring);
      g.position.set(spot.x, y, spot.z);
      g.traverse(o => { if (o.isMesh && o !== ring) { o.castShadow = true; } });
      this.group.add(g);
      t.addCircle(spot.x, spot.z, 1.3, 5);
      this.shrines.push({ kind: 'shrine', type, x: spot.x, z: spot.z, y, mesh: g, orb, ring, orbMat, ringMat: ring.material, used: false, name: cfg.name, hint: cfg.hint, color: cfg.color });
    }
  }

  placeChests() {
    const n = 8 + ((this.rnd() * 5) | 0);
    const t = this.terrain;
    const wood = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xb0662a, flatShading: true, roughness: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc830, emissive: 0xffa010, emissiveIntensity: 0.55, flatShading: true, metalness: 0.6, roughness: 0.35 });
    for (let i = 0; i < n; i++) {
      const spot = t.randomSpot(this.rnd, 12, 78, 0.4, this.spotList().map(o => ({ ...o, d: 13 })));
      if (!spot) continue;
      this.chests.push(this.makeChest(spot.x, spot.z, wood, gold, false));
    }
    this.chestMats = { wood, gold };
  }

  makeChest(x, z, wood, gold, free) {
    wood = wood || this.chestMats.wood; gold = gold || this.chestMats.gold;
    const y = this.terrain.heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.1), wood);
    body.position.y = 0.5;
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 1.0, -0.55);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 8, 1, false, 0, Math.PI), wood);
    lid.rotation.z = Math.PI / 2; lid.rotation.y = 0; lid.position.set(0, 0, 0.55);
    lid.rotation.set(0, 0, Math.PI / 2);
    lid.scale.set(1, 1, 1);
    lidPivot.add(lid);
    const band1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.06, 1.16), gold); band1.position.set(-0.55, 0.5, 0);
    const band2 = band1.clone(); band2.position.x = 0.55;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.15), gold); lock.position.set(0, 0.85, 0.6);
    g.add(body, lidPivot, band1, band2, lock);
    g.position.set(x, y, z);
    g.rotation.y = this.rnd() * TAU;
    if (free) {
      const aura = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.0, 24), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.rotation.x = -Math.PI / 2; aura.position.y = 0.1; g.add(aura);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.group.add(g);
    this.terrain.addCircle(x, z, 0.9, 1);
    const ch = { kind: 'chest', x, z, y, mesh: g, lid: lidPivot, opened: false, openT: 0, free, cost: 0, name: free ? 'Golden Chest' : 'Chest' };
    return ch;
  }

  // called by elite death
  spawnFreeChest(x, z) {
    const c = this.makeChest(x, z, null, null, true);
    c.mesh.scale.setScalar(0.01);
    c.spawnT = 0;
    this.chests.push(c);
    return c;
  }

  buildAltar() {
    const t = this.terrain, A = t.arena;
    const y = t.heightAt(A.x, A.z);
    const g = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xb8a8c8, flatShading: true });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4 + (i % 3), 1.4), stone);
      const px = Math.cos(a) * (A.r - 1), pz = Math.sin(a) * (A.r - 1);
      s.position.set(px, t.heightAt(A.x + px, A.z + pz) - y + 1.8, pz);
      s.rotation.y = a; s.castShadow = true;
      g.add(s);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(A.r - 3, 40), new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(A.r - 3.4, A.r - 2.6, 48), new THREE.MeshBasicMaterial({ color: 0xff4060, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0xff3050, emissive: 0xff2040, emissiveIntensity: 2.2, flatShading: true }));
    core.position.y = 2.4;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 1.4, 6), stone);
    ped.position.y = 0.7;
    g.add(disc, ring, core, ped);
    g.position.set(A.x, y, A.z);
    this.group.add(g);
    this.altar = { kind: 'altar', x: A.x, z: A.z, y, mesh: g, core, ring, disc, used: false, name: 'Boss Altar', hint: 'BOSS CURSE: harder foes, better drops' };
  }

  openPortal() {
    if (this.portal) return;
    const A = this.terrain.arena, y = this.terrain.heightAt(A.x, A.z);
    const g = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 8, 24), new THREE.MeshStandardMaterial({ color: 0x9a5cff, emissive: 0x9a5cff, emissiveIntensity: 2.5 }));
    torus.position.y = 3.2;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#b58cff'); grd.addColorStop(1, 'rgba(120,60,255,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(64, 64, 14 + i * 12, i, i + 2.4); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, color: 0x999999 }));
    disc.position.y = 3.2;
    g.add(torus, disc);
    g.position.set(A.x, y, A.z);
    this.group.add(g);
    this.portal = { kind: 'portal', x: A.x, z: A.z, y, mesh: g, disc, torus, name: 'Portal', hint: 'Escape!', t: 0 };
  }

  followSun(px, pz) {
    this.sun.target.position.set(px, 0, pz);
    this.sun.position.set(px + this.sunOff.x, this.sunOff.y, pz + this.sunOff.z);
    this.sky.position.set(px, 0, pz);
  }

  setDarkness(d) {
    this.dark = d;
    const k = 1 - 0.8 * d;
    this.skyMat.color.setRGB(k, k * (1 - 0.1 * d), k * (1 - 0.1 * d));
    this.G.scene.fog.color.copy(this.fogBase).lerp(this.fogDark, d * 0.85);
    this.G.scene.background.copy(this.G.scene.fog.color);
    this.sun.intensity = 2.8 * (1 - 0.62 * d);
    this.hemi.intensity = 1.1 * (1 - 0.5 * d);
  }

  update(dt, t) {
    for (const f of this.floaters) {
      f.m.position.y = f.y0 + Math.sin(t * f.sp + f.ph) * 1.5;
      f.m.rotation.y += dt * 0.05;
    }
    for (const c of this.clouds) { c.position.x += dt * 1.2; if (c.position.x > 260) c.position.x = -260; }
    for (const s of this.shrines) {
      if (s.used) { s.orbMat.emissiveIntensity = 0.05; s.ringMat.opacity = 0.1; s.orb.position.y = 3.3; continue; }
      s.orb.position.y = 4.1 + Math.sin(t * 2 + s.x) * 0.25;
      s.orb.rotation.y = t * 1.5;
      const hint = this.G.hintShrines ? 1 : 0;
      s.orbMat.emissiveIntensity = 2.2 + Math.sin(t * 3) * 0.4 + hint * (1 + Math.sin(t * 8)) * 2;
      s.ringMat.opacity = 0.5 + 0.2 * Math.sin(t * 3) + hint * 0.3 * (1 + Math.sin(t * 8)) / 2;
      s.ring.scale.setScalar(1 + hint * 0.08 * Math.sin(t * 8));
    }
    for (const c of this.chests) {
      if (c.spawnT !== undefined && c.spawnT < 1) { c.spawnT = Math.min(1, c.spawnT + dt * 2.5); c.mesh.scale.setScalar(Math.max(0.01, c.spawnT * (2 - c.spawnT) * 1.0)); }
      if (c.opened && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 3); c.lid.rotation.x = -c.openT * 1.9; }
      if (c.free && !c.opened) c.mesh.position.y = c.y + 0.15 + Math.sin(t * 3) * 0.15;
    }
    if (this.altar) {
      const a = this.altar;
      a.core.rotation.y = t; a.core.position.y = 2.4 + Math.sin(t * 2) * 0.2;
      a.ring.material.opacity = 0.6 + 0.25 * Math.sin(t * 2);
      if (a.used) a.core.material.emissiveIntensity = 4;
    }
    if (this.portal) {
      this.portal.t += dt;
      this.portal.disc.rotation.z += dt * 2;
      this.portal.torus.rotation.z -= dt;
      const s = Math.min(1, this.portal.t * 1.5);
      this.portal.mesh.scale.setScalar(s);
    }
  }

  // nearest interactable within reach (used for E prompt)
  nearest(px, pz, reach = 3.6) {
    let best = null, bd = reach * reach;
    const check = (o) => {
      if (!o) return;
      if (o.opened || o.used) return;
      const dx = o.x - px, dz = o.z - pz, d = dx * dx + dz * dz;
      const rr = o.kind === 'portal' || o.kind === 'altar' ? (reach + 2) ** 2 : bd;
      if (d < rr && d < (best ? (best.d) : Infinity)) best = { o, d };
    };
    for (const c of this.chests) check(c);
    for (const s of this.shrines) check(s);
    check(this.altar);
    check(this.portal);
    return best ? best.o : null;
  }
}
