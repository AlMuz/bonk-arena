import * as THREE from 'three';
import { clamp, damp, TAU } from '../util.js';
import { baseStats, buildCharacter, animateCharacter, CHARACTERS } from './Characters.js';
import { recalcStats } from '../combat/Items.js';
import { dealDamage, hurtPlayer } from '../combat/Damage.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mouseDown = false;
    this.onLockChange = null;
    this.sens = 0.0024;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Space', 'ControlLeft', 'Tab'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'ControlLeft', 'ControlRight', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => { this.mouseDown = true; if (e.button === 2) this.pressed.add('Mouse2'); });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.mouseDown) { this.mdx += e.movementX; this.mdy += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this._wasLocked;
      this._wasLocked = this.locked;
      if (this.onLockChange) this.onLockChange(this.locked, was);
    });
  }
  get locked() { return document.pointerLockElement === this.canvas; }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ } }
  unlock() { if (this.locked) document.exitPointerLock(); }
  down(...codes) { return codes.some(c => this.keys.has(c)); }
  hit(...codes) { return codes.some(c => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; }
}

const GRAV = 32;
const _g = { x: 0, z: 0 };

export class Player {
  constructor(G, charDef) {
    this.G = G;
    this.def = charDef;
    this.model = buildCharacter(charDef);
    G.scene.add(this.model.root);
    this.radius = 0.55;
    this.x = 0; this.z = 0; this.y = G.stage.terrain.heightAt(0, 0);
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0.42; this.faceYaw = 0;
    this.fx = 0; this.fz = -1;
    this.items = {};
    this.stats = baseStats();
    recalcStats(this);
    this.hp = this.stats.maxHp;
    this.grounded = true; this.sliding = false; this.sprinting = false;
    this.jumpsLeft = this.stats.extraJumps; this.coyote = 0; this.jumpBuf = 0;
    this.iframes = 0; this.dashT = 0; this.dashCdT = 0; this.dashDX = 0; this.dashDZ = 0;
    this.hitAnim = 0; this.flash = 0;
    this.speed = 0; this.groundVy = 0; this.lastGY = this.y;
    this.lastSafe = { x: 0, z: 0 };
    this.safeT = 0; this.slideT = 0; this.slideHitT = 0; this.dmgMult = 1;
    this.time = 0; this.trailT = 0; this.wasSliding = false;
    this.regenBuf = 0;
    // camera state
    this.focus = new THREE.Vector3(0, this.y + 1.6, 0);
    this.fov = 68; this.trauma = 0; this.camDist = 8.5;
    this.camPos = new THREE.Vector3();
    this.moveIn = { x: 0, z: 0 };
  }

  center() { return this.y + 1; }

