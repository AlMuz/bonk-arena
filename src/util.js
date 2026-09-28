import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const TAU = Math.PI * 2;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function makeNoise(seed) {
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

export function fbm(noise, x, y, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; f *= 2; a *= 0.5; }
  return s / n;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Merge primitive parts into one vertex-colored geometry.
// part: { g, c, p:[x,y,z], s:number|[x,y,z], r:[rx,ry,rz] }
export function buildGeo(parts) {
  const list = [];
  for (const part of parts) {
    const g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
    _e.set(...(part.r || [0, 0, 0]));
    _q.setFromEuler(_e);
    const s = part.s == null ? [1, 1, 1] : typeof part.s === 'number' ? [part.s, part.s, part.s] : part.s;
    _p.set(...(part.p || [0, 0, 0]));
    _s.set(...s);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    _c.set(part.c);
    for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    list.push(g);
  }
  return mergeGeometries(list);
}

export const G_BOX = new THREE.BoxGeometry(1, 1, 1);
export const G_SPHERE = new THREE.IcosahedronGeometry(1, 1);
export const G_LOWSPHERE = new THREE.IcosahedronGeometry(1, 0);
export const G_CONE = new THREE.ConeGeometry(1, 1, 6);
export const G_CYL = new THREE.CylinderGeometry(1, 1, 1, 7);
export const G_OCT = new THREE.OctahedronGeometry(1, 0);

export function readJSON(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
export function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
}
export function fmtTime(t) {
  t = Math.max(0, Math.ceil(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
}
