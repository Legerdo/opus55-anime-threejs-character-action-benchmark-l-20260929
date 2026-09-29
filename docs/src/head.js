// Head: sculpted anime skull, layered eyes (sclera/iris/pupil/highlight/lash/lid), face details, hair.
import * as THREE from '../vendor/three.module.js';
import {
  DEG, clamp, lerp, smoothstep, v3, profile, sweep, mergeGeos, colorize, weldNormals,
  skinAlongChain, sph, smoothNormalClone,
} from './util.js';
import { canvasTexture, hairToon, toon } from './materials.js';

export const HEAD_C = v3(0, 0.135, 0.0);
export const HEAD_R = 0.112;
const R = HEAD_R, C = HEAD_C;

// Sphere direction -> sculpted head surface (head-local).
export function headDeform(n) {
  let x = n.x * R, y = n.y * R * 1.05, z = n.z * R;
  const lower = smoothstep(0.12, -1.0, n.y);
  const front = smoothstep(-0.25, 0.8, n.z);
  // jaw taper toward a soft pointed chin
  x *= 1 - lower * lower * (0.22 + 0.36 * front);
  y -= R * 0.30 * Math.pow(lower, 1.6) * front;
  z += R * 0.04 * lower * front;
  // lower back of skull tucks into the neck
  const back = smoothstep(0.1, -0.8, n.z);
  z *= 1 - 0.18 * lower * back;
  // soft cheeks
  x *= 1 + 0.05 * Math.exp(-((n.y + 0.38) ** 2) / 0.03) * front;
  // flatter anime face plane, slightly rounder forehead
  z -= R * 0.07 * smoothstep(0.35, 1.0, n.z) * (1 - lower * 0.6);
  z += R * 0.02 * Math.exp(-((n.y - 0.35) ** 2) / 0.05) * front;
  // cranium volume at the back
  if (n.z < 0) z *= 1.05;
  return v3(x + C.x, y + C.y, z + C.z);
}

// Point + normal on the front of the face at head-local (x, y).
export function faceSurface(x, y) {
  const n = v3((x - C.x) / R, (y - C.y) / (R * 1.05), 0);
  const fix = () => {
    n.z = Math.sqrt(Math.max(0.0025, 1 - n.x * n.x - n.y * n.y));
    n.normalize();
  };
  fix();
  for (let i = 0; i < 24; i++) {
    const p = headDeform(n);
    n.x += ((x - p.x) / R) * 0.9;
    n.y += ((y - p.y) / R) * 0.9;
    fix();
  }
  return { p: headDeform(n), dir: n.clone() };
}
function surfNormal(x, y) {
  const h = 0.0015;
  const a = faceSurface(x + h, y).p, b = faceSurface(x - h, y).p;
  const c = faceSurface(x, y + h).p, d = faceSurface(x, y - h).p;
  return new THREE.Vector3().crossVectors(a.sub(b), c.sub(d)).normalize();
}
export function surfaceAt(x, y, off = 0) {
  const p = faceSurface(x, y).p;
  const n = surfNormal(x, y);
  return { p: p.addScaledVector(n, off), n };
}

// ---------------------------------------------------------------- eyes
const EYE = { cx: 0.043, cy: 0.093, W: 0.047, H: 0.054, tilt: 6 * DEG };
const eyeTop = (u) => lerp(0.46, 0.72, u) + 0.36 * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.8);
const eyeBot = (u) => lerp(0.48, 0.66, u) - 0.62 * Math.pow(Math.sin(Math.PI * clamp(u, 0, 1)), 0.62);
const eyeClosed = (u) => lerp(0.36, 0.44, u) - 0.07 * Math.sin(Math.PI * clamp(u, 0, 1));

// eye (u,v) -> head-local x,y (side: +1 = character left / +X)
function eyeXY(side, u, v) {
  const lu = (u - 0.5) * EYE.W, lv = (v - 0.5) * EYE.H;
  const c = Math.cos(EYE.tilt), s = Math.sin(EYE.tilt);
  const ru = lu * c - lv * s, rv = lu * s + lv * c; // outer corner raised
  return [side * (EYE.cx + ru), EYE.cy + rv];
}

