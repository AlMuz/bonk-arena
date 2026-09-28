import { Game } from './Game.js';
import { CHARACTERS, CHAR_ORDER } from './player/Characters.js';
import { THEMES, THEME_ORDER } from './world/Stage.js';
import { fmtTime } from './util.js';

const $ = (id) => document.getElementById(id);
const game = new Game($('view'));
window.__game = game;

function renderBest() {
  const b = game.save.best;
  $('bestTime').textContent = b ? fmtTime(b) : '--';
}

function renderSelect() {
  const s = game.save;
  $('chars').innerHTML = CHAR_ORDER.map(id => {
    const c = CHARACTERS[id], locked = !s.chars[id];
    return `<div class="char ${locked ? 'locked' : ''} ${game.selChar === id ? 'sel' : ''}" data-id="${id}">
      <div class="em">${locked ? '🔒' : c.icon}</div><h3>${c.name}</h3>
      <p>${locked ? c.unlockText : c.desc}</p></div>`;
  }).join('');
  $('chars').querySelectorAll('.char').forEach(el => el.addEventListener('click', () => {
    if (!s.chars[el.dataset.id]) { game.audio.sfx('error'); return; }
    game.selChar = el.dataset.id; game.audio.sfx('click'); renderSelect();
  }));
  $('stages').innerHTML = THEME_ORDER.map(id => {
    const t = THEMES[id], locked = !s.stages[id];
    return `<div class="char ${locked ? 'locked' : ''} ${game.selStage === id ? 'sel' : ''}" data-id="${id}" style="width:170px">
      <div class="em" style="font-size:36px">${locked ? '🔒' : t.icon}</div><h3 style="font-size:16px">${t.name}</h3><p>${t.desc}</p></div>`;
  }).join('');
  $('stages').querySelectorAll('.char').forEach(el => el.addEventListener('click', () => {
    if (!s.stages[el.dataset.id]) { game.audio.sfx('error'); return; }
    game.selStage = el.dataset.id; game.audio.sfx('click');
    game.previewStage(THEMES[game.selStage]);
    renderSelect();
  }));
}

function toTitle() {
  game.state = 'TITLE';
  game.audio.stopMusic();
  game.hud.showHud(false);
  game.player && game.scene.remove(game.player.model.root);
  game.previewStage(THEMES[game.selStage]);
  renderBest();
  game.hud.show('title');
}

$('playBtn').addEventListener('click', () => {
  game.audio.init(); game.audio.sfx('select');
  game.state = 'SELECT';
  renderSelect();
  game.hud.show('select');
});
$('backBtn').addEventListener('click', () => { game.audio.sfx('click'); toTitle(); });
$('startBtn').addEventListener('click', () => game.startRun(game.selChar, game.selStage));
$('reroll').addEventListener('click', () => game.reroll());
$('skip').addEventListener('click', () => game.skip());
$('resumeBtn').addEventListener('click', () => game.resume());
$('pause').addEventListener('click', () => game.resume());
$('deadRestart').addEventListener('click', () => game.startRun(game.selChar, game.selStage));
$('deadMenu').addEventListener('click', toTitle);
$('winRestart').addEventListener('click', () => game.startRun(game.selChar, game.selStage));
$('endless').addEventListener('click', () => game.endlessMode());
$('winMenu').addEventListener('click', toTitle);
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Enter' || e.code === 'Space') && game.state === 'DEAD' && !$('dead').classList.contains('hidden')) game.startRun(game.selChar, game.selStage);
  if (e.code === 'F3') { const el = $('hint'); el.textContent = 'FPS ' + game.fps.toFixed(0) + ' enemies ' + game.enemies.count; }
});

renderBest();
game.hud.show('title');
