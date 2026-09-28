import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { clamp, readJSON, writeJSON, fmtTime, TAU } from './util.js';
import { Stage, THEMES, THEME_ORDER } from './world/Stage.js';
import { Player, Input } from './player/Player.js';
import { CHARACTERS, CHAR_ORDER } from './player/Characters.js';
import { Weapons, WEAPONS } from './combat/Weapons.js';
import { recalcStats, generateChoices, applyChoice, randomItem, giveItem, ITEMS } from './combat/Items.js';
import { Enemies } from './enemies/Enemies.js';
import { Spawner } from './enemies/Spawner.js';
import { Boss } from './enemies/Boss.js';
import { AudioEngine } from './systems/AudioEngine.js';
import { Particles, Gems, Telegraphs } from './systems/Particles.js';
import { HUD } from './ui/HUD.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, tint: { value: new THREE.Vector3(1, 1, 1) }, sat: { value: 1.1 }, contrast: { value: 1.05 }, vig: { value: 0.35 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 tint; uniform float sat; uniform float contrast; uniform float vig; uniform float hurt;
    varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat * (1.0 - hurt * 0.6));
      col = max((col - 0.18) * contrast + 0.18, 0.0);
      float d = length(vUv - 0.5) * 1.4;
      col *= 1.0 - vig * smoothstep(0.45, 1.05, d);
      col += vec3(0.5, 0.0, 0.05) * hurt * smoothstep(0.3, 1.0, d);
      gl_FragColor = vec4(col, c.a);
    }`,
};

const SAVE_KEY = 'bonk_arena_save';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 700);
    this.scene.add(this.camera);

    // post
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.55, 1.05);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD(this);
    this.particles = new Particles(this);
    this.gems = new Gems(this);
    this.telegraphs = new Telegraphs(this);
    this.enemies = new Enemies(this);
    this.weapons = new Weapons(this);
    this.spawner = new Spawner(this);
    this.boss = new Boss(this);

    this.state = 'TITLE';
    this.time = 0; this.runTime = 0; this.duration = 480;
    this.hitstopT = 0; this.slowT = 0; this.slowScale = 1;
    this.diff = { hp: 1, speed: 1, dmg: 1 };
    this.curse = 0; this.bossCurse = false; this.bossStarted = false; this.bossActive = false; this.bossDead = false; this.endless = false;
    this.kills = 0; this.gold = 0; this.xp = 0; this.level = 1; this.xpNeed = 9; this.pending = 0; this.rerolls = 3;
    this.runStats = { damage: 0, kills: 0, taken: 0 };
    this.save = readJSON(SAVE_KEY, { chars: {}, stages: {}, best: 0 });
    this.save.chars.bonk = true; this.save.stages.meadow = true;
    this.selChar = 'bonk'; this.selStage = 'meadow';
    this.player = null; this.stage = null;
    this.choices = []; this.newUnlocks = [];
    this.last = performance.now();
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;

    this.input.onLockChange = (locked, was) => {
      if (!locked && was && this.state === 'PLAYING') this.pause();
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'PLAYING' && !this.input.locked) this.pause();
      if (this.state === 'LEVEL_UP') {
        if (e.code === 'Digit1') this.pickChoice(0);
        else if (e.code === 'Digit2') this.pickChoice(1);
        else if (e.code === 'Digit3') this.pickChoice(2);
        else if (e.code === 'KeyR') this.reroll();
      }
    });
    canvas.addEventListener('click', () => {
      if (this.state === 'PLAYING' && !this.input.locked) this.input.lock();
    });
    window.addEventListener('resize', () => this.resize());
    this.previewStage(THEMES.meadow);
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- helpers used across systems ----------
  shakeCam(a) { if (this.player) this.player.trauma = Math.min(1, this.player.trauma + a); }
  hitStop(s) { this.hitstopT = Math.max(this.hitstopT, Math.min(0.09, s)); }
  slowmo(scale, dur) { this.slowScale = scale; this.slowT = dur; }
  banner(t, s) { this.hud.banner(t, s); }
  toast(t, c) { this.hud.toast(t, c); }
  recalc() { recalcStats(this.player); this.hud.refreshIcons(); }
  addGold(v) { this.gold += v; }

  xpFor(level) { return Math.floor(5 + level * 3.2 + Math.pow(level, 1.55) * 1.1); }
  addXp(v) {
    this.xp += v * this.player.stats.xpMult;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = this.xpFor(this.level);
      this.pending++;
    }
    this.checkUnlocks();
  }

  onKill() {
    if (this.challenge) {
      this.challenge.got++;
      if (this.challenge.got >= this.challenge.need) this.finishChallenge(true);
    }
    if (this.runStats.kills % 25 === 0) this.checkUnlocks();
  }

  // ---------- unlocks ----------
  checkUnlocks() {
    const s = this.save;
    const unlock = (id, msg) => { if (!s.chars[id]) { s.chars[id] = true; writeJSON(SAVE_KEY, s); this.toast('🔓 Unlocked ' + CHARACTERS[id].name + '!', '#b6ff5c'); this.newUnlocks.push(CHARACTERS[id].name); } };
    if (this.level >= 8) unlock('zippy');
    if (this.runStats.kills >= 250) unlock('tortle');
  }

  // ---------- stage / preview ----------
  disposeStage() {
    if (!this.stage) return;
    this.scene.remove(this.stage.group);
    this.stage.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.stage = null;
  }

  previewStage(theme) {
    this.disposeStage();
    this.stage = new Stage(this, theme, (Math.random() * 100000) | 0);
    this.applyGrade(theme);
    this.player = null;
    this.stage.followSun(0, 0);
  }

  applyGrade(theme) {
    const g = theme.grade, u = this.grade.uniforms;
    u.tint.value.set(g.tint[0], g.tint[1], g.tint[2]);
    u.sat.value = g.sat; u.contrast.value = g.contrast;
    this.bloom.threshold = theme.id === 'snow' ? 1.5 : theme.id === 'desert' ? 1.25 : 1.05;
  }

  // ---------- run lifecycle ----------
  startRun(charId, stageId) {
    this.audio.init();
    const theme = THEMES[stageId] || THEMES.meadow;
    this.selChar = charId; this.selStage = stageId;
    if (this.player) { this.scene.remove(this.player.model.root); }
    this.disposeStage();
    this.stage = new Stage(this, theme, (Math.random() * 1e6) | 0);
    this.applyGrade(theme);
    this.stage.setDarkness(0);
    this.time = 0; this.runTime = 0;
    this.kills = 0; this.gold = 10; this.xp = 0; this.level = 1; this.xpNeed = this.xpFor(1); this.pending = 0; this.rerolls = 3;
    this.curse = 0; this.bossCurse = false; this.bossStarted = false; this.bossActive = false; this.bossDead = false; this.endless = false; this.hintShrines = false;
    this.challenge = null; this.chestsOpened = 0; this.swarmActive = 0;
    this.diff = { hp: 1, speed: 1, dmg: 1 };
    this.runStats = { damage: 0, kills: 0, taken: 0 };
    this.newUnlocks = [];
    this.hitstopT = 0; this.slowT = 0;
    this.enemies.reset(); this.particles.reset(); this.gems.reset(); this.telegraphs.reset(); this.weapons.reset(); this.spawner.reset(); this.boss.reset();
    this.player = new Player(this, CHARACTERS[charId]);
    this.weapons.add(CHARACTERS[charId].weapon);
    this.hud.refreshIcons();
    this.hud.showBoss(false);
    this.hud.hideScreens(); this.hud.showHud(true);
    this.state = 'PLAYING';
    this.input.lock();
    this.audio.stopMusic(); this.audio.setBoss(false); this.audio.setIntensity(0);
    this.audio.startMusic(false);
    this.banner('SURVIVE', 'Slide, jump, and bonk the horde!');
    this.stage.followSun(0, 0);
    // camera behind spawn
    this.player.yaw = Math.random() * TAU; this.player.pitch = 0.42;
    this.player.focus.set(0, this.player.y + 1.6, 0);
  }

  pause() {
    if (this.state !== 'PLAYING') return;
    this.state = 'PAUSED';
    this.hud.show('pause');
  }
  resume() {
    if (this.state !== 'PAUSED') return;
    this.state = 'PLAYING';
    this.hud.hideScreens();
    this.input.lock();
    this.last = performance.now();
  }

  enterLevelUp() {
    this.state = 'LEVEL_UP';
    this.input.unlock();
    this.audio.sfx('levelup');
    const P = this.player;
    this.particles.ringFlat(P.x, P.y + 0.2, P.z, 8, 0xffd23f, 0.5);
    this.particles.burst(P.x, P.y + 1, P.z, 30, [4, 3, 0.6], 10, 0.2, 0.8);
    this.choices = generateChoices(this, 3);
    this.hud.showCards(this.choices, this.level - this.pending + 1, this.rerolls);
  }

  pickChoice(i) {
    if (this.state !== 'LEVEL_UP' || !this.choices[i]) return;
    applyChoice(this, this.choices[i]);
    this.afterChoice();
  }
  reroll() {
    if (this.state !== 'LEVEL_UP' || this.rerolls <= 0) return;
    this.rerolls--;
    this.audio.sfx('click');
    this.choices = generateChoices(this, 3);
    this.hud.showCards(this.choices, this.level - this.pending + 1, this.rerolls);
  }
  skip() {
    if (this.state !== 'LEVEL_UP') return;
    this.gold += 15; this.toast('+15 gold', '#ffd23f');
    this.audio.sfx('coin');
    this.afterChoice();
  }
  afterChoice() {
    this.pending--;
    if (this.pending > 0) {
      this.choices = generateChoices(this, 3);
      this.hud.showCards(this.choices, this.level - this.pending + 1, this.rerolls);
    } else {
      this.state = 'PLAYING';
      this.hud.hideScreens();
      this.input.lock();
      this.last = performance.now();
    }
  }

  buildRows() {
    const r = this.runStats;
    return [
      ['Time survived', fmtTime(this.runTime)], ['Kills', this.kills], ['Level reached', this.level],
      ['Damage dealt', Math.round(r.damage).toLocaleString()], ['Damage taken', Math.round(r.taken).toLocaleString()], ['Gold', Math.floor(this.gold)],
    ];
  }

  die() {
    if (this.state !== 'PLAYING') return;
    this.state = 'DEAD';
    this.audio.sfx('death'); this.audio.stopMusic();
    this.input.unlock();
    this.hud.prompt('');
    this.checkUnlocks();
    this.save.best = Math.max(this.save.best || 0, this.runTime);
    writeJSON(SAVE_KEY, this.save);
    this.slowmo(0.25, 1.0);
    setTimeout(() => {
      if (this.state !== 'DEAD') return;
      this.hud.statsScreen('deadStats', 'deadBuild', this.buildRows());
      this.hud.show('dead');
    }, 1100);
  }

  win() {
    if (this.state !== 'PLAYING') return;
    this.state = 'VICTORY';
    this.audio.sfx('victory'); this.audio.stopMusic();
    this.input.unlock();
    this.hud.prompt('');
    const s = this.save;
    s.best = Math.max(s.best || 0, this.runTime);
    let msg = [];
    if (!s.chars.orbi) { s.chars.orbi = true; msg.push('Unlocked Orbi!'); }
    const idx = THEME_ORDER.indexOf(this.stage.theme.id);
    const next = THEME_ORDER[idx + 1];
    if (next && !s.stages[next]) { s.stages[next] = true; msg.push('Unlocked stage: ' + THEMES[next].name + '!'); }
    writeJSON(SAVE_KEY, s);
    document.getElementById('unlockMsg').textContent = msg.join('  ');
    this.hud.statsScreen('winStats', 'winBuild', this.buildRows());
    setTimeout(() => this.hud.show('victory'), 900);
  }

  endlessMode() {
    if (this.state !== 'VICTORY') return;
    this.endless = true;
    this.state = 'PLAYING';
    this.hud.hideScreens();
    this.input.lock();
    this.audio.startMusic(false);
    this.banner('ENDLESS MODE', 'Enemies scale forever');
    this.last = performance.now();
  }

  // ---------- interactions ----------
  chestCost() { return Math.round(20 * (1 + 0.45 * this.chestsOpened)); }

  interact(o) {
    const P = this.player, st = this.stage;
    if (o.kind === 'chest') {
      const cost = o.free ? 0 : this.chestCost();
      if (this.gold < cost) { this.toast(`Need ${cost} gold`, '#ff8080'); this.audio.sfx('error'); return; }
      this.gold -= cost; o.opened = true;
      if (!o.free) this.chestsOpened++;
      const item = randomItem(P, o.free ? 30 : 12, o.free ? 1 : 0);
      giveItem(this, item);
      this.audio.sfx('chest');
      this.toast(`${item.icon} ${item.name} (${item.rarity}) — ${item.desc}`, '#ffd23f');
      this.particles.burst(o.x, o.y + 1.2, o.z, 40, [4, 3, 0.6], 11, 0.2, 0.9);
      this.particles.ringFlat(o.x, o.y, o.z, 4, 0xffd23f, 0.5);
      for (let k = 0; k < 6; k++) this.gems.spawn(o.x, o.z, 3, Math.round(3 * P.stats.goldMult), o.y + 1.2);
      if (o.mesh) o.mesh.position.y = o.y;
    } else if (o.kind === 'shrine') {
      if (o.type === 'curse') {
        o.used = true; this.curse++;
        const item = randomItem(P, 30, 2);
        giveItem(this, item);
        this.toast(`☠ Cursed! Foes +25%. Gained ${item.icon} ${item.name}`, '#c05bff');
        this.banner('CURSED', 'Enemies grow stronger');
        this.shakeCam(0.6);
      } else if (o.type === 'blood') {
        const cost = P.stats.maxHp * 0.3;
        if (P.hp <= cost + 1) { this.toast('Not enough HP for the Blood Shrine', '#ff8080'); this.audio.sfx('error'); return; }
        o.used = true; P.hp -= cost; P.hitAnim = 1; P.flash = 1;
        const item = randomItem(P, 15, 1);
        giveItem(this, item);
        this.toast(`🩸 Sacrificed ${Math.round(cost)} HP. Gained ${item.icon} ${item.name}`, '#ff5a6a');
        this.hud.hurt();
      } else if (o.type === 'challenge') {
        if (this.challenge) { this.toast('A challenge is already running!', '#ff8080'); this.audio.sfx('error'); return; }
        o.used = true;
        this.challenge = { need: 30, got: 0, t: 35, shrine: o };
        this.banner('CHALLENGE!', 'Slay 30 foes in 35 seconds');
        for (let k = 0; k < 28; k++) {
          const pos = this.spawner.spawnPos(14, 22);
          if (pos) this.enemies.spawn(k % 4 === 0 ? 1 : 0, pos.x, pos.z, { hpMul: 0.8 });
        }
      }
      this.audio.sfx('shrine');
      this.particles.ringFlat(o.x, o.y, o.z, 7, o.color, 0.6);
      this.particles.burst(o.x, o.y + 4, o.z, 40, [3, 2, 3], 10, 0.2, 0.9);
    } else if (o.kind === 'altar') {
      o.used = true; this.bossCurse = true;
      this.toast('👹 Boss Curse! Foes and the boss are stronger — but drops are better.', '#ff5a6a');
      this.audio.sfx('boss'); this.shakeCam(0.6);
      this.particles.ringFlat(o.x, o.y, o.z, 16, 0xff3050, 0.7);
    } else if (o.kind === 'portal') {
      this.win();
    }
  }

  finishChallenge(ok) {
    const c = this.challenge; this.challenge = null;
    if (ok) {
      this.stage.spawnFreeChest(c.shrine.x + 3, c.shrine.z + 3);
      this.banner('CHALLENGE COMPLETE', 'A golden chest appeared!');
      this.audio.sfx('levelup');
    } else {
      this.toast('Challenge failed…', '#ff8080');
      this.audio.sfx('error');
    }
  }

  // ---------- simulation ----------
  simulate(dt) {
    this.time += dt;
    this.runTime += dt;
    const P = this.player, st = this.stage, inp = this.input;
    P.update(dt);
    // interaction
    const near = st.nearest(P.x, P.z);
    let text = '';
    if (near) {
      if (near.kind === 'chest') text = near.free ? '[E] Open Golden Chest (free!)' : `[E] Open chest — ${this.chestCost()} gold`;
      else if (near.kind === 'shrine') text = `[E] ${near.name}: ${near.hint}`;
      else if (near.kind === 'altar') text = this.bossStarted ? '' : `[E] ${near.name}: ${near.hint}`;
      else if (near.kind === 'portal') text = '[E] Enter the portal!';
      if (near.kind === 'altar' && this.bossStarted) near.used = true;
    }
    this.hud.prompt(text);
    if (text && inp.hit('KeyE')) this.interact(near);

    this.spawner.update(dt);
    this.enemies.update(dt);
    this.boss.update(dt);
    this.weapons.update(dt);
    this.gems.update(dt);
    this.telegraphs.update(dt);
    this.particles.update(dt);
    st.update(dt, this.time);
    if (this.challenge) { this.challenge.t -= dt; if (this.challenge.t <= 0) this.finishChallenge(false); }
    this.audio.setIntensity(this.bossStarted ? 1 : clamp(this.runTime / this.duration, 0, 1));

    if (this.pending > 0 && this.state === 'PLAYING') this.enterLevelUp();
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }
    const inp = this.input;
    try {
      if (this.state === 'PLAYING') {
        let sdt = dt;
        if (this.slowT > 0) { this.slowT -= dt; sdt = dt * this.slowScale; }
        if (this.hitstopT > 0) { this.hitstopT -= dt; sdt = 0; }
        if (sdt > 0) this.simulate(sdt);
        this.player.updateCamera(dt);
        this.stage.followSun(this.player.x, this.player.z);
        this.enemies.render();
        this.particles.updateNumbers(dt, this.camera);
        this.hud.update(dt);
      } else if (this.state === 'TITLE' || this.state === 'SELECT') {
        const t = performance.now() * 0.00008;
        this.camera.position.set(Math.cos(t) * 75, 34, Math.sin(t) * 75);
        this.camera.lookAt(0, 4, 0);
        this.camera.fov = 62; this.camera.updateProjectionMatrix();
        this.stage.update(dt, performance.now() * 0.001);
        this.stage.followSun(0, 0);
      } else if (this.player) {
        // paused / level-up / dead / victory: keep visuals alive
        if (this.state === 'DEAD' || this.state === 'VICTORY') {
          let sdt = dt;
          if (this.slowT > 0) { this.slowT -= dt; sdt = dt * this.slowScale; }
          this.particles.update(sdt); this.telegraphs.update(sdt);
          this.stage.update(sdt, this.time);
        }
        this.player.updateCamera(dt);
        this.stage.followSun(this.player.x, this.player.z);
        this.enemies.render();
        this.particles.updateNumbers(dt, this.camera);
        this.hud.update(0);
      }
      this.grade.uniforms.hurt.value = this.player && this.state === 'PLAYING' ? Math.max(0, (this.hud.hurtA || 0) * 0.5) : 0;
      this.composer.render(dt);
    } catch (e) {
      console.error(e);
    }
    inp.endFrame();
  }
}