function eyeGrid(side, off, nu = 18, nv = 18, uvRange = [0, 1, 0, 1]) {
  const pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = lerp(uvRange[0], uvRange[1], i / nu), v = lerp(uvRange[2], uvRange[3], j / nv);
      const [x, y] = eyeXY(side, u, v);
      const s = surfaceAt(x, y, off);
      pos.push(s.p.x, s.p.y, s.p.z); nor.push(s.n.x, s.n.y, s.n.z);
      uv.push((i / nu), (j / nv));
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function scleraPath(ctx, S) {
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) { const u = i / 60; ctx.lineTo(u * S, (1 - eyeTop(u)) * S); }
  for (let i = 60; i >= 0; i--) { const u = i / 60; ctx.lineTo(u * S, (1 - eyeBot(u)) * S); }
  ctx.closePath();
}

function eyeTextures() {
  const S = 256;
  const sclera = canvasTexture(S, S, (ctx) => {
    scleraPath(ctx, S); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#b9b3dc'); g.addColorStop(0.35, '#e9e6f6'); g.addColorStop(0.6, '#ffffff'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  });
  const iris = canvasTexture(S, S, (ctx) => {
    scleraPath(ctx, S); ctx.clip();
    const cx = 0.53 * S, cy = (1 - 0.47) * S, rx = 0.31 * S, ry = 0.43 * S;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rx / ry, 1);
    const g = ctx.createLinearGradient(0, -ry, 0, ry);
    g.addColorStop(0, '#4a0620'); g.addColorStop(0.28, '#9c1636'); g.addColorStop(0.55, '#e0433e');
    g.addColorStop(0.8, '#ff9c3a'); g.addColorStop(1, '#ffd77a');
    ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    // radial streaks
    ctx.globalAlpha = 0.28; ctx.strokeStyle = '#ffd2a0'; ctx.lineWidth = 3;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * ry * 0.35, Math.sin(a) * ry * 0.35);
      ctx.lineTo(Math.cos(a) * ry * 0.9, Math.sin(a) * ry * 0.9); ctx.stroke();
    }
    // lower glow crescent
    ctx.globalAlpha = 0.55;
    const g2 = ctx.createRadialGradient(0, ry * 0.55, 2, 0, ry * 0.55, ry * 0.6);
    g2.addColorStop(0, '#fff0b0'); g2.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, ry, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 9; ctx.strokeStyle = '#3c0618';
    ctx.beginPath(); ctx.arc(0, 0, ry - 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  });
  const pupil = canvasTexture(S, S, (ctx) => {
    scleraPath(ctx, S); ctx.clip();
    ctx.fillStyle = '#23040f';
    ctx.beginPath(); ctx.ellipse(0.53 * S, (1 - 0.5) * S, 0.12 * S, 0.2 * S, 0, 0, Math.PI * 2); ctx.fill();
  });
  const hl = (flip) => canvasTexture(S, S, (ctx) => {
    scleraPath(ctx, S); ctx.clip();
    const X = (u) => (flip ? 1 - u : u) * S;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(X(0.40), (1 - 0.70) * S, 0.11 * S, 0.13 * S, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(X(0.67), (1 - 0.26) * S, 0.05 * S, 0.045 * S, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,240,0.9)';
    ctx.beginPath(); ctx.ellipse(X(0.33), (1 - 0.33) * S, 0.03 * S, 0.03 * S, 0, 0, Math.PI * 2); ctx.fill();
  });
  return { sclera, iris, pupil, hlL: hl(false), hlR: hl(true) };
}

// Upper lash: solid strip along the top eye curve with an outer wing flick. Morph target = closed.
function lashGeometry(side) {
  const N = 40;
  const pts = (closed) => {
    const out = [];
    for (let i = 0; i <= N; i++) {
      const u = lerp(-0.02, 1.13, i / N);
      const uc = clamp(u, 0, 1);
      let base = closed ? eyeClosed(uc) : eyeTop(uc);
      let th = lerp(0.035, 0.12, smoothstep(0.0, 0.85, u)); // thicker toward outer corner
      if (u > 1) { base = (closed ? eyeClosed(1) : eyeTop(1)) + (u - 1) * (closed ? -0.2 : 0.9); th *= 1 - smoothstep(1.0, 1.13, u) * 0.85; }
      if (u < 0.05) th *= 0.6;
      if (closed) th *= 0.55;
      out.push([u, base - th * 0.25, base + th * 0.75]);
    }
    return out;
  };
  const build = (closed) => {
    const P = [], Nn = [];
    const rows = pts(closed);
    for (const [u, v0, v1] of rows) {
      for (const [v, off] of [[v0, 0.0012], [v1, 0.0012], [v1, 0.0028], [v0, 0.0028]]) {
        const [x, y] = eyeXY(side, u, v);
        const s = surfaceAt(x, y, off);
        P.push(s.p.x, s.p.y, s.p.z); Nn.push(s.n.x, s.n.y, s.n.z);
      }
    }
    return { P, Nn };
  };
  const open = build(false), closed = build(true);
  const idx = [];
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      const a = i * 4 + k, b = i * 4 + k1, c = (i + 1) * 4 + k, d = (i + 1) * 4 + k1;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(open.P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const gc = new THREE.BufferGeometry();
  gc.setAttribute('position', new THREE.Float32BufferAttribute(closed.P, 3)); gc.setIndex(idx); gc.computeVertexNormals();
  g.morphAttributes.position = [gc.attributes.position];
  g.morphAttributes.normal = [gc.attributes.normal];
  return g;
}

// Eyelid skin sheet: collapsed above the lash when open, covers the eye when closed (morph target).
function lidGeometry(side) {
  const nu = 16, nv = 8;
  const pos = [], nor = [], mpos = [], mnor = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = lerp(-0.04, 1.06, i / nu), uc = clamp(u, 0, 1);
      const top = eyeTop(uc) + 0.05;
      const f = j / nv;
      const vOpen = top;
      const vClosed = lerp(top, Math.min(eyeBot(uc), eyeClosed(uc)) - 0.05, f);
      const [x0, y0] = eyeXY(side, u, vOpen);
      const [x1, y1] = eyeXY(side, u, vClosed);
      const s0 = surfaceAt(x0, y0, 0.0011), s1 = surfaceAt(x1, y1, 0.0011);
      pos.push(s0.p.x, s0.p.y, s0.p.z); nor.push(s0.n.x, s0.n.y, s0.n.z);
      mpos.push(s1.p.x, s1.p.y, s1.p.z); mnor.push(s1.n.x, s1.n.y, s1.n.z);
    }
  }
  // lower lid rises slightly when closed: extra rows from bottom
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.morphAttributes.position = [new THREE.Float32BufferAttribute(mpos, 3)];
  g.morphAttributes.normal = [new THREE.Float32BufferAttribute(mnor, 3)];
  return g;
}

