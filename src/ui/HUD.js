import { fmtTime } from '../util.js';
import { ITEM_BY_ID, RARITY_COLOR } from '../combat/Items.js';
import { WEAPONS } from '../combat/Weapons.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(G) {
    this.G = G;
    this.el = {
      hud: $('hud'), hpFill: $('hpFill'), hpText: $('hpText'), xpFill: $('xpFill'), lvlText: $('lvlText'), dashFill: $('dashFill'),
      timer: $('timer'), kills: $('kills'), gold: $('gold'), weapons: $('weapons'), items: $('items'), bossWrap: $('bossWrap'), bossFill: $('bossFill'),
      prompt: $('prompt'), banner: $('banner'), toasts: $('toasts'), hurt: $('hurt'), minor: $('minor'),
      cards: $('cards'), lvlSub: $('lvlSub'), rerollN: $('rerollN'), reroll: $('reroll'),
    };
    this.cache = {};
    this._bannerT = 0;
  }

  set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val; fn(val);
  }

  show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== id)); }
  hideScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden')); }
  showHud(v) { this.el.hud.classList.toggle('hidden', !v); }

  update(dt) {
    const G = this.G, P = G.player;
    if (!P) return;
    const e = this.el, st = P.stats;
    this.set('hp', Math.ceil(P.hp) + '/' + Math.ceil(st.maxHp), v => { e.hpText.textContent = v; });
    e.hpFill.style.transform = `scaleX(${Math.max(0, P.hp / st.maxHp).toFixed(3)})`;
    e.xpFill.style.transform = `scaleX(${Math.min(1, G.xp / G.xpNeed).toFixed(3)})`;
    this.set('lvl', 'LV ' + G.level, v => { e.lvlText.textContent = v; });
    e.dashFill.style.transform = `scaleX(${(1 - P.dashCdT / (2.4 * st.dashCd)).toFixed(3)})`;
    this.set('kills', G.kills, v => { e.kills.textContent = v; });
    this.set('gold', Math.floor(G.gold), v => { e.gold.textContent = v; });
    let tl, warn = false;
    if (G.bossStarted && !G.bossDead) { tl = 'BOSS'; warn = true; }
    else if (G.bossDead && !G.endless) tl = 'ESCAPE!';
    else if (G.endless) tl = '∞ ' + fmtTime(G.runTime - G.duration);
    else { tl = fmtTime(G.duration - G.runTime); warn = G.duration - G.runTime < 30; }
    this.set('timer', tl, v => { e.timer.textContent = v; });
    e.timer.classList.toggle('warn', warn);
    // hurt vignette + low hp pulse
    this.hurtA = Math.max(0, (this.hurtA || 0) - dt * 2.2);
    const low = P.hp / st.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(performance.now() * 0.008) : 0;
    e.hurt.style.opacity = Math.max(this.hurtA, low).toFixed(2);
    // minor line (challenge / curse)
    let minor = '';
    if (G.challenge) minor += `⚔ Challenge: ${G.challenge.got}/${G.challenge.need}  ${Math.ceil(G.challenge.t)}s  `;
    if (G.curse) minor += `☠ Curse x${G.curse}  `;
    if (G.bossCurse) minor += `👹 Boss Curse`;
    this.set('minor', minor, v => { e.minor.textContent = v; });
    // banner fade
    if (this._bannerT > 0) { this._bannerT -= dt; if (this._bannerT <= 0) e.banner.style.opacity = 0; }
  }

  refreshIcons() {
    const G = this.G, P = G.player;
    if (!P) return;
    this.el.weapons.innerHTML = G.weapons.list.map(w => `<div class="ico r-${w.level >= 7 ? 'legendary' : w.level >= 5 ? 'epic' : w.level >= 3 ? 'rare' : 'common'}" title="${w.def.name}">${w.def.icon}<small>${w.level}</small></div>`).join('');
    this.el.items.innerHTML = Object.keys(P.items).map(id => { const it = ITEM_BY_ID[id]; return `<div class="ico r-${it.rarity}" title="${it.name}: ${it.desc}">${it.icon}${P.items[id] > 1 ? `<small>${P.items[id]}</small>` : ''}</div>`; }).join('');
  }

  buildHTML() {
    const G = this.G, P = G.player;
    const w = G.weapons.list.map(w => `<div class="ico r-${w.level >= 7 ? 'legendary' : 'rare'}">${w.def.icon}<small>${w.level}</small></div>`).join('');
    const it = Object.keys(P.items).map(id => { const i = ITEM_BY_ID[id]; return `<div class="ico r-${i.rarity}">${i.icon}${P.items[id] > 1 ? `<small>${P.items[id]}</small>` : ''}</div>`; }).join('');
    return w + it;
  }

  hurt() { this.hurtA = 0.85; }

  showBoss(v) { this.el.bossWrap.classList.toggle('hidden', !v); if (v) this.el.bossFill.style.transform = 'scaleX(1)'; }
  setBoss(f) { this.el.bossFill.style.transform = `scaleX(${clamp01(f).toFixed(3)})`; }

  prompt(text) {
    this.set('prompt', text || '', v => { this.el.prompt.textContent = v; this.el.prompt.classList.toggle('hidden', !v); });
  }

  banner(title, sub = '') {
    const b = this.el.banner;
    b.innerHTML = title + (sub ? `<small>${sub}</small>` : '');
    b.style.opacity = 1;
    this._bannerT = 3.2;
  }

  toast(text, color = '#fff') {
    const d = document.createElement('div');
    d.className = 'toast'; d.textContent = text; d.style.borderLeftColor = color;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3300);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
  }

  showCards(choices, level, rerolls) {
    const G = this.G;
    this.el.lvlSub.textContent = `Level ${level} — pick an upgrade (1 / 2 / 3)`;
    this.el.rerollN.textContent = rerolls;
    this.el.reroll.disabled = rerolls <= 0;
    this.el.reroll.style.opacity = rerolls > 0 ? 1 : 0.4;
    this.el.cards.innerHTML = choices.map((c, i) => `
      <div class="card r-${c.rarity}" data-i="${i}">
        <div class="key">${i + 1}</div>
        <div class="em">${c.icon}</div>
        <div class="tag" style="color:${RARITY_COLOR[c.rarity]}">${c.isNew ? 'NEW WEAPON' : c.kind === 'wupg' ? 'WEAPON UPGRADE' : 'ITEM'} · ${c.rarity}</div>
        <h3>${c.name}</h3>
        <p>${c.desc}</p>
        ${c.stacks ? `<p style="opacity:.7">${c.kind === 'item' ? 'Owned: x' + c.stacks : ''}</p>` : ''}
      </div>`).join('');
    this.el.cards.querySelectorAll('.card').forEach(el => el.addEventListener('click', () => G.pickChoice(+el.dataset.i)));
    this.show('levelup');
  }

  statsScreen(target, buildTarget, rows) {
    $(target).innerHTML = rows.map(r => `<span>${r[0]}</span><span>${r[1]}</span>`).join('');
    $(buildTarget).innerHTML = this.buildHTML();
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
