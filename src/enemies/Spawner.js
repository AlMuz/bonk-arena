import { ENEMY_TYPES } from './Enemies.js';
import { TAU } from '../util.js';

const T = ENEMY_TYPES;

export class Spawner {
  constructor(G) { this.G = G; this.reset(); }

  reset() {
    this.acc = 0;
    this.fired = {};
    this.hintUntil = 0;
  }

  spawnPos(minR, maxR, ang) {
    const G = this.G, P = G.player, Tn = G.stage.terrain;
    for (let k = 0; k < 8; k++) {
      const a = ang != null ? ang : Math.random() * TAU, d = minR + Math.random() * (maxR - minR);
      const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
      if (Tn.heightAt(x, z) > -1.5 && Math.hypot(x, z) < 96) return { x, z };
      if (ang != null) break;
    }
    return null;
  }

  pickType(t) {
    const w = [[0, 100]];
    if (t > 45) w.push([1, 35]);
    if (t > 100) w.push([3, 18]);
    if (t > 130) w.push([2, 13]);
    if (t > 200) w.push([4, 16]);
    if (t > 360) { w[0][1] = 70; w.forEach(x => { if (x[0] !== 0) x[1] *= 1.6; }); }
    let sum = 0; for (const x of w) sum += x[1];
    let r = Math.random() * sum;
    for (const x of w) { r -= x[1]; if (r <= 0) return x[0]; }
    return 0;
  }

  update(dt) {
    const G = this.G, E = G.enemies, t = G.runTime;
    const min = t / 60;
    const cu = G.curse, bc = G.bossCurse ? 1 : 0;
    G.diff.hp = (1 + min * 0.3 + min * min * 0.012) * (1 + 0.25 * cu) * (1 + 0.4 * bc);
    G.diff.speed = Math.min(1.4, 1 + min * 0.03) * (1 + 0.04 * cu);
    G.diff.dmg = (1 + min * 0.1) * (1 + 0.15 * cu) * (1 + 0.35 * bc);

    // ---- scripted beats (each fires once, never back-to-back)
    const f = this.fired;
    if (!f.elite1 && t >= 60) { f.elite1 = 1; this.spawnElite(1); G.banner('ELITE APPROACHES', 'Slay it for a golden chest'); G.audio.sfx('boss'); }
    if (!f.swarm && t >= 150) { f.swarm = 1; this.swarm(); }
    if (!f.hint && t >= 240) { f.hint = 1; G.hintShrines = true; this.hintUntil = t + 30; G.banner('SHRINES AWAKEN', 'Curse or challenge for loot'); G.audio.sfx('shrine'); }
    if (G.hintShrines && t > this.hintUntil) G.hintShrines = false;
    if (!f.elite2 && t >= 360) { f.elite2 = 1; this.spawnElite(3); G.banner('ELITE WAVE', 'Faster foes have arrived'); G.audio.sfx('boss'); }
    if (!f.boss && t >= G.duration && !G.bossDead) { f.boss = 1; G.boss.start(); }

    // ---- regular trickle
    let desired = t < 60 ? 5 + t * 0.25 : 20 + (t - 60) * 0.7;
    if (G.endless) desired = Math.min(380, 300 + (t - G.duration) * 0.15);
    desired = Math.min(desired * (1 + 0.12 * cu), 390);
    if (G.bossActive) desired = Math.min(desired * 0.18, 40);
    if (G.swarmActive > 0) G.swarmActive -= dt;
    const deficit = desired - E.count;
    if (deficit > 0) {
      const rate = Math.min(6 + t * 0.06, Math.max(1.2, deficit * 0.9));
      this.acc += dt * rate;
      while (this.acc >= 1) {
        this.acc -= 1;
        const type = this.pickType(t);
        const group = type === 0 && t > 90 ? 1 + ((Math.random() * 3) | 0) : 1;
        const base = Math.random() * TAU;
        const pos = this.spawnPos(32, 46, base);
        if (!pos) continue;
        for (let k = 0; k < group; k++) {
          E.spawn(type, pos.x + (Math.random() - 0.5) * 3, pos.z + (Math.random() - 0.5) * 3);
        }
      }
    } else this.acc = 0;

    // cleanup: enemies that ended up far away are teleported closer
    if ((this._far = (this._far || 0) + dt) > 1.0) {
      this._far = 0;
      const P = G.player;
      for (let i = 1; i < E.hi; i++) {
        if (!E.active[i] || E.type[i] === 5) continue;
        if (Math.hypot(E.x[i] - P.x, E.z[i] - P.z) > 75) {
          const pos = this.spawnPos(34, 44);
          if (pos) { E.x[i] = pos.x; E.z[i] = pos.z; }
        }
      }
    }
  }

  spawnElite(n) {
    const G = this.G, E = G.enemies;
    for (let k = 0; k < n; k++) {
      const pos = this.spawnPos(28, 38, Math.random() * TAU) || this.spawnPos(28, 38);
      if (pos) E.spawn(5, pos.x, pos.z, { hpMul: n > 1 ? 1.4 : 1 });
    }
  }

  swarm() {
    const G = this.G, E = G.enemies;
    G.banner('SWARM INCOMING!', 'RUN! Break through the ring!');
    G.audio.sfx('boss');
    G.shakeCam(0.4);
    G.swarmActive = 25;
    const n = 80, gap = Math.random() * TAU;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU;
      const dA = Math.atan2(Math.sin(a - gap), Math.cos(a - gap));
      if (Math.abs(dA) < 0.22) continue; // one gap to escape through
      const pos = this.spawnPos(27, 27.5, a);
      if (!pos) continue;
      E.spawn(k % 3 === 0 ? 1 : 0, pos.x, pos.z, { speedMul: 1.25, hpMul: 0.9 });
    }
  }
}