  update(dt) {
    const G = this.G, inp = G.input, T = G.stage.terrain, st = this.stats;
    this.time += dt;
    // ---- input direction relative to camera yaw
    let ix = 0, iz = 0;
    if (inp.down('KeyW', 'ArrowUp')) iz += 1;
    if (inp.down('KeyS', 'ArrowDown')) iz -= 1;
    if (inp.down('KeyD', 'ArrowRight')) ix += 1;
    if (inp.down('KeyA', 'ArrowLeft')) ix -= 1;
    const il = Math.hypot(ix, iz);
    if (il > 0) { ix /= il; iz /= il; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const dx = -sy * iz + cy * ix, dz = -cy * iz - sy * ix;
    const hasIn = il > 0;
    this.moveIn.x = dx; this.moveIn.z = dz;

    this.sprinting = inp.down('ShiftLeft', 'ShiftRight') && hasIn;
    const maxSpeed = 9.5 * st.moveSpeed * (this.sprinting ? 1.5 : 1);

    // timers
    this.iframes = Math.max(0, this.iframes - dt);
    this.dashCdT = Math.max(0, this.dashCdT - dt);
    this.hitAnim = Math.max(0, this.hitAnim - dt * 4);
    this.flash = Math.max(0, this.flash - dt * 6);
    this.coyote = this.grounded ? 0.12 : this.coyote - dt;
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (inp.hit('Space')) this.jumpBuf = 0.13;

    // regen
    if (this.hp < st.maxHp && this.hp > 0) this.hp = Math.min(st.maxHp, this.hp + st.regen * dt);

    // ---- dash
    if ((inp.hit('KeyQ', 'Mouse2')) && this.dashCdT <= 0 && this.dashT <= 0) {
      let ddx = dx, ddz = dz;
      if (!hasIn) { ddx = this.fx; ddz = this.fz; }
      this.dashDX = ddx; this.dashDZ = ddz;
      this.dashT = 0.2;
      this.dashCdT = 2.4 * st.dashCd;
      this.iframes = Math.max(this.iframes, 0.32);
      G.audio.sfx('dash');
      G.shakeCam(0.12);
      G.particles.burst(this.x, this.y + 0.8, this.z, 14, [1.5, 2.2, 3], 5, 0.18, 0.4);
    }

    // ---- slide
    const wantSlide = inp.down('ControlLeft', 'ControlRight', 'KeyC');
    const wasSliding = this.sliding;
    if (wantSlide && this.grounded && this.dashT <= 0) {
      if (!this.sliding) {
        this.sliding = true;
        const sp0 = Math.hypot(this.vx, this.vz);
        const dirx = sp0 > 2 ? this.vx / sp0 : (hasIn ? dx : this.fx), dirz = sp0 > 2 ? this.vz / sp0 : (hasIn ? dz : this.fz);
        const boost = (3.5 + (this.sprinting ? 2 : 0)) * st.slideBoost;
        this.vx += dirx * boost; this.vz += dirz * boost;
        G.audio.sfx('slide');
      }
    } else if (!wantSlide || !this.grounded) {
      this.sliding = false;
    }

    // ---- jump
    if (this.jumpBuf > 0) {
      const jv = Math.sqrt(2 * GRAV * 2.4 * st.jumpH);
      if (this.grounded || this.coyote > 0) {
        this.vy = jv; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.sliding = false;
        this.jumpsLeft = st.extraJumps;
        this.model.squash = 0; this.stretchT = 1;
        G.audio.sfx('jump');
        G.particles.burst(this.x, this.y + 0.1, this.z, 8, [0.9, 0.9, 0.9], 3, 0.16, 0.35);
      } else if (this.jumpsLeft > 0) {
        this.vy = jv * 0.92; this.jumpsLeft--; this.jumpBuf = 0;
        G.audio.sfx('jump2');
        G.particles.ringFlat(this.x, this.y + 0.1, this.z, 1.6, 0x9be7ff, 0.3);
        G.particles.burst(this.x, this.y + 0.1, this.z, 10, [0.7, 1.5, 3], 3, 0.15, 0.4);
      }
    }

    // ---- horizontal velocity
    const hs = Math.hypot(this.vx, this.vz);
    if (this.dashT > 0) {
      this.dashT -= dt;
      const ds = 32 * (0.9 + 0.1 * st.moveSpeed);
      this.vx = this.dashDX * ds; this.vz = this.dashDZ * ds;
      if (this.dashT <= 0) { const keep = Math.max(maxSpeed * 1.25, 12); this.vx = this.dashDX * keep; this.vz = this.dashDZ * keep; }
      G.particles.trail(this.x, this.y + 0.9, this.z, [1.2, 2.4, 3]);
    } else if (this.grounded) {
      if (this.sliding) {
        T.gradient(this.x, this.z, _g);
        const gm = Math.hypot(_g.x, _g.z);
        const acc = 62 * st.slideBoost;
        this.vx -= _g.x * acc * dt; this.vz -= _g.z * acc * dt;
        if (hasIn) { this.vx += dx * 9 * dt; this.vz += dz * 9 * dt; }
        const decay = 0.55 * (1 - clamp(gm * 2.2, 0, 0.9));
        const f = Math.exp(-decay * dt);
        this.vx *= f; this.vz *= f;
        const cap = 46 * st.slideBoost;
        const s2 = Math.hypot(this.vx, this.vz);
        if (s2 > cap) { this.vx *= cap / s2; this.vz *= cap / s2; }
        if (s2 < 1.5 && gm < 0.05) { /* slid to a stop: stay low */ }
        this.slideT += dt;
      } else {
        const tx = dx * maxSpeed, tz = dz * maxSpeed;
        const over = hs > maxSpeed * 1.05;
        const a = (hasIn ? (over ? 9 : 55) : (over ? 6 : 38)) * dt;
        let ex = tx - this.vx, ez = tz - this.vz;
        const el = Math.hypot(ex, ez);
        if (el > a) { ex = ex / el * a; ez = ez / el * a; }
        this.vx += ex; this.vz += ez;
      }
    } else {
      // air control: steer without losing speed
      if (hasIn) {
        const cur = Math.max(hs, maxSpeed);
        this.vx += dx * 22 * dt; this.vz += dz * 22 * dt;
        const ns = Math.hypot(this.vx, this.vz);
        if (ns > cur) { this.vx *= cur / ns; this.vz *= cur / ns; }
      }
    }

    // ---- integrate horizontal with sub-steps + collision
    const spd = Math.hypot(this.vx, this.vz);
    const steps = Math.max(1, Math.ceil(spd * dt / 0.35));
    const sdt = dt / steps;
    const p = { x: this.x, z: this.z };
    for (let i = 0; i < steps; i++) {
      p.x += this.vx * sdt; p.z += this.vz * sdt;
      const bx = p.x, bz = p.z;
      if (T.resolve(p, this.radius, this.y)) {
        const px = p.x - bx, pz = p.z - bz, pl = Math.hypot(px, pz);
        if (pl > 1e-5) {
          const nx = px / pl, nz = pz / pl, vn = this.vx * nx + this.vz * nz;
          if (vn < 0) { this.vx -= nx * vn * 1.0; this.vz -= nz * vn * 1.0; }
        }
      }
    }
    this.x = p.x; this.z = p.z;
    this.speed = Math.hypot(this.vx, this.vz);

    // ---- vertical / ground
    const gy = T.heightAt(this.x, this.z);
    if (this.grounded) {
      const drop = 0.4 + this.speed * 0.022;
      if (this.y - gy > drop) {
        this.grounded = false;
        this.vy = clamp(this.groundVy, -3, 26);
        this.coyote = 0.1;
      } else {
        const gvy = (gy - this.lastGY) / Math.max(dt, 1e-4);
        this.groundVy = damp(this.groundVy, clamp(gvy, -25, 30), 25, dt);
        this.y = gy;
      }
    }
    if (!this.grounded) {
      this.vy -= GRAV * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        if (this.vy <= 0 || this.y < gy - 0.05) {
          const impact = -this.vy;
          this.y = gy; this.grounded = true;
          this.jumpsLeft = st.extraJumps;
          if (impact > 8) {
            this.model.squash = clamp(impact / 22, 0.3, 1);
            G.audio.sfx('land');
            G.particles.burst(this.x, this.y + 0.1, this.z, 8 + (impact | 0), [0.9, 0.9, 0.85], 3.5, 0.16, 0.4);
            if (impact > 16) G.shakeCam(0.12);
          }
          this.vy = 0; this.groundVy = 0;
        } else { this.y = gy; this.vy = 0; }
      }
    }
    this.lastGY = gy;

    // safe spot + fall
    this.safeT -= dt;
    if (this.grounded && this.safeT <= 0 && gy > -1 && T.slopeAt(this.x, this.z) < 0.6 && Math.hypot(this.x, this.z) < 70) {
      this.lastSafe.x = this.x; this.lastSafe.z = this.z; this.safeT = 0.5;
    }
    if (this.y < -32) this.fallRespawn();

    // facing
    if (this.speed > 1.5) { this.fx = this.vx / this.speed; this.fz = this.vz / this.speed; }
    else { this.fx = -sy; this.fz = -cy; }
    const targetYaw = Math.atan2(this.fx, this.fz);
    let dyw = targetYaw - this.faceYaw;
    dyw = Math.atan2(Math.sin(dyw), Math.cos(dyw));
    this.faceYaw += dyw * (1 - Math.exp(-16 * dt));

    // ---- momentum-based damage mult
    let dm = st.dmg;
    if (st.momentum) dm *= 1 + st.momentum * Math.min(this.speed, 40) * 0.012;
    if (st.berserk) dm *= 1 + st.berserk * (1 - this.hp / st.maxHp);
    this.dmgMult = dm;

    // ---- slide damage aura
    if (this.sliding && st.slideDmg > 0 && this.speed > 6) {
      this.slideHitT -= dt;
      if (this.slideHitT <= 0) {
        this.slideHitT = 0.12;
        const E = G.enemies;
        const n = E.queryCircle(this.x, this.z, 2.4);
        for (let k = 0; k < n; k++) {
          const i = E.qbuf[k];
          const ddx = E.x[i] - this.x, ddz = E.z[i] - this.z, dl = Math.hypot(ddx, ddz) || 1;
          dealDamage(G, i, 9 * st.slideDmg * (this.speed / 12), { kx: ddx / dl, kz: ddz / dl, kb: 6, noHitstop: true });
        }
      }
    }

    // footstep dust while sprinting/sliding
    if (this.grounded && this.speed > 8) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = this.sliding ? 0.04 : 0.11;
        G.particles.burst(this.x, this.y + 0.1, this.z, this.sliding ? 2 : 1, this.sliding ? [1.2, 1.1, 0.9] : [0.9, 0.9, 0.85], this.sliding ? 4 : 2, 0.14, 0.4);
      }
    }

    // ---- model
    const m = this.model;
    m.root.position.set(this.x, this.y, this.z);
    animateCharacter(m, {
      speed: this.speed, grounded: this.grounded, sliding: this.sliding, vy: this.vy, hit: this.hitAnim,
      dashT: this.dashT, time: this.time, yaw: this.faceYaw, flash: this.flash + (this.iframes > 0 && this.hitAnim <= 0 && this.dashT <= 0 ? (Math.sin(this.time * 40) > 0 ? 0.25 : 0) : 0),
    }, dt);
  }

  fallRespawn() {
    const G = this.G;
    this.x = this.lastSafe.x; this.z = this.lastSafe.z;
    this.y = G.stage.terrain.heightAt(this.x, this.z) + 1;
    this.vx = this.vy = this.vz = 0;
    this.grounded = false;
    hurtPlayer(G, this.stats.maxHp * 0.15, this.x, this.z, { force: true, label: 'Fell off!' });
    this.iframes = 1.2;
    G.toast('Fell into the void! -15% HP', '#ff8080');
  }

  // ---------- camera (runs in real time) ----------
  updateCamera(dt) {
    const G = this.G, inp = G.input, cam = G.camera, T = G.stage.terrain;
    this.yaw -= inp.mdx * inp.sens;
    this.pitch = clamp(this.pitch + inp.mdy * inp.sens, -0.25, 1.25);
    const ty = this.y + (this.sliding ? 1.0 : 1.55);
    this.focus.x = damp(this.focus.x, this.x, 22, dt);
    this.focus.z = damp(this.focus.z, this.z, 22, dt);
    this.focus.y = damp(this.focus.y, ty, 9, dt);
    const dist = 8.4 + Math.min(this.speed, 40) * 0.05;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const ox = Math.sin(this.yaw) * cp, oy = sp, oz = Math.cos(this.yaw) * cp;
    // collision-safe distance: march from the focus outwards
    let d = dist;
    for (let s = 1; s <= 10; s++) {
      const t = (s / 10) * dist;
      const cx = this.focus.x + ox * t, cy = this.focus.y + oy * t, cz = this.focus.z + oz * t;
      if (cy < T.heightAt(cx, cz) + 0.45) { d = Math.max(1.6, t - dist / 10); break; }
    }
    this.camDist = damp(this.camDist, d, d < this.camDist ? 30 : 6, dt);
    let cx = this.focus.x + ox * this.camDist, cy = this.focus.y + oy * this.camDist, cz = this.focus.z + oz * this.camDist;
    cy = Math.max(cy, T.heightAt(cx, cz) + 0.5);
    // shake
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const sh = this.trauma * this.trauma;
    const t = performance.now() * 0.05;
    cam.position.set(cx + Math.sin(t * 1.3) * sh * 0.9, cy + Math.cos(t * 1.7) * sh * 0.9, cz + Math.sin(t * 2.1) * sh * 0.9);
    cam.lookAt(this.focus.x + Math.sin(t * 2.7) * sh * 0.4, this.focus.y + 0.3, this.focus.z);
    cam.rotation.z += Math.sin(t * 1.9) * sh * 0.05;
    // fov kick
    const target = 68 + (this.sprinting ? 5 : 0) + (this.sliding ? 8 : 0) + (this.dashT > 0 ? 10 : 0) + Math.min(this.speed, 45) * 0.28;
    this.fov = damp(this.fov, target, 6, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
