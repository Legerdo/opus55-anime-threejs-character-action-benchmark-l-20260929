// Shared math + procedural geometry helpers. Everything here builds raw BufferGeometry.
import * as THREE from '../vendor/three.module.js';

export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Piecewise-linear profile lookup: pts = [[t, value], ...] sorted by t.
export function profile(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, a] = pts[i - 1];
      const [t1, b] = pts[i];
      const k = (t - t0) / (t1 - t0);
      // smooth interpolation between samples for organic curves
      return lerp(a, b, k * k * (3 - 2 * k));
    }
  }
  return pts[pts.length - 1][1];
}

function makeGeo(positions, indices, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

// Average normals of coincident vertices (removes shading/outline seams).
export function weldNormals(g, eps = 1e-5) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!nor) return g;
  const map = new Map();
  const inv = 1 / eps;
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * inv)}_${Math.round(pos.getY(i) * inv)}_${Math.round(pos.getZ(i) * inv)}`;
    let e = map.get(k);
    if (!e) { e = { n: new THREE.Vector3(), ids: [] }; map.set(k, e); }
    e.n.x += nor.getX(i); e.n.y += nor.getY(i); e.n.z += nor.getZ(i);
    e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    e.n.normalize();
    for (const i of e.ids) nor.setXYZ(i, e.n.x, e.n.y, e.n.z);
  }
  nor.needsUpdate = true;
  return g;
}

// Clone with position-averaged normals, used by inverted-hull outlines on hard-edged meshes.
export function smoothNormalClone(g) {
  const c = g.clone();
  if (!c.attributes.normal) c.computeVertexNormals();
  weldNormals(c, 1e-4);
  return c;
}

/**
 * Loft around the Y axis through elliptical (super-ellipse) sections.
 * sections: [{y, rx, rz, cx, cz, fn(theta, sectionIndex) -> radius multiplier}]
 * theta is measured from +Z toward +X.
 */
export function loft(sections, seg = 32, opts = {}) {
  const { capTop = false, capBottom = false, colorFn = null } = opts;
  const pos = [];
  const col = colorFn ? [] : null;
  const idx = [];
  const n = sections.length;
  for (let i = 0; i < n; i++) {
    const s = sections[i];
    const p = s.p ?? 2;
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      let sx = Math.sin(th), cz = Math.cos(th);
      if (p !== 2) {
        sx = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / p);
        cz = Math.sign(cz) * Math.pow(Math.abs(cz), 2 / p);
      }
      const m = s.fn ? s.fn(th, i) : 1;
      const rz = cz >= 0 ? s.rz : (s.rzb ?? s.rz);
      pos.push((s.cx ?? 0) + sx * s.rx * m, s.y, (s.cz ?? 0) + cz * rz * m);
      if (col) col.push(...colorFn(s, th));
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      const a = i * seg + j, b = i * seg + j1, c = (i + 1) * seg + j, d = (i + 1) * seg + j1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const addCap = (ring, flip) => {
    const s = sections[ring];
    const ci = pos.length / 3;
    pos.push(s.cx ?? 0, s.y, s.cz ?? 0);
    if (col) col.push(...colorFn(s, 0));
    for (let j = 0; j < seg; j++) {
      const a = ring * seg + j, b = ring * seg + ((j + 1) % seg);
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  if (capBottom) addCap(0, false);
  if (capTop) addCap(n - 1, true);
  return makeGeo(pos, idx, col);
}

/**
 * Sweep a lens/ellipse cross-section along a Catmull-Rom curve (hair locks, fingers, scarf strips).
 * widthFn(t), thickFn(t): full width/thickness. outwardFn(point, t): "up" for the thickness axis.
 * curl bends the width edges back toward -outward (anime hair lock cupping).
 */
export function sweep(points, opts = {}) {
  const {
    radial = 8, tubular = 20, widthFn = () => 0.02, thickFn = () => 0.01,
    outwardFn = () => v3(0, 0, 1), curl = 0, capStart = true, capEnd = false,
    colorFn = null, twistFn = null,
  } = opts;
  const curve = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], idx = [], col = colorFn ? [] : null;
  const P = v3(), T = v3(), N = v3(), B = v3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    N.copy(outwardFn(P, t));
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    if (twistFn) {
      const a = twistFn(t), c = Math.cos(a), s = Math.sin(a);
      const nn = N.clone().multiplyScalar(c).addScaledVector(B, s);
      const bb = B.clone().multiplyScalar(c).addScaledVector(N, -s);
      N.copy(nn); B.copy(bb);
    }
    const w = widthFn(t) * 0.5, th = thickFn(t) * 0.5;
    for (let k = 0; k < radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const off = sa * th - curl * w * ca * ca;
      pos.push(P.x + B.x * ca * w + N.x * off, P.y + B.y * ca * w + N.y * off, P.z + B.z * ca * w + N.z * off);
      if (col) col.push(...colorFn(t, a));
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let k = 0; k < radial; k++) {
      const k1 = (k + 1) % radial;
      const a = i * radial + k, b = i * radial + k1, c = (i + 1) * radial + k, d = (i + 1) * radial + k1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ring, flip) => {
    const ci = pos.length / 3;
    const p = curve.getPointAt(ring === 0 ? 0 : 1);
    pos.push(p.x, p.y, p.z);
    if (col) col.push(...colorFn(ring === 0 ? 0 : 1, 0));
    for (let k = 0; k < radial; k++) {
      const a = ring * radial + k, b = ring * radial + ((k + 1) % radial);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(tubular, true);
  return makeGeo(pos, idx, col);
}

/**
 * Thick cloth sheet from a grid of outer-surface points P[row][col].
 * rows run from top (0) to bottom; closedCols=true wraps around.
 */
export function clothSheet(P, thickness, opts = {}) {
  const { closedCols = false, colorFn = null } = opts;
  const rows = P.length, cols = P[0].length;
  const pos = [], col = colorFn ? [] : null, idx = [];
  const colsN = closedCols ? cols : cols;
  // outer surface first to derive normals
  const outer = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) outer.push(P[r][c]);
  const ofs = (r, c) => r * cols + c;
  const normals = outer.map(() => v3());
  const tmpA = v3(), tmpB = v3(), tmpN = v3();
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < (closedCols ? cols : cols - 1); c++) {
      const c1 = (c + 1) % cols;
      const a = ofs(r, c), b = ofs(r, c1), d = ofs(r + 1, c);
      tmpA.subVectors(outer[b], outer[a]);
      tmpB.subVectors(outer[d], outer[a]);
      tmpN.crossVectors(tmpB, tmpA); // (down) x (around) = outward for theta-increasing columns
      for (const i of [a, b, d, ofs(r + 1, c1)]) normals[i].add(tmpN);
    }
  }
  normals.forEach((n) => n.normalize());
  const push = (p, rr, cc) => {
    pos.push(p.x, p.y, p.z);
    if (col) col.push(...colorFn(rr / (rows - 1), cc / (cols - 1)));
  };
  for (let i = 0; i < outer.length; i++) push(outer[i], Math.floor(i / cols), i % cols);
  const base = outer.length;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i].clone().addScaledVector(normals[i], -thickness);
    push(p, Math.floor(i / cols), i % cols);
  }
  const cMax = closedCols ? cols : cols - 1;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cMax; c++) {
      const c1 = (c + 1) % cols;
      const a = ofs(r, c), b = ofs(r, c1), d = ofs(r + 1, c), e = ofs(r + 1, c1);
      // orientation chosen so outer faces follow (b-a)x(d-a)
      idx.push(a, d, b, b, d, e);
      idx.push(base + a, base + b, base + d, base + b, base + e, base + d);
    }
  }
  // bottom rim
  const rimRow = rows - 1;
  for (let c = 0; c < cMax; c++) {
    const c1 = (c + 1) % cols;
    const a = ofs(rimRow, c), b = ofs(rimRow, c1);
    idx.push(a, base + a, b, b, base + a, base + b);
  }
  if (!closedCols) {
    for (let r = 0; r < rows - 1; r++) {
      const a = ofs(r, 0), d = ofs(r + 1, 0);
      idx.push(a, base + a, d, d, base + a, base + d);
      const a2 = ofs(r, cols - 1), d2 = ofs(r + 1, cols - 1);
      idx.push(a2, d2, base + a2, d2, base + d2, base + a2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Merge indexed geometries (position/normal/color + optional skin attributes).
export function mergeGeos(geos) {
  const hasColor = geos.some((g) => g.attributes.color);
  const pos = [], nor = [], col = [], idx = [];
  let off = 0;
  for (let g of geos) {
    if (!g.index) {
      const n = g.attributes.position.count;
      g.setIndex([...Array(n).keys()]);
    }
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (hasColor) {
        if (c) col.push(c.getX(i), c.getY(i), c.getZ(i));
        else col.push(1, 1, 1);
      }
    }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (hasColor) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}

export function colorize(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * Skin weights along a chain polyline. chain: Vector3[] joint positions (mesh space), tip included.
 * Bones: indices boneOffset .. boneOffset + chain.length - 2.
 */
export function skinAlongChain(g, chain, boneOffset = 0) {
  const pos = g.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const nb = chain.length - 1;
  const p = v3(), ab = v3(), ap = v3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    let best = Infinity, bestS = 0;
    for (let k = 0; k < nb; k++) {
      ab.subVectors(chain[k + 1], chain[k]);
      ap.subVectors(p, chain[k]);
      const f = clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
      const d = ap.addScaledVector(ab, -f).lengthSq();
      if (d < best) { best = d; bestS = k + f; }
    }
    const v = bestS - 0.5;
    let k0 = Math.floor(v), f = v - k0;
    let k1 = k0 + 1;
    if (k0 < 0) { k0 = 0; k1 = 0; f = 0; }
    if (k1 > nb - 1) { k1 = nb - 1; if (k0 > nb - 1) k0 = nb - 1; }
    si[i * 4] = boneOffset + k0; sw[i * 4] = 1 - f;
    si[i * 4 + 1] = boneOffset + k1; sw[i * 4 + 1] = f;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

/**
 * Radial skinning for skirts/coat hems: bone 0 = root, bones 1..n placed at angles[].
 * Weight blends from root at the waistband to the radial bones toward the hem.
 */
export function skinRadial(g, angles, topY, length, closed) {
  const pos = g.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const na = angles.length;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let th = Math.atan2(x, z);
    if (th < 0) th += Math.PI * 2;
    const f = clamp((topY - y) / length, 0, 1);
    const wr = smoothstep(0.0, 0.3, f);
    // find surrounding angle pair
    let k0 = 0, k1 = 0, t = 0;
    if (closed) {
      const step = (Math.PI * 2) / na;
      const u = (th - angles[0] + Math.PI * 4) % (Math.PI * 2) / step;
      k0 = Math.floor(u) % na; k1 = (k0 + 1) % na; t = u - Math.floor(u);
    } else {
      if (th <= angles[0]) { k0 = k1 = 0; }
      else if (th >= angles[na - 1]) { k0 = k1 = na - 1; }
      else {
        for (let k = 0; k < na - 1; k++) {
          if (th >= angles[k] && th <= angles[k + 1]) { k0 = k; k1 = k + 1; t = (th - angles[k]) / (angles[k + 1] - angles[k]); break; }
        }
      }
    }
    si[i * 4] = 0; sw[i * 4] = 1 - wr;
    si[i * 4 + 1] = 1 + k0; sw[i * 4 + 1] = wr * (1 - t);
    si[i * 4 + 2] = 1 + k1; sw[i * 4 + 2] = wr * t;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

export function sph(dir) {
  // dir = [azimuthDeg (from +Z toward +X), elevationDeg]
  const az = dir[0] * DEG, el = dir[1] * DEG;
  return v3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}
