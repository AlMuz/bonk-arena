import * as THREE from 'three';
import { mulberry32 } from '../util.js';

const SIZE = 256;

function mk() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return [c, c.getContext('2d')];
}

function toTex(c) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// draw callback at x,y and wrapped copies so the texture tiles
function wrap(x, y, r, fn) {
  for (let dx = -SIZE; dx <= SIZE; dx += SIZE) {
    for (let dy = -SIZE; dy <= SIZE; dy += SIZE) {
      const px = x + dx, py = y + dy;
      if (px + r > 0 && px - r < SIZE && py + r > 0 && py - r < SIZE) fn(px, py);
    }
  }
}

function speckle(ctx, rnd, colors, count, rmin, rmax) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = rmin + rnd() * (rmax - rmin);
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    wrap(x, y, r, (px, py) => ctx.fillRect(px, py, r, r));
  }
}

function blotches(ctx, rnd, colors, count, rmin, rmax, alpha) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = rnd() * SIZE, y = rnd() * SIZE, r = rmin + rnd() * (rmax - rmin);
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    wrap(x, y, r, (px, py) => { ctx.beginPath(); ctx.arc(px, py, r, 0, 6.283); ctx.fill(); });
  }
  ctx.globalAlpha = 1;
}

const cache = {};

export function groundTexture(kind) {
  const key = 'g' + kind;
  if (cache[key]) return cache[key];
  const rnd = mulberry32(kind.length * 977 + kind.charCodeAt(0));
  const [c, ctx] = mk();
  if (kind === 'grass') {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rnd, ['#e6ffd0', '#c9f2a8', '#f4ffe6'], 40, 14, 40, 0.35);
    speckle(ctx, rnd, ['#a8dd7e', '#d8ffb4', '#8fcf68'], 1400, 1.5, 3.5);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 500; i++) {
      const x = rnd() * SIZE, y = rnd() * SIZE, h = 4 + rnd() * 6;
      ctx.strokeStyle = rnd() < 0.5 ? '#78c24e' : '#c6ee98';
      wrap(x, y, 8, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (rnd() - 0.5) * 4, py - h); ctx.stroke(); });
    }
  } else if (kind === 'sand') {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rnd, ['#fff0c2', '#f0d59a'], 40, 16, 44, 0.3);
    speckle(ctx, rnd, ['#e8c882', '#fff8dc', '#d9b56c'], 1600, 1, 3);
    ctx.strokeStyle = 'rgba(200,150,70,.25)'; ctx.lineWidth = 2;
    for (let y = 10; y < SIZE; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
      ctx.stroke();
    }
  } else if (kind === 'snow') {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rnd, ['#d5e8ff', '#eaf4ff', '#c2dcf7'], 50, 14, 44, 0.35);
    speckle(ctx, rnd, ['#ffffff', '#bcd8f5'], 1000, 1, 3);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) { const x = rnd() * SIZE, y = rnd() * SIZE; wrap(x, y, 3, (px, py) => { ctx.fillRect(px, py, 2, 2); ctx.fillRect(px - 2, py + .5, 6, 1); }); }
  } else { // lava rock
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
    blotches(ctx, rnd, ['#b8a8b8', '#8f7f98', '#d0c4d0'], 60, 10, 36, 0.4);
    speckle(ctx, rnd, ['#6d5a74', '#a897b0'], 1000, 1.5, 4);
    ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      let x = rnd() * SIZE, y = rnd() * SIZE, a = rnd() * 6.28;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * 12; y += Math.sin(a) * 12; ctx.lineTo(x, y); }
      ctx.strokeStyle = '#ff9a2a'; ctx.lineWidth = 3.5; ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 8; ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
  return (cache[key] = toTex(c));
}

export function stoneTexture() {
  if (cache.stone) return cache.stone;
  const rnd = mulberry32(4242);
  const [c, ctx] = mk();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
  blotches(ctx, rnd, ['#d8d8e0', '#bfbfcc', '#ececf2'], 60, 10, 32, 0.4);
  ctx.strokeStyle = 'rgba(70,70,90,.55)'; ctx.lineWidth = 2;
  const bh = 42;
  for (let y = 0; y < SIZE; y += bh) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(SIZE, y); ctx.stroke();
    const off = ((y / bh) & 1) * 40;
    for (let x = off; x < SIZE + 80; x += 80) { ctx.beginPath(); ctx.moveTo(x % SIZE, y); ctx.lineTo(x % SIZE, y + bh); ctx.stroke(); }
  }
  speckle(ctx, rnd, ['#9a9aaa', '#f5f5fa', '#8a8a9c'], 900, 1.5, 3.5);
  return (cache.stone = toTex(c));
}

export function rockTexture(kind) {
  const key = 'r' + kind;
  if (cache[key]) return cache[key];
  const rnd = mulberry32(99 + kind.length);
  const [c, ctx] = mk();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
  blotches(ctx, rnd, ['#c9b9a6', '#e0d2c0', '#a8988a'], 70, 10, 36, 0.45);
  ctx.strokeStyle = 'rgba(60,45,40,.4)'; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    let x = rnd() * SIZE, y = rnd() * SIZE;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 40; y += rnd() * 26; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  speckle(ctx, rnd, ['#8a7a6c', '#f0e4d4'], 800, 1.5, 3.5);
  return (cache[key] = toTex(c));
}

export function propTexture() {
  if (cache.prop) return cache.prop;
  const rnd = mulberry32(31337);
  const [c, ctx] = mk();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
  blotches(ctx, rnd, ['#e8e8e8', '#d0d0d0', '#f8f8f8'], 60, 8, 26, 0.35);
  speckle(ctx, rnd, ['#bdbdbd', '#ffffff'], 900, 2, 5);
  return (cache.prop = toTex(c));
}

export function checkerTexture() {
  if (cache.checker) return cache.checker;
  const [c, ctx] = mk();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#c9c9d6';
  const n = 8, s = SIZE / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + y) & 1) ctx.fillRect(x * s, y * s, s, s);
  return (cache.checker = toTex(c));
}