// Generic strip projected on the face: centre curve fn(u) -> [u, v] in eye space or raw x,y.
function faceStrip(samples, off, depth, side = 1) {
  // samples: [[x, y0, y1]] head-local x with lower/upper y
  const P = [];
  for (const [x0, ya, xb, yb] of samples) {
    for (const [x, y, o] of [[x0, ya, off], [xb, yb, off], [xb, yb, off + depth], [x0, ya, off + depth]]) {
      const s = surfaceAt(x, y, o);
      P.push(s.p.x, s.p.y, s.p.z);
    }
  }
  const idx = [];
  const n = samples.length;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    const a = i * 4 + k, b = i * 4 + k1, c = (i + 1) * 4 + k, d = (i + 1) * 4 + k1;
    if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Flat filled polygon (head-local xy) projected onto the face.
function facePatch(poly, off) {
  const contour = poly.map(([x, y]) => new THREE.Vector2(x, y));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const P = [], Nn = [];
  for (const [x, y] of poly) { const s = surfaceAt(x, y, off); P.push(s.p.x, s.p.y, s.p.z); Nn.push(s.n.x, s.n.y, s.n.z); }
  const idx = [];
  for (const t of tris) {
    // ensure front-facing (+z)
    const a = contour[t[0]], b = contour[t[1]], c = contour[t[2]];
    const cr = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (cr > 0) idx.push(t[0], t[1], t[2]); else idx.push(t[0], t[2], t[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------- bows
export function bowGeometry(s) {
  const loop = new THREE.Shape();
  loop.moveTo(0, 0);
  loop.bezierCurveTo(0.25 * s, 0.55 * s, 0.95 * s, 0.75 * s, 1.0 * s, 0.18 * s);
  loop.bezierCurveTo(1.02 * s, -0.25 * s, 0.55 * s, -0.35 * s, 0, 0);
  const ex = { depth: 0.22 * s, bevelEnabled: true, bevelThickness: 0.1 * s, bevelSize: 0.08 * s, bevelSegments: 3, curveSegments: 18 };
  const r = new THREE.ExtrudeGeometry(loop, ex); r.translate(0, 0, -0.11 * s);
  const l = r.clone(); l.scale(-1, 1, 1);
  // flip winding of mirrored copy
  const ix = l.index ? l.index.array : null;
  if (!l.index) {
    const n = l.attributes.position.count; const arr = []; for (let i = 0; i < n; i += 3) arr.push(i, i + 2, i + 1); l.setIndex(arr);
  } else { for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  l.computeVertexNormals();
  const knot = new THREE.SphereGeometry(0.22 * s, 14, 10); knot.scale(1, 1.15, 0.8);
  const tailShape = new THREE.Shape();
  tailShape.moveTo(-0.12 * s, 0); tailShape.lineTo(0.12 * s, 0);
  tailShape.lineTo(0.3 * s, -1.05 * s); tailShape.lineTo(0.12 * s, -0.9 * s); tailShape.lineTo(0.0, -1.1 * s); tailShape.closePath();
  const tex = { depth: 0.08 * s, bevelEnabled: true, bevelThickness: 0.04 * s, bevelSize: 0.03 * s, bevelSegments: 2 };
  const t1 = new THREE.ExtrudeGeometry(tailShape, tex); t1.rotateZ(0.35); t1.translate(0.02 * s, -0.05 * s, -0.04 * s);
  const t2 = new THREE.ExtrudeGeometry(tailShape, tex); t2.rotateZ(-0.3); t2.translate(-0.02 * s, -0.05 * s, -0.06 * s);
  const parts = [r, l, knot, t1, t2].map((g) => { const gg = g.index ? g : toIndexed(g); gg.deleteAttribute('uv'); return gg; });
  return mergeGeos(parts);
}
function toIndexed(g) {
  const n = g.attributes.position.count; const arr = []; for (let i = 0; i < n; i++) arr.push(i); g.setIndex(arr); return g;
}

// ---------------------------------------------------------------- hair
function headLock(pts, { w0 = 0.04, w1 = 0.035, th0 = 0.012, th1 = 0.006, curl = 0.25, tubular = 18, tipAt = 1 } = {}) {
  return sweep(pts, {
    tubular, radial: 8, curl,
    widthFn: (t) => profile([[0, w0], [0.45, w1], [0.8 * tipAt, w1 * 0.62], [1, 0.0]], t),
    thickFn: (t) => profile([[0, th0], [0.6, th1], [1, 0.0005]], t),
    outwardFn: (p) => p.clone().sub(C).normalize(),
  });
}
const shell = (az, el, off) => {
  const d = sph([az, el]);
  return headDeform(d).addScaledVector(d, off);
};

function buildHairHead() {
  const geos = [];
  // Cap: sculpted skull shell with the face region removed.
  {
    const s = new THREE.SphereGeometry(1, 72, 48);
    const p = s.attributes.position;
    const keep = [];
    const dir = v3();
    for (let i = 0; i < p.count; i++) {
      dir.fromBufferAttribute(p, i).normalize();
      const el = Math.asin(clamp(dir.y, -1, 1)) / DEG;
      const az = Math.abs(Math.atan2(dir.x, dir.z) / DEG);
      keep.push(el > 22 || (az > 78 && el > -38) || (az > 118 && el > -72));
      const off = 0.009 + 0.014 * Math.max(0, -dir.z) + 0.004 * Math.max(0, dir.y);
      const q = headDeform(dir).addScaledVector(dir, off);
      p.setXYZ(i, q.x, q.y, q.z);
    }
    const ix = s.index.array, nix = [];
    for (let i = 0; i < ix.length; i += 3) if (keep[ix[i]] && keep[ix[i + 1]] && keep[ix[i + 2]]) nix.push(ix[i], ix[i + 1], ix[i + 2]);
    s.setIndex(nix); s.deleteAttribute('uv'); s.computeVertexNormals(); weldNormals(s);
    geos.push(s);
  }
  // Bangs
  const bangs = [
    [-58, -20, 0.036], [-44, -8, 0.04], [-30, 1, 0.042], [-16, -9, 0.042], [-3, -15, 0.04],
    [10, -7, 0.042], [23, 2, 0.042], [37, -6, 0.04], [51, -17, 0.036],
  ];
  for (const [az, tipEl, w] of bangs) {
    const a0 = az * 0.55, a1 = az * 1.02;
    const pts = [
      shell(a0 * 0.9, 64, 0.004), shell(lerp(a0, a1, 0.3), 46, 0.012), shell(lerp(a0, a1, 0.6), 28, 0.018),
      shell(lerp(a0, a1, 0.85), 12, 0.021), shell(a1, tipEl, 0.02),
    ];
    const tip = pts[pts.length - 1].clone().addScaledVector(sph([a1, tipEl]), -0.008).add(v3(0, -0.006, 0));
    pts.push(tip);
    geos.push(headLock(pts, { w0: w * 1.1, w1: w, th0: 0.014, th1: 0.008, curl: 0.3 }));
  }
  // Side locks framing the face
  for (const s of [1, -1]) {
    geos.push(headLock([
      shell(s * 64, 38, 0.006), shell(s * 76, 12, 0.016), shell(s * 82, -18, 0.02),
      v3(s * 0.106, 0.0, 0.045), v3(s * 0.098, -0.04, 0.052), v3(s * 0.086, -0.075, 0.06),
    ], { w0: 0.04, w1: 0.034, th0: 0.014, th1: 0.009, curl: 0.35, tubular: 22 }));
    geos.push(headLock([
      shell(s * 86, 40, 0.008), shell(s * 94, 10, 0.02), shell(s * 98, -22, 0.024),
      v3(s * 0.118, -0.02, 0.0), v3(s * 0.108, -0.07, 0.004), v3(s * 0.096, -0.11, 0.01),
    ], { w0: 0.045, w1: 0.04, th0: 0.016, th1: 0.01, curl: 0.35, tubular: 22 }));
  }
  // Back hair
  for (let i = 0; i < 13; i++) {
    const az = 108 + i * (144 / 12);
    const d = sph([az, 0]);
    const len = 0.07 + 0.02 * Math.sin(i * 2.3);
    const pts = [
      shell(az, 62, 0.006), shell(az, 32, 0.018), shell(az, 2, 0.026), shell(az, -26, 0.03),
      v3(C.x + d.x * 0.112, -0.005, C.z + d.z * 0.118),
      v3(C.x + d.x * 0.1, -len, C.z + d.z * 0.11),
    ];
    geos.push(headLock(pts, { w0: 0.07, w1: 0.064, th0: 0.02, th1: 0.012, curl: 0.3, tubular: 22 }));
  }
  // Crown flow from the whorl toward the bangs
  for (const az of [-60, -30, 0, 30, 60]) {
    const pts = [shell(180 + az * 0.2, 66, 0.004), shell(180 + az * 0.6, 84, 0.012), shell(az * 0.9, 76, 0.014), shell(az, 58, 0.012)];
    geos.push(headLock(pts, { w0: 0.05, w1: 0.05, th0: 0.012, th1: 0.01, curl: 0.2, tipAt: 0.9 }));
  }
  // Ahoge
  geos.push(sweep([v3(0.004, 0.252, 0.03), v3(0.01, 0.285, 0.05), v3(0.02, 0.302, 0.08), v3(0.032, 0.292, 0.102), v3(0.036, 0.276, 0.106)], {
    tubular: 16, radial: 8, curl: 0.2,
    widthFn: (t) => profile([[0, 0.018], [0.4, 0.016], [1, 0.0]], t), thickFn: (t) => profile([[0, 0.007], [1, 0.001]], t),
    outwardFn: () => v3(-1, 0, 0),
  }));
  return mergeGeos(geos);
}

// Twin tail (tail-local, root at origin, hanging along -Y). side = +1 left.
function twinTailGeometry(side) {
  const center = [
    v3(0, 0, 0), v3(0.035, -0.006, -0.012), v3(0.066, -0.05, -0.032), v3(0.082, -0.14, -0.052),
    v3(0.08, -0.26, -0.066), v3(0.066, -0.4, -0.072), v3(0.052, -0.53, -0.064), v3(0.046, -0.64, -0.05),
  ].map((p) => v3(p.x * side, p.y, p.z));
  const curve = new THREE.CatmullRomCurve3(center, false, 'centripetal');
  const rad = (t) => profile([[0, 0.018], [0.07, 0.036], [0.24, 0.058], [0.5, 0.052], [0.76, 0.036], [0.92, 0.016], [1, 0.002]], t);
  const geos = [];
  const up = v3(0, 0, 1);
  const frame = (t) => {
    const T = curve.getTangentAt(t);
    const e1 = up.clone().addScaledVector(T, -up.dot(T)).normalize();
    const e2 = new THREE.Vector3().crossVectors(T, e1).normalize();
    return { P: curve.getPointAt(t), e1, e2 };
  };
  const nLocks = 9;
  for (let i = 0; i < nLocks; i++) {
    const a0 = (i / nLocks) * Math.PI * 2 + 0.3 * Math.sin(i * 1.7);
    const tEnd = 0.84 + 0.16 * ((i * 37) % 10) / 10;
    const pts = [], outs = [];
    const N = 12;
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * tEnd;
      const { P, e1, e2 } = frame(t);
      const a = a0 + t * 1.1 * side;
      const r = rad(t / tEnd * 0.96) * 0.5;
      const dir = e1.clone().multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      const spread = k === N ? 1.35 : 1;
      pts.push(P.clone().addScaledVector(dir, r * spread));
      outs.push(dir);
    }
    const lc = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    geos.push(sweep(lc, {
      tubular: 28, radial: 8, curl: 0.28,
      widthFn: (t) => rad(t * 0.96) * 1.25 * (t > 0.85 ? 1 - smoothstep(0.85, 1, t) : 1) + 0.002,
      thickFn: (t) => rad(t * 0.96) * 0.55 + 0.001,
      outwardFn: (p, t) => outs[Math.min(N, Math.round(t * N))],
    }));
  }
  // core volume
  geos.push(sweep(curve, {
    tubular: 28, radial: 10, curl: 0,
    widthFn: (t) => rad(t) * 1.2, thickFn: (t) => rad(t) * 1.1, outwardFn: () => v3(0, 0, 1),
  }));
  const g = mergeGeos(geos);
  const chainS = [0, 0.2, 0.42, 0.66, 1.0];
  return { g, chain: chainS.map((s) => curve.getPointAt(s)) };
}

// ---------------------------------------------------------------- build
export function buildHead(headNode, P, reg) {
  const add = (geo, mat, name, parent = headNode, outline = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    if (outline) reg.outline(m, outline);
    reg.mesh(m);
    return m;
  };

  // Skull + face
  {
    const g = new THREE.SphereGeometry(1, 112, 84);
    const p = g.attributes.position; const d = v3();
    for (let i = 0; i < p.count; i++) { d.fromBufferAttribute(p, i).normalize(); const q = headDeform(d); p.setXYZ(i, q.x, q.y, q.z); }
    g.deleteAttribute('uv'); g.computeVertexNormals(); weldNormals(g);
    add(g, P.skin, 'face', headNode, P.outlineThin);
  }
  // Ears (mostly hidden by side locks)
  for (const s of [1, -1]) {
    const e = new THREE.SphereGeometry(0.022, 16, 12); e.scale(0.45, 1, 0.75);
    e.rotateZ(-s * 0.2); e.translate(s * 0.103, 0.085, -0.006);
    add(e, P.skin, s > 0 ? 'earL' : 'earR');
  }

  const tex = eyeTextures();
  const eyeBasic = (map, extra = {}) => new THREE.MeshBasicMaterial({ map, alphaTest: 0.5, ...extra });
  const mats = {
    sclera: eyeBasic(tex.sclera), iris: eyeBasic(tex.iris), pupil: eyeBasic(tex.pupil),
    hlL: new THREE.MeshBasicMaterial({ map: tex.hlL, transparent: true, depthWrite: false }),
    hlR: new THREE.MeshBasicMaterial({ map: tex.hlR, transparent: true, depthWrite: false }),
  };
  // one shared skin material instance for lids so morphs render with toon shading
  const lidMat = P.skin;
  const eyes = {};
  for (const [side, tag] of [[1, 'L'], [-1, 'R']]) {
    const eye = new THREE.Group(); eye.name = `eye${tag}`; headNode.add(eye);
    const flipUV = (g) => { if (side < 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i)); } return g; };
    add(flipUV(eyeGrid(side, 0.0003)), mats.sclera, `sclera${tag}`, eye);
    add(eyeGrid(side, 0.00055), mats.iris, `iris${tag}`, eye);
    add(eyeGrid(side, 0.0007), mats.pupil, `pupil${tag}`, eye);
    const h = add(eyeGrid(side, 0.00085), side > 0 ? mats.hlL : mats.hlR, `highlight${tag}`, eye);
    h.renderOrder = 2;
    const lid = add(lidGeometry(side), lidMat, `eyelid${tag}`, eye);
    lid.morphTargetInfluences = [0];
    const lash = add(lashGeometry(side), P.lash, `upperLash${tag}`, eye);
    lash.morphTargetInfluences = [0];
    // lower lash + lid crease
    const low = [];
    for (let i = 0; i <= 14; i++) {
      const u = lerp(0.5, 0.97, i / 14);
      const th = 0.028 * Math.sin(Math.PI * (i / 14)) + 0.004;
      const [x0, y0] = eyeXY(side, u, eyeBot(u) - th * 0.5);
      const [x1, y1] = eyeXY(side, u, eyeBot(u) + th * 0.5);
      low.push([x0, y0, x1, y1]);
    }
    add(faceStrip(low, 0.0009, 0.0008, side), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x6d3148 }), `lowerLash${tag}`, eye);
    const crease = [];
    for (let i = 0; i <= 14; i++) {
      const u = lerp(0.22, 0.95, i / 14);
      const th = 0.022 * Math.sin(Math.PI * (i / 14)) + 0.003;
      const [x0, y0] = eyeXY(side, u, eyeTop(u) + 0.2);
      const [x1, y1] = eyeXY(side, u, eyeTop(u) + 0.2 + th);
      crease.push([x0, y0, x1, y1]);
    }
    add(faceStrip(crease, 0.0006, 0.0006, side), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xc9868c }), `lidCrease${tag}`, eye);
    // eyebrow
    const brow = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16;
      const x = side * lerp(0.016, 0.07, f);
      const y = 0.137 + 0.012 * Math.sin(Math.PI * Math.pow(f, 0.8)) - 0.004 * (1 - f) + 0.004 * f;
      const th = lerp(0.0036, 0.0016, f);
      brow.push([x, y - th, x, y + th]);
    }
    add(faceStrip(brow, 0.0006, 0.0008, side), P.brow, `brow${tag}`, headNode);
    // blush
    const blushTex = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      g.addColorStop(0, 'rgba(255,120,150,0.55)'); g.addColorStop(1, 'rgba(255,140,160,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    });
    const bl = [];
    const bx = side * 0.056, by = 0.063, bw = 0.036, bh = 0.02;
    const nb = 10;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nb; j++) for (let i = 0; i <= nb; i++) {
      const s = surfaceAt(bx + (i / nb - 0.5) * bw, by + (j / nb - 0.5) * bh, 0.0004);
      pos.push(s.p.x, s.p.y, s.p.z); uv.push(i / nb, j / nb);
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) {
      const a = j * (nb + 1) + i, b = a + 1, c = a + nb + 1, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
    const b = add(bg, new THREE.MeshBasicMaterial({ map: blushTex, transparent: true, depthWrite: false }), `blush${tag}`);
    b.renderOrder = 1;
    eyes[tag] = { lid, lash };
    void bl;
  }

  // Nose: small bump + shade stroke
  {
    const s0 = surfaceAt(0, 0.072, -0.001).p, s1 = surfaceAt(0, 0.058, 0.0035).p, s2 = surfaceAt(0, 0.053, 0.0025).p;
    const g = sweep([s0, s1, s2], {
      tubular: 8, radial: 8, widthFn: (t) => profile([[0, 0.004], [0.7, 0.007], [1, 0.002]], t),
      thickFn: (t) => profile([[0, 0.002], [0.7, 0.006], [1, 0.002]], t), outwardFn: () => v3(0, 0, 1), capEnd: true,
    });
    add(g, P.skin, 'nose');
    const sh = [];
    for (let i = 0; i <= 6; i++) { const x = lerp(-0.002, 0.005, i / 6); sh.push([x, 0.0515 - 0.0006, x, 0.0515 + 0.0006]); }
    add(faceStrip(sh, 0.0022, 0.0006), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xd99a95 }), 'noseShade');
  }
  // Mouth: small open confident smile
  {
    const up = [], lo = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const f = i / N, x = lerp(-0.0115, 0.0115, f);
      up.push([x, 0.0335 + 0.0028 * Math.pow(Math.abs(f - 0.5) * 2, 2) + 0.0006 * (f - 0.5)]);
    }
    for (let i = N; i >= 0; i--) {
      const f = i / N, x = lerp(-0.0105, 0.0105, f);
      lo.push([x, 0.0335 - 0.0075 * Math.sin(Math.PI * f) + 0.0022 * Math.pow(Math.abs(f - 0.5) * 2, 2)]);
    }
    add(facePatch([...up, ...lo.slice(1, -1)], 0.0006), P.mouth, 'mouth');
    const tongue = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); tongue.push([Math.cos(a) * 0.0055, 0.0288 - Math.sin(a) * 0.0025]); }
    add(facePatch(tongue.reverse(), 0.0009), P.tongue, 'tongue');
    const line = up.map(([x, y]) => [x, y - 0.0005, x, y + 0.0007]);
    add(faceStrip(line, 0.0009, 0.0006), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x5e1f2e }), 'mouthLine');
  }

  // Hair
  const hairMat = hairToon({
    color: 0xd4d7e8, shade: 0xa9a6cf, highlight: 0xffffff, center: C.clone(), lo: 0.6, hi: 0.69, mode: 0,
    gradLo: -0.1, gradHi: 0.05, freq: 30,
  });
  const hair = add(buildHairHead(), hairMat, 'hairMass', headNode, P.outlineHair);
  hair.castShadow = true;

  // Twin tails: skinned 4-bone chains for secondary motion
  const tailMat = hairToon({
    color: 0xd4d7e8, shade: 0xc4b5e2, highlight: 0xffffff, center: v3(0, 0.2, -0.05), lo: 0.132, hi: 0.158, mode: 1,
    gradLo: -0.42, gradHi: -0.1, freq: 14,
  });
  const tails = [];
  for (const [side, tag] of [[1, 'L'], [-1, 'R']]) {
    const attach = v3(side * 0.097, 0.214, -0.052);
    const { g, chain } = twinTailGeometry(side);
    g.translate(attach.x, attach.y, attach.z);
    const chainH = chain.map((p) => p.clone().add(attach));
    skinAlongChain(g, chainH, 0);
    const bones = [];
    let parent = headNode;
    for (let k = 0; k < chainH.length - 1; k++) {
      const b = new THREE.Bone();
      b.name = k === 0 ? `twinTail${tag}` : `twinTail${tag}_${k}`;
      const prev = k === 0 ? v3() : chainH[k - 1];
      b.position.copy(k === 0 ? chainH[0] : chainH[k].clone().sub(prev));
      parent.add(b); bones.push(b); parent = b;
    }
    const mesh = new THREE.SkinnedMesh(g, tailMat);
    mesh.name = `twinTailMesh${tag}`;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    headNode.add(mesh);
    reg.mesh(mesh);
    reg.skinned(mesh, bones, P.outlineHair);
    const tip = chainH[chainH.length - 1].clone().sub(chainH[chainH.length - 2]);
    tails.push({ name: `twinTail${tag}`, bones, tipLocal: tip });
    // bow + tie
    const bow = new THREE.Mesh(bowGeometry(0.05), P.ribbon);
    bow.name = `hairRibbon${tag}`;
    bow.position.copy(attach).add(v3(side * 0.006, 0.004, 0.0));
    bow.rotation.set(-0.2, side * 1.25, side * 0.15);
    headNode.add(bow); reg.mesh(bow); reg.outline(bow, P.outlineThin, true);
    bow.castShadow = true;
  }
  return { tails, eyes };
}
