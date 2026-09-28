import * as THREE from 'three';
import { buildGeo, G_BOX, G_SPHERE, G_CONE, G_CYL, clamp, damp, TAU } from '../util.js';
import { hurtPlayer } from '../combat/Damage.js';

function eye(x) {
  return [
    { g: G_SPHERE, c: 0xfff3a0, p: [x, 5.7, 2.55], s: [0.75, 0.85, 0.5] },
    { g: G_SPHERE, c: 0xd10f2f, p: [x * 1.05, 5.6, 2.98], s: [0.35, 0.42, 0.25] },
    { g: G_BOX, c: 0x1a0a20, p: [x * 1.0, 6.65, 2.9], s: [1.3, 0.22, 0.2], r: [0, 0, x > 0 ? 0.45 : -0.45] },
  ];
}

export class Boss {
  constructor(G) {
    this.G = G;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55 });
    const body = new THREE.Mesh(buildGeo([
      { g: G_SPHERE, c: 0x7a2dd8, p: [0, 4.2, 0], s: [3.4, 3.6, 3.0] },
      { g: G_SPHERE, c: 0xb98cff, p: [0, 3.6, 1.6], s: [2.2, 2.2, 1.4] },
      { g: G_SPHERE, c: 0x7a2dd8, p: [0, 6.2, 0.4], s: [2.4, 2.0, 2.2] },
      { g: G_CONE, c: 0xff3a3a, p: [-1.9, 8.4, 0], s: [0.65, 2.2, 0.65], r: [0, 0, 0.45] },
      { g: G_CONE, c: 0xff3a3a, p: [1.9, 8.4, 0], s: [0.65, 2.2, 0.65], r: [0, 0, -0.45] },
      ...eye(-1.0), ...eye(1.0),
      { g: G_BOX, c: 0x2a0a20, p: [0, 4.6, 2.75], s: [2.6, 0.9, 0.5] },
      ...[-1, -0.5, 0, 0.5, 1].map(x => ({ g: G_CONE, c: 0xffffff, p: [x * 1.0, 4.95, 3.0], s: [0.16, 0.4, 0.16], r: [Math.PI, 0, 0] })),
      ...[-1.6, -0.8, 0, 0.8, 1.6].map((x, i) => ({ g: G_CONE, c: 0xffd23f, p: [x, 7.0 - Math.abs(x) * 0.3, -1.6], s: [0.4, 1.4, 0.4], r: [-0.5, 0, 0] })),
      { g: G_BOX, c: 0x4a1a90, p: [-1.5, 0.9, 0], s: [1.6, 1.8, 1.8] }, { g: G_BOX, c: 0x4a1a90, p: [1.5, 0.9, 0], s: [1.6, 1.8, 1.8] },
    ]), this.mat);
    const mkArm = (side) => {
      const p = new THREE.Group();
      p.position.set(side * 3.6, 6.0, 0);
      const arm = new THREE.Mesh(buildGeo([
        { g: G_SPHERE, c: 0x7a2dd8, p: [0, -1.5, 0], s: [0.95, 1.9, 0.95] },
        { g: G_SPHERE, c: 0xff5a2a, p: [0, -3.4, 0], s: [1.5, 1.4, 1.5] },
        { g: G_CONE, c: 0xffe14d, p: [-0.7, -3.8, 0.8], s: [0.22, 0.6, 0.22], r: [Math.PI, 0, 0] }, { g: G_CONE, c: 0xffe14d, p: [0.7, -3.8, 0.8], s: [0.22, 0.6, 0.22], r: [Math.PI, 0, 0] },
      ]), this.mat);
      p.add(arm);
      return p;
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    this.root = new THREE.Group();
    this.root.add(body, this.armL, this.armR);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.root.visible = false;
    G.scene.add(this.root);
    this.reset();
  }

  reset() {
    this.state = 'none'; this.stT = 0; this.atkCd = 3; this.rise = 0; this.dead = false; this.deadT = 0;
    this.root.visible = false;
    this.dark = 0; this.charging = false; this.chargeHit = false; this.lastSummon = 0; this.armA = 0; this.impact = 0;
    this.phase = 1;
  }

  scale() { return this.G.diff.dmg; }

  start() {
    const G = this.G, E = G.enemies, A = G.stage.terrain.arena;
    G.bossActive = true; G.bossStarted = true;
    E.spawnBoss(A.x, A.z, { hpMul: 1 + (G.bossCurse ? 0.5 : 0) });
    E.hp[0] = E.maxhp[0] = 5500 * (1 + (G.bossCurse ? 0.5 : 0));
    E.inv[0] = 999;
    this.state = 'enter'; this.stT = 0; this.rise = -13;
    this.root.visible = true;
    G.banner('GIGA BONKER', 'The boss has awakened!');
    G.audio.sfx('boss');
    G.audio.setBoss(true);
    G.shakeCam(0.7);
    // thin the horde
    for (let i = 1; i < E.hi; i++) if (E.active[i] && E.type[i] !== 5 && Math.random() < 0.85) E.kill(i, { noHitstop: true, quiet: true });
  }

  update(dt) {
    const G = this.G, E = G.enemies, P = G.player, T = G.stage.terrain;
    // darkness
    const targetDark = this.state === 'none' ? 0 : this.dead ? 0 : 0.78;
    this.dark = damp(this.dark, targetDark, this.dead ? 1.2 : 0.7, dt);
    if (Math.abs(G.stage.dark - this.dark) > 0.003) G.stage.setDarkness(this.dark);
    if (this.state === 'none') return;

    const t = G.time;
    let x = E.x[0], z = E.z[0];
    E.flash[0] = Math.max(0, E.flash[0] - dt * 7);
    E.squash[0] = Math.max(0, E.squash[0] - dt * 5);
    this.impact = Math.max(0, this.impact - dt * 3);

    if (this.dead) {
      this.deadT += dt;
      this.root.position.y -= dt * 0.6;
      this.root.scale.multiplyScalar(1 - dt * 0.5);
      this.root.rotation.y += dt * 4;
      if (Math.random() < dt * 30) G.particles.burst(x + (Math.random() - 0.5) * 6, E.y[0] + Math.random() * 8, z + (Math.random() - 0.5) * 6, 12, [4, 2, 0.6], 10, 0.3, 0.7);
      if (this.deadT > 2.4) { this.root.visible = false; this.state = 'none'; }
      return;
    }

    const dx = P.x - x, dz = P.z - z, d = Math.hypot(dx, dz) || 1;
    const hpFrac = E.hp[0] / E.maxhp[0];
    const phase = hpFrac > 0.6 ? 1 : hpFrac > 0.25 ? 2 : 3;
    if (phase !== this.phase) {
      this.phase = phase;
      G.banner(phase === 2 ? 'BOSS ENRAGED' : 'FINAL FURY', '');
      G.audio.sfx('boss'); G.shakeCam(0.6);
      G.particles.ringFlat(x, E.y[0], z, 16, 0xff3050, 0.6);
    }
    const spd = 1 + (phase - 1) * 0.28;
    const dmgS = this.scale();
    let armTarget = 0;
    let face = true;

    switch (this.state) {
      case 'enter': {
        this.stT += dt;
        this.rise = Math.min(0, -13 + this.stT * 4.4);
        if (Math.random() < dt * 40) G.particles.burst(x + (Math.random() - 0.5) * 8, E.y[0], z + (Math.random() - 0.5) * 8, 8, [1.2, 1, 0.8], 8, 0.4, 0.8);
        G.shakeCam(0.35);
        armTarget = -0.6;
        if (this.stT > 3.0) { this.state = 'idle'; E.inv[0] = 0; this.atkCd = 1.2; G.hud.showBoss(true); }
        break;
      }
      case 'idle': {
        const move = 3.6 * spd * (this.G.diff.speed > 1 ? 1 : 1);
        if (d > 5.5) { x += dx / d * move * dt; z += dz / d * move * dt; }
        armTarget = Math.sin(t * 3) * 0.35;
        this.atkCd -= dt;
        if (this.atkCd <= 0) this.chooseAttack(d, phase);
        break;
      }
      case 'slam': {
        this.stT -= dt;
        armTarget = -2.7;
        if (this.stT <= 0) { this.state = 'idle'; this.atkCd = 1.5 / spd; }
        break;
      }
      case 'fan': {
        this.stT -= dt;
        armTarget = -1.6;
        if (this.stT <= 0) { this.state = 'idle'; this.atkCd = 1.4 / spd; }
        break;
      }
      case 'windup': { // charge windup, faces the locked direction
        this.stT -= dt; face = false;
        armTarget = -0.4;
        if (this.stT <= 0) { this.state = 'charge'; this.stT = 0.9; this.chargeHit = false; G.audio.sfx('dash'); }
        break;
      }
      case 'charge': {
        this.stT -= dt; face = false;
        const sp = 32 * spd;
        const nx = x + this.cdx * sp * dt, nz = z + this.cdz * sp * dt;
        if (T.heightAt(nx, nz) < -2) { this.stT = 0; } else { x = nx; z = nz; }
        armTarget = 0.6;
        G.particles.burst(x, E.y[0] + 0.3, z, 3, [1.3, 1.1, 0.9], 6, 0.4, 0.6);
        G.shakeCam(0.18);
        if (!this.chargeHit && d < E.r[0] + P.radius + 0.6 && P.y < E.y[0] + 6) { this.chargeHit = true; hurtPlayer(G, 34 * dmgS, x, z); }
        if (this.stT <= 0) { this.state = 'stun'; this.stT = 1.5; G.shakeCam(0.4); G.particles.ringFlat(x, E.y[0], z, 9, 0xffffff, 0.4); G.audio.sfx('slam'); }
        break;
      }
      case 'stun': {
        this.stT -= dt;
        armTarget = 0.9;
        if (Math.random() < dt * 12) G.particles.burst(x, E.y[0] + 9, z, 3, [3, 3, 0.5], 4, 0.2, 0.6);
        if (this.stT <= 0) { this.state = 'idle'; this.atkCd = 1.0; }
        break;
      }
      case 'roar': {
        this.stT -= dt;
        armTarget = -2.0;
        if (this.stT <= 0) { this.state = 'idle'; this.atkCd = 1.6 / spd; }
        break;
      }
    }

    // knockback immune. keep on island, follow ground
    const tt = { x, z };
    if (T.heightAt(x, z) < -2) { x = E.x[0]; z = E.z[0]; }
    E.x[0] = x; E.z[0] = z;
    E.y[0] = T.heightAt(x, z);
    if (face) { let tr = Math.atan2(dx, dz), dr = tr - E.rot[0]; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); E.rot[0] += dr * Math.min(1, dt * 3.5); }
    else if (this.state === 'windup' || this.state === 'charge') E.rot[0] = Math.atan2(this.cdx, this.cdz);

    // contact damage
    if (this.state !== 'enter' && d < E.r[0] + P.radius + 0.2 && P.y < E.y[0] + 5) hurtPlayer(G, 18 * dmgS, x, z);

    // animate
    this.armA = damp(this.armA, armTarget, 8, dt);
    this.armL.rotation.x = this.armA + (this.state === 'idle' ? Math.sin(t * 4) * 0.2 : 0);
    this.armR.rotation.x = this.armA - (this.state === 'idle' ? Math.sin(t * 4) * 0.2 : 0);
    this.armL.rotation.z = -0.2 - (this.state === 'slam' || this.state === 'fan' || this.state === 'roar' ? 0.5 : 0);
    this.armR.rotation.z = 0.2 + (this.state === 'slam' || this.state === 'fan' || this.state === 'roar' ? 0.5 : 0);
    const sq = E.squash[0], im = this.impact;
    const bob = this.state === 'idle' ? Math.abs(Math.sin(t * 4)) * 0.3 : 0;
    this.root.position.set(x, E.y[0] + this.rise + bob, z);
    this.root.rotation.y = E.rot[0];
    this.root.scale.set(1 + sq * 0.08 + im * 0.12, 1 - sq * 0.08 - im * 0.15, 1 + sq * 0.08 + im * 0.12);
    const f = E.flash[0], w = f * 0.9 + (this.state === 'stun' ? 0.25 + Math.sin(t * 30) * 0.15 : 0) + (this.state === 'slam' || this.state === 'fan' || this.state === 'windup' ? 0.15 + 0.15 * Math.sin(t * 25) : 0);
    this.mat.emissive.setRGB(w, w * (this.state === 'stun' ? 1 : 0.35), w * (this.state === 'stun' ? 0.4 : 0.3));
    // hp bar
    G.hud.setBoss(E.hp[0] / E.maxhp[0]);
  }

  chooseAttack(d, phase) {
    const G = this.G, E = G.enemies, P = G.player;
    const opts = ['slam'];
    if (d > 7) opts.push('fan', 'fan');
    if (d > 10) opts.push('charge', 'charge');
    if (d < 9) opts.push('slam');
    if (phase >= 2 && G.time - this.lastSummon > 18) opts.push('summon');
    const a = opts[(Math.random() * opts.length) | 0];
    const dmgS = this.scale();
    const x = E.x[0], z = E.z[0];
    const ph = this.phase;
    if (a === 'slam') {
      this.state = 'slam';
      const n = ph >= 2 ? 3 : 1, gap = 0.55;
      this.stT = 1.25 + (n - 1) * gap;
      G.audio.sfx('telegraph');
      for (let k = 0; k < n; k++) {
        const delay = k * gap;
        setTimeout(() => {
          if (this.dead || G.state === 'DEAD') return;
          const tx = P.x + (k > 0 ? P.vx * 0.35 : 0), tz = P.z + (k > 0 ? P.vz * 0.35 : 0);
          const R = 7.5;
          G.telegraphs.circle(tx, tz, R, 1.15, () => {
            const T = G.stage.terrain, gy = T.heightAt(tx, tz);
            G.particles.ringFlat(tx, gy, tz, R, 0xff5030, 0.45);
            G.particles.burst(tx, gy + 0.5, tz, 34, [3.5, 1.4, 0.4], 13, 0.3, 0.7);
            G.audio.sfx('slam'); G.shakeCam(0.55);
            this.impact = 1; E.squash[0] = 1;
            if (Math.hypot(P.x - tx, P.z - tz) < R + P.radius * 0.5 && P.y < gy + 2.4) hurtPlayer(G, 30 * dmgS, tx, tz);
          }, () => this.dead);
        }, delay * 1000);
      }
    } else if (a === 'fan') {
      this.state = 'fan'; this.stT = 1.5;
      const base = Math.atan2(P.z - z, P.x - x);
      const cnt = ph === 1 ? 5 : ph === 2 ? 7 : 9;
      const spread = ph === 1 ? 0.28 : 0.24;
      G.audio.sfx('telegraph');
      const angles = [];
      for (let k = 0; k < cnt; k++) angles.push(base + (k - (cnt - 1) / 2) * spread);
      angles.forEach((ang, idx) => {
        G.telegraphs.line(x, z, ang, 34, 1.0, 0.95, idx === 0 ? () => {
          if (this.dead) return;
          const fire = (list, off) => list.forEach(a2 => E.fire(E.x[0] + Math.cos(a2 + off) * 3, E.y[0] + 4, E.z[0] + Math.sin(a2 + off) * 3, Math.cos(a2 + off), Math.sin(a2 + off), 15 + ph * 1.5, 14 * dmgS, 4, 0.7));
          fire(angles, 0);
          G.audio.sfx('spit'); G.shakeCam(0.2); this.impact = 0.6;
          if (ph >= 2) setTimeout(() => { if (!this.dead) fire(angles, spread / 2); }, 450);
          if (ph >= 3) setTimeout(() => { if (!this.dead) fire(angles, -spread / 2); }, 900);
        } : null, () => this.dead);
      });
    } else if (a === 'charge') {
      this.state = 'windup'; this.stT = 1.1;
      const dx = P.x - x, dz = P.z - z, l = Math.hypot(dx, dz) || 1;
      this.cdx = dx / l; this.cdz = dz / l;
      G.audio.sfx('telegraph');
      G.telegraphs.line(x, z, Math.atan2(this.cdz, this.cdx), 46, 4.2, 1.1, null, () => this.dead);
    } else if (a === 'summon') {
      this.state = 'roar'; this.stT = 1.4; this.lastSummon = G.time;
      G.audio.sfx('boss'); G.shakeCam(0.5);
      G.particles.ringFlat(x, E.y[0], z, 12, 0xb060ff, 0.6);
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * TAU, px = x + Math.cos(ang) * 9, pz = z + Math.sin(ang) * 9;
        if (G.stage.terrain.heightAt(px, pz) > -1.5) E.spawn(k % 4 === 0 ? 1 : 0, px, pz, { hpMul: 0.7 });
      }
    }
  }

  onDeath(x, y, z) {
    const G = this.G, P = G.player;
    this.dead = true; this.deadT = 0;
    G.bossDead = true; G.bossActive = false;
    G.hud.showBoss(false);
    G.slowmo(0.22, 1.8);
    G.shakeCam(1);
    G.audio.sfx('explode'); G.audio.sfx('boss');
    G.banner('BOSS DEFEATED!', 'The portal is opening...');
    G.particles.ringFlat(x, y, z, 24, 0xffd23f, 0.9);
    G.particles.burst(x, y + 5, z, 120, [4, 2.4, 0.6], 18, 0.4, 1.2);
    for (let k = 0; k < 40; k++) G.gems.spawn(x + (Math.random() - 0.5) * 6, z + (Math.random() - 0.5) * 6, 2, 25);
    for (let k = 0; k < 25; k++) G.gems.spawn(x + (Math.random() - 0.5) * 8, z + (Math.random() - 0.5) * 8, 3, Math.round(6 * P.stats.goldMult));
    const chests = G.bossCurse ? 3 : 1;
    for (let k = 0; k < chests; k++) {
      const a = (k / chests) * TAU + 1, r = 8 + k * 2;
      G.stage.spawnFreeChest(x + Math.cos(a) * r, z + Math.sin(a) * r);
    }
    // clear leftover horde
    const E = G.enemies;
    for (let i = 1; i < E.hi; i++) if (E.active[i]) E.kill(i, { noHitstop: true, quiet: true });
    E.pa.fill(0);
    G.audio.setBoss(false);
    setTimeout(() => {
      if (G.state === 'DEAD') return;
      G.stage.openPortal();
      G.banner('PORTAL OPENED', 'Reach the portal and press E to escape!');
      G.audio.sfx('portal');
      G.toast('Portal open near the boss arena!', '#b58cff');
    }, 2200);
  }
}
