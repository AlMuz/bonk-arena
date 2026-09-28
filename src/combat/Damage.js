import { clamp } from '../util.js';
import { ENEMY_TYPES } from '../enemies/Enemies.js';

// Central damage routing: crits, execute, knockback, hit-stop, numbers, particles.
export function dealDamage(G, i, base, o = {}) {
  const E = G.enemies;
  if (!E.active[i] || E.inv[i] > 0) return 0;
  const P = G.player, st = P.stats;
  let dmg = base * (o.raw ? 1 : P.dmgMult);
  let crit = false;
  if (!o.noCrit && Math.random() < st.crit) { crit = true; dmg *= st.critDmg; }
  const isBoss = E.type[i] === ENEMY_TYPES.boss.id;
  if (st.execute > 0 && !isBoss && E.hp[i] - dmg < E.maxhp[i] * st.execute) dmg = E.hp[i] + 1;
  E.hp[i] -= dmg;
  G.runStats.damage += Math.min(dmg, E.hp[i] + dmg);
  E.flash[i] = 1; E.squash[i] = 1;
  const kb = (o.kb == null ? 5 : o.kb) * st.kb * E.kbRes[i];
  if (kb > 0 && (o.kx || o.kz)) { E.kvx[i] += o.kx * kb; E.kvz[i] += o.kz * kb; }
  const ty = ENEMY_TYPES.list[E.type[i]];
  const py = E.y[i] + (ty.h || 1) * 0.6;
  const col = crit ? [4, 3.2, 0.6] : [2.4, 2.4, 2.4];
  G.particles.burst(E.x[i], py, E.z[i], crit ? 9 : 4, col, crit ? 9 : 6, crit ? 0.2 : 0.14, 0.4);
  G.particles.number(E.x[i], py + (ty.h || 1) * 0.4, E.z[i], dmg, crit, isBoss);
  G.audio.hit(crit, E.type[i]);
  if (crit && !o.noHitstop) G.hitStop(0.055);
  if (crit) G.shakeCam(0.08);
  if (E.hp[i] <= 0) E.kill(i, o);
  return dmg;
}

export function hurtPlayer(G, dmg, sx, sz, o = {}) {
  const P = G.player, st = P.stats;
  if (G.state !== 'PLAYING') return false;
  if (!o.force && P.iframes > 0) return false;
  const d = o.force ? dmg : Math.max(1, dmg * (1 - st.armor / (st.armor + 12)));
  P.hp -= d;
  G.runStats.taken += d;
  if (!o.force) P.iframes = 0.55;
  P.hitAnim = 1; P.flash = 1;
  G.hitStop(0.05);
  G.shakeCam(0.4 + Math.min(0.3, d / 60));
  G.hud.hurt();
  G.audio.sfx('hurt');
  G.particles.number(P.x, P.y + 2.4, P.z, d, false, false, '#ff5a6a');
  if (sx !== undefined && !o.force) {
    const dx = P.x - sx, dz = P.z - sz, l = Math.hypot(dx, dz) || 1;
    P.vx += dx / l * 5; P.vz += dz / l * 5;
  }
  if (st.thorns > 0 && !o.force) {
    const R = 5 + st.thorns * 1.2;
    G.particles.ringFlat(P.x, P.y + 0.2, P.z, R, 0x7dff7d, 0.35);
    const E = G.enemies, n = E.queryCircle(P.x, P.z, R);
    const buf = Array.from(E.qbuf.subarray(0, n));
    for (const i of buf) {
      const dx = E.x[i] - P.x, dz = E.z[i] - P.z, l = Math.hypot(dx, dz) || 1;
      dealDamage(G, i, 22 * st.thorns, { kx: dx / l, kz: dz / l, kb: 10, noHitstop: true });
    }
  }
  if (P.hp <= 0) {
    if (st.revive > 0) {
      P.items.phoenix = (P.items.phoenix || 1) - 1;
      if (P.items.phoenix <= 0) delete P.items.phoenix;
      G.recalc();
      P.hp = P.stats.maxHp * 0.6;
      P.iframes = 2.5;
      G.toast('🔥 Phoenix Feather revives you!', '#ffb02e');
      G.particles.ringFlat(P.x, P.y + 0.2, P.z, 14, 0xffa030, 0.6);
      G.particles.burst(P.x, P.y + 1, P.z, 60, [4, 2, 0.4], 14, 0.3, 0.9);
      G.audio.sfx('levelup');
      const E = G.enemies, n = E.queryCircle(P.x, P.z, 14), buf = Array.from(E.qbuf.subarray(0, n));
      for (const i of buf) { const dx = E.x[i] - P.x, dz = E.z[i] - P.z, l = Math.hypot(dx, dz) || 1; dealDamage(G, i, 200, { kx: dx / l, kz: dz / l, kb: 24, noCrit: true, noHitstop: true }); }
    } else {
      P.hp = 0;
      G.die();
    }
  }
  return true;
}
