// Pose authoring + leg IK + baked secondary motion -> THREE.AnimationClip keyframe tracks.
import * as THREE from '../vendor/three.module.js';
import { DEG, clamp, lerp, smoothstep, v3 } from './util.js';

export const CLIP_DEFS = {
  Idle: { duration: 2.0, loop: true },
  Run: { duration: 0.7, loop: true },
  Attack_A: { duration: 0.85, loop: false },
  Attack_B: { duration: 1.1, loop: false },
};

export const CONTACT = {
  Idle: [['start', 0], ['breathing', 0.3], ['blink / secondary', 0.66], ['loop end', 1.0]],
  Run: [['left contact', 0], ['left passing', 0.17], ['left up', 0.38], ['right contact', 0.5], ['right passing', 0.67], ['right up', 0.88]],
  Attack_A: [['neutral', 0], ['anticipation', 0.13], ['wind-up', 0.3], ['strike', 0.46], ['follow-through', 0.6], ['recovery', 0.86]],
  Attack_B: [['neutral', 0], ['casting start', 0.28], ['charge', 0.47], ['release', 0.585], ['wave', 0.7], ['recovery', 0.9]],
};

const JOINTS = ['torso', 'chest', 'neck', 'head', 'shoulderL', 'armL', 'forearmL', 'handL', 'shoulderR', 'armR', 'forearmR', 'handR'];

// ---------------------------------------------------------------- pose vector helpers
function flatten(p) {
  const out = [...p.hipsP, ...p.hipsR];
  for (const j of JOINTS) out.push(...p[j]);
  for (const f of [p.footL, p.footR]) out.push(...f.p, f.pitch, f.yaw);
  out.push(p.blink);
  return out;
}
function unflatten(a) {
  let i = 0;
  const take = (n) => a.slice(i, (i += n));
  const p = { hipsP: take(3), hipsR: take(3) };
  for (const j of JOINTS) p[j] = take(3);
  for (const f of ['footL', 'footR']) { const q = take(5); p[f] = { p: q.slice(0, 3), pitch: q[3], yaw: q[4] }; }
  p.blink = a[i];
  return p;
}
const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(base, over) {
  const p = clone(base);
  for (const k in over) {
    if (k === 'footL' || k === 'footR') p[k] = { ...p[k], ...over[k] };
    else p[k] = over[k];
  }
  return p;
}

// Cubic Hermite through keyed pose vectors (C1, softened tangents, clamped ends for one-shots).
function sampleKeys(keys, t, loop, duration) {
  const V = keys.map((k) => k.v);
  const T = keys.map((k) => k.t);
  const n = keys.length;
  if (t <= T[0]) return V[0].slice();
  if (t >= T[n - 1]) return V[n - 1].slice();
  let i = 0;
  while (i < n - 2 && t > T[i + 1]) i++;
  const tan = (k) => {
    if (keys[k].hold) return V[k].map(() => 0);
    let km = k - 1, kp = k + 1, tm, tp;
    if (km < 0) { if (!loop) return V[k].map(() => 0); km = n - 2; tm = T[km] - duration; } else tm = T[km];
    if (kp > n - 1) { if (!loop) return V[k].map(() => 0); kp = 1; tp = T[kp] + duration; } else tp = T[kp];
    const s = keys[k].tension ?? 0.85;
    return V[k].map((_, d) => ((V[kp][d] - V[km][d]) / (tp - tm)) * s);
  };
  const h = T[i + 1] - T[i];
  const u = (t - T[i]) / h;
  const m0 = tan(i), m1 = tan(i + 1);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return V[i].map((a, d) => h00 * a + h10 * h * m0[d] + h01 * V[i + 1][d] + h11 * h * m1[d]);
}

// ---------------------------------------------------------------- base poses
export const IDLE0 = {
  hipsP: [0.0, 0.884, 0.0], hipsR: [2, -12, -2],
  torso: [3, 8, 1], chest: [-2, 6, 1], neck: [2, -2, 0], head: [-5, -2, 5],
  shoulderL: [0, 0, 0], armL: [14, -82, 34], forearmL: [-92, 0, 0], handL: [0, 0, -16],
  shoulderR: [0, 0, 0], armR: [-10, 12, -16], forearmR: [-16, -10, 0], handR: [8, 6, 6],
  footL: { p: [0.098, 0.075, -0.055], pitch: 0, yaw: 22 },
  footR: { p: [-0.1, 0.075, 0.075], pitch: 0, yaw: -12 },
  blink: 0,
};

function idlePose(t) {
  const d = CLIP_DEFS.Idle.duration;
  const w = (2 * Math.PI * t) / d;
  const breath = Math.sin(w);
  const p = clone(IDLE0);
  p.hipsP[1] += -0.004 + 0.004 * Math.cos(w);
  p.hipsP[0] += 0.007 * Math.sin(w + 0.4);
  p.hipsR[2] += 1.2 * Math.sin(w + 0.4);
  p.torso[0] += 0.8 * breath;
  p.chest[0] += -1.8 * breath;
  p.chest[2] += -0.8 * Math.sin(w + 0.4);
  p.head[0] += 1.2 * Math.sin(w - 0.6);
  p.head[2] += 1.5 * Math.sin(w + 0.9);
  p.armL[2] += 1.5 * breath;
  p.armR[2] += -1.5 * breath;
  p.armR[0] += 1.5 * Math.sin(w - 0.8);
  p.forearmR[0] += 2 * Math.sin(w - 1.2);
  // blink around t = 1.32s
  const b = t - 1.32;
  p.blink = b < 0 ? smoothstep(-0.07, 0, b) : 1 - smoothstep(0.02, 0.12, b);
  return p;
}

// ---------------------------------------------------------------- run cycle (procedural, in place)
const SOLE = [[-0.05, -0.075], [0.152, -0.075]];
function soleOffset(pitch, which) {
  const [z, y] = which === 'toe' ? SOLE[1] : SOLE[0];
  const c = Math.cos(pitch * DEG), s = Math.sin(pitch * DEG);
  return { z: y * s + z * c, y: y * c - z * s };
}
const STANCE = 0.36;
const ZC = 0.2, ZO = -0.24;
const swingKeys = [
  { t: 0.36, v: null },
  { t: 0.5, v: [-0.31, 0.3, 58] },
  { t: 0.66, v: [-0.08, 0.37, 40] },
  { t: 0.8, v: [0.2, 0.3, 4] },
  { t: 0.92, v: [0.28, 0.15, -12] },
  { t: 1.0, v: null },
];
function stanceFoot(f) {
  const u = f / STANCE;
  const zg = lerp(ZC, ZO, u);
  let pitch;
  if (u < 0.2) pitch = lerp(-10, 0, smoothstep(0, 0.2, u));
  else if (u < 0.62) pitch = 0;
  else pitch = lerp(0, 32, smoothstep(0.62, 1, u) ** 1.2);
  let z, y;
  if (pitch < 0) { const o = soleOffset(pitch, 'heel'); z = zg - 0.05 - o.z; y = -o.y; }
  else { const o = soleOffset(pitch, 'toe'); z = zg + 0.152 - o.z; y = -o.y; }
  return [z, y, pitch];
}
function runFoot(phase) {
  const f = ((phase % 1) + 1) % 1;
  if (f <= STANCE) return stanceFoot(f);
  const keys = swingKeys.map((k) => ({ t: k.t, v: k.v || (k.t < 0.5 ? stanceFoot(STANCE) : stanceFoot(0)) }));
  return sampleKeys(keys, f, false, 1);
}
function runPose(t) {
  const d = CLIP_DEFS.Run.duration;
  const ph = t / d;
  const c = (x) => Math.cos(2 * Math.PI * x);
  const s = (x) => Math.sin(2 * Math.PI * x);
  const L = runFoot(ph), R = runFoot(ph + 0.5);
  const p = {
    hipsP: [0.0, 0.862 - 0.02 * Math.cos(4 * Math.PI * (ph - 0.14)), 0.0],
    hipsR: [6, -11 * c(ph + 0.04), 4 * s(ph + 0.1)],
    torso: [9 + 2 * Math.cos(4 * Math.PI * (ph - 0.2)), 8 * c(ph + 0.04), -1.5 * s(ph + 0.1)],
    chest: [2, 9 * c(ph + 0.02), -1.5 * s(ph + 0.1)],
    neck: [-4, -4 * c(ph), 0],
    head: [-5 - 1.5 * Math.cos(4 * Math.PI * (ph - 0.3)), -3 * c(ph), 1.5 * s(ph)],
    shoulderL: [0, 0, 0], shoulderR: [0, 0, 0],
    armL: [-8 - 42 * c(ph - 0.45), -10, 14],
    forearmL: [-80 - 18 * Math.max(0, -c(ph - 0.45)) + 8 * c(ph - 0.45), 0, 0],
    handL: [0, 0, -10],
    armR: [-14 - 28 * c(ph - 0.95), 10, -18],
    forearmR: [-58 - 10 * Math.max(0, -c(ph - 0.95)), -18, 0],
    handR: [8, 8, 0],
    footL: { p: [0.092, L[1], L[0]], pitch: L[2], yaw: 4 },
    footR: { p: [-0.092, R[1], R[0]], pitch: R[2], yaw: -4 },
    blink: 0,
  };
  return p;
}

// ---------------------------------------------------------------- attacks (key poses)
function attackAKeys() {
  const P0 = IDLE0;
  const k = (t, over, opt = {}) => ({ t, v: flatten(merge(P0, over)), ...opt });
  return [
    k(0.0, {}),
    k(0.1, {
      hipsP: [0.01, 0.868, -0.025], hipsR: [4, -22, -2],
      torso: [5, -10, 2], chest: [0, -12, 2], neck: [0, 6, 0], head: [-4, 10, 3],
      armL: [-20, -40, 30], forearmL: [-60, 0, 0], handL: [0, 0, -10],
      armR: [-5, 25, -12], forearmR: [-55, -10, 0], handR: [20, 10, 0],
    }),
    k(0.25, {
      hipsP: [0.015, 0.852, -0.04], hipsR: [3, -34, -3],
      torso: [2, -24, 4], chest: [-4, -20, 6], neck: [0, 12, 0], head: [-6, 22, 2],
      armL: [-65, -20, 45], forearmL: [-25, 0, 0], handL: [0, 0, -25],
      armR: [-150, 0, -28], forearmR: [-22, 0, 0], handR: [0, 0, 0],
      footR: { p: [-0.1, 0.1, 0.12], pitch: 10, yaw: -10 },
    }),
    k(0.33, {
      hipsP: [0.0, 0.84, 0.04], hipsR: [6, -18, -3],
      torso: [6, -12, 3], chest: [0, -12, 4], neck: [0, 8, 0], head: [-6, 14, 2],
      armL: [-50, -20, 50], forearmL: [-15, 0, 0], handL: [0, 0, -25],
      armR: [-162, 8, -36], forearmR: [-38, 0, 0], handR: [-6, 0, 0],
      footR: { p: [-0.1, 0.12, 0.26], pitch: -12, yaw: -6 },
    }, { tension: 0.6 }),
    k(0.4, {
      hipsP: [-0.01, 0.815, 0.15], hipsR: [10, 14, 0],
      torso: [12, 22, -2], chest: [6, 18, -4], neck: [-4, -8, 0], head: [-8, -18, 0],
      armL: [5, -20, 55], forearmL: [-10, 0, 0], handL: [0, 0, -30],
      armR: [-88, 55, -35], forearmR: [-10, -60, 0], handR: [-5, 30, 10],
      footR: { p: [-0.1, 0.075, 0.38], pitch: 0, yaw: -2 },
    }, { tension: 0.55 }),
    k(0.5, {
      hipsP: [-0.02, 0.81, 0.17], hipsR: [12, 28, 2],
      torso: [16, 30, -4], chest: [8, 20, -6], neck: [-4, -14, 0], head: [-6, -26, -2],
      armL: [25, -20, 45], forearmL: [-18, 0, 0], handL: [0, 0, -30],
      armR: [-48, 70, 15], forearmR: [-18, -60, 0], handR: [-25, 30, 25],
      footR: { p: [-0.1, 0.075, 0.38], pitch: 0, yaw: -2 },
    }),
    k(0.62, {
      hipsP: [-0.015, 0.818, 0.15], hipsR: [10, 24, 2],
      torso: [12, 26, -3], chest: [6, 16, -5], neck: [-2, -12, 0], head: [-6, -22, -2],
      armL: [18, -30, 42], forearmL: [-30, 0, 0], handL: [0, 0, -25],
      armR: [-45, 62, 8], forearmR: [-26, -55, 0], handR: [-20, 28, 20],
      footR: { p: [-0.1, 0.075, 0.38], pitch: 0, yaw: -2 },
    }),
    k(0.73, {
      hipsP: [-0.005, 0.86, 0.06], hipsR: [5, -2, 0],
      torso: [6, 10, 0], chest: [0, 8, 0], head: [-5, -6, 3],
      footR: { p: [-0.1, 0.1, 0.22], pitch: -6, yaw: -8 },
    }),
    k(0.85, {}),
  ];
}

function attackBKeys() {
  const P0 = IDLE0;
  const k = (t, over, opt = {}) => ({ t, v: flatten(merge(P0, over)), ...opt });
  const raise = {
    hipsP: [0.01, 0.87, -0.03], hipsR: [0, -22, 0],
    torso: [-2, -8, 0], chest: [-6, -6, 0], neck: [-2, 4, 0], head: [8, 8, 2],
    armL: [-60, -60, 10], forearmL: [-75, 20, 0], handL: [0, 30, -10],
    armR: [-58, 12, -14], forearmR: [-55, 0, 0], handR: [-20, 0, 0],
    footL: { p: [0.11, 0.075, 0.06], pitch: 0, yaw: 20 },
    footR: { p: [-0.12, 0.075, -0.1], pitch: 0, yaw: -24 },
  };
  return [
    k(0.0, {}),
    k(0.13, {
      hipsP: [0.01, 0.858, -0.01], hipsR: [4, -16, 0],
      torso: [6, -4, 0], chest: [2, -6, 0], head: [-8, 4, 3],
      armL: [-30, -80, 20], forearmL: [-90, 0, 0],
      armR: [-5, 20, -20], forearmR: [-40, -20, 0], handR: [10, 10, 0],
      footR: { p: [-0.11, 0.1, -0.02], pitch: 8, yaw: -18 },
    }),
    k(0.3, raise),
    k(0.45, merge(raise, { hipsP: [0.01, 0.876, -0.045], chest: [-9, -6, 0], head: [10, 8, 0], armR: [-64, 12, -14] })),
    k(0.58, merge(raise, {
      hipsP: [0.01, 0.872, -0.06], hipsR: [0, -28, 0], torso: [-4, -16, 0], chest: [-8, -12, 0],
      armR: [-75, 12, -22], forearmR: [-70, 0, 0], handR: [-10, 0, 0], head: [8, 14, 0],
    }), { tension: 0.5 }),
    k(0.645, {
      hipsP: [-0.01, 0.82, 0.14], hipsR: [8, 24, 0],
      torso: [12, 24, 0], chest: [4, 14, 0], neck: [-4, -10, 0], head: [-10, -22, 0],
      armL: [40, -30, 40], forearmL: [-20, 0, 0], handL: [0, 0, -30],
      armR: [-86, 2, -2], forearmR: [-4, 0, 0], handR: [38, 0, 0],
      footL: { p: [0.11, 0.075, -0.1], pitch: 0, yaw: 20 },
      footR: { p: [-0.1, 0.075, 0.36], pitch: 0, yaw: -4 },
    }, { tension: 0.5 }),
    k(0.74, {
      hipsP: [-0.01, 0.824, 0.12], hipsR: [7, 22, 0],
      torso: [10, 22, 0], chest: [2, 12, 0], neck: [-4, -10, 0], head: [-9, -20, 0],
      armL: [35, -30, 40], forearmL: [-25, 0, 0], handL: [0, 0, -30],
      armR: [-80, 6, -4], forearmR: [-10, 0, 0], handR: [36, 0, 0],
      footL: { p: [0.11, 0.075, -0.1], pitch: 0, yaw: 20 },
      footR: { p: [-0.1, 0.075, 0.36], pitch: 0, yaw: -4 },
    }),
    k(0.9, {
      hipsP: [0.0, 0.855, 0.05], hipsR: [4, 4, 0], torso: [6, 10, 0], chest: [0, 6, 0], head: [-6, -6, 3],
      armR: [-40, 10, -14], forearmR: [-30, -20, 0],
      footL: { p: [0.1, 0.075, -0.07], pitch: 0, yaw: 22 },
      footR: { p: [-0.1, 0.1, 0.2], pitch: -6, yaw: -10 },
    }),
    k(1.1, {}),
  ];
}

// ---------------------------------------------------------------- rig application
const _e = new THREE.Euler();
const qe = (a, order = 'ZXY') => new THREE.Quaternion().setFromEuler(_e.set(a[0] * DEG, a[1] * DEG, a[2] * DEG, order));

function footMinY(pitch) {
  let m = 0;
  for (const w of ['heel', 'toe']) m = Math.max(m, -soleOffset(pitch, w).y);
  return m;
}

const tmp = { H: v3(), K: v3(), T: v3(), u: v3(), v: v3(), X: v3(), Y: v3(), Z: v3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };
function basisQuat(Y, Zhint) {
  const Z = Zhint.clone().addScaledVector(Y, -Zhint.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  tmp.m.makeBasis(X, Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(tmp.m);
}

function solveLeg(N, side, foot) {
  const thigh = N[`thigh${side}`], shin = N[`shin${side}`], footN = N[`foot${side}`];
  const L1 = 0.39, L2 = 0.385;
  const parent = thigh.parent;
  parent.updateMatrixWorld(true);
  const H = thigh.getWorldPosition(v3());
  const T = v3(...foot.p);
  T.y = Math.max(T.y, footMinY(foot.pitch));
  const yaw = foot.yaw * DEG;
  const pole = v3(Math.sin(yaw) + (side === 'L' ? 0.12 : -0.12), 0.0, Math.cos(yaw));
  const dvec = T.clone().sub(H);
  let d = dvec.length();
  d = clamp(d, 0.05, L1 + L2 - 0.0015);
  const u = dvec.normalize();
  const v = pole.clone().addScaledVector(u, -pole.dot(u)).normalize();
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const a = Math.acos(cosA);
  const K = H.clone().addScaledVector(u, L1 * Math.cos(a)).addScaledVector(v, L1 * Math.sin(a));
  const Tr = H.clone().addScaledVector(u, d);
  const qThighW = basisQuat(H.clone().sub(K).normalize(), v);
  const qShinW = basisQuat(K.clone().sub(Tr).normalize(), v);
  const qParentW = parent.getWorldQuaternion(new THREE.Quaternion());
  thigh.quaternion.copy(qParentW.clone().invert().multiply(qThighW));
  shin.quaternion.copy(qThighW.clone().invert().multiply(qShinW));
  const qFootW = qe([foot.pitch, foot.yaw, 0], 'YXZ');
  footN.quaternion.copy(qShinW.clone().invert().multiply(qFootW));
}

export function applyPose(rig, pose) {
  const { N } = rig;
  N.hips.position.set(...pose.hipsP);
  N.hips.quaternion.copy(qe(pose.hipsR, 'YXZ'));
  for (const j of JOINTS) N[j].quaternion.copy(qe(pose[j]));
  rig.root.updateMatrixWorld(true);
  solveLeg(N, 'L', pose.footL);
  solveLeg(N, 'R', pose.footR);
  rig.root.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- secondary simulation
function chainParams(name) {
  if (name.startsWith('twinTail')) return { stiff: [0.11, 0.075, 0.055, 0.045], damp: 0.09, grav: 2.5, wind: 1.0, pad: 0.045, set: 'tail' };
  if (name.startsWith('scarfTail')) return { stiff: [0.07, 0.05, 0.04, 0.035, 0.03], damp: 0.1, grav: 2.5, wind: 1.3, pad: 0.012, set: 'scarf' };
  if (name.startsWith('skirt')) return { stiff: [0.2], damp: 0.16, grav: 1.5, wind: 0.45, pad: 0.012, set: 'skirt' };
  return { stiff: [0.13], damp: 0.13, grav: 2.0, wind: 0.8, pad: 0.03, set: 'hem' };
}
function colliderSets(N) {
  const c = (node, x, y, z, r) => ({ node: N[node], off: v3(x, y, z), r });
  const thighs = [];
  for (const t of ['L', 'R']) thighs.push(c(`thigh${t}`, 0, -0.05, 0, 0.068), c(`thigh${t}`, 0, -0.16, 0.0, 0.062), c(`thigh${t}`, 0, -0.27, 0, 0.056), c(`shin${t}`, 0, 0.0, 0, 0.05));
  const body = [c('chest', 0, 0.05, -0.005, 0.105), c('torso', 0, 0.05, 0, 0.092), c('hips', 0, -0.02, 0, 0.12)];
  const arms = [];
  for (const t of ['L', 'R']) arms.push(c(`arm${t}`, 0, -0.02, 0, 0.05), c(`arm${t}`, 0, -0.14, 0, 0.042));
  return {
    tail: [...body, ...arms, c('hips', 0, -0.06, -0.03, 0.17), c('head', 0, 0.135, 0, 0.125)],
    scarf: [...body, c('hips', 0, -0.06, -0.03, 0.16), c('hips', 0, -0.16, -0.06, 0.2)],
    skirt: [...thighs, c('hips', 0, -0.03, 0, 0.11)],
    hem: [...thighs, c('hips', 0, -0.03, 0, 0.13)],
  };
}

class SecondarySim {
  constructor(rig) {
    this.rig = rig;
    this.cols = colliderSets(rig.N);
    this.chains = rig.chains.map((ch) => {
      const prm = chainParams(ch.name);
      const lens = ch.bones.slice(1).map((b) => b.position.length());
      lens.push(ch.tipLocal.length());
      return { ...ch, prm, lens, p: [], prev: [], init: false };
    });
  }
  targets(ch) {
    // FK with bones at rest to get rest-shape joint positions in world space
    for (const b of ch.bones) b.quaternion.identity();
    ch.bones[0].updateMatrixWorld(true);
    const pts = ch.bones.map((b) => b.getWorldPosition(v3()));
    pts.push(ch.tipLocal.clone().applyMatrix4(ch.bones[ch.bones.length - 1].matrixWorld));
    return pts;
  }
  step(dt, wind, reset = false) {
    const colW = {};
    for (const k in this.cols) colW[k] = this.cols[k].map((c) => ({ c: c.off.clone().applyMatrix4(c.node.matrixWorld), r: c.r }));
    for (const ch of this.chains) {
      const tg = this.targets(ch);
      const n = tg.length;
      if (!ch.init || reset) { ch.p = tg.map((x) => x.clone()); ch.prev = tg.map((x) => x.clone()); ch.init = true; }
      const prm = ch.prm;
      const acc = v3(wind.x * prm.wind, -prm.grav + wind.y * prm.wind, wind.z * prm.wind);
      const sub = 2, h = dt / sub;
      for (let s = 0; s < sub; s++) {
        ch.p[0].copy(tg[0]);
        for (let k = 1; k < n; k++) {
          const p = ch.p[k], pr = ch.prev[k];
          const vel = p.clone().sub(pr).multiplyScalar(1 - prm.damp);
          pr.copy(p);
          p.add(vel).addScaledVector(acc, h * h);
          const st = prm.stiff[Math.min(k - 1, prm.stiff.length - 1)];
          p.lerp(tg[k], st);
        }
        for (let it = 0; it < 2; it++) {
          for (let k = 1; k < n; k++) {
            const p = ch.p[k];
            for (const { c, r } of colW[prm.set]) {
              const d = p.clone().sub(c); const L = d.length(); const rr = r + prm.pad;
              if (L < rr && L > 1e-6) p.copy(c).addScaledVector(d, rr / L);
            }
            const seg = p.clone().sub(ch.p[k - 1]);
            p.copy(ch.p[k - 1]).addScaledVector(seg.normalize(), ch.lens[k - 1]);
          }
        }
      }
      // joints -> bone rotations
      let qParent = ch.bones[0].parent.getWorldQuaternion(new THREE.Quaternion());
      for (let k = 0; k < ch.bones.length; k++) {
        const rest = (k + 1 < ch.bones.length ? ch.bones[k + 1].position : ch.tipLocal).clone().normalize();
        const want = ch.p[k + 1].clone().sub(ch.p[k]).normalize().applyQuaternion(qParent.clone().invert());
        const q = new THREE.Quaternion().setFromUnitVectors(rest, want);
        ch.bones[k].quaternion.copy(q);
        qParent = qParent.clone().multiply(q);
      }
      ch.bones[0].updateMatrixWorld(true);
    }
  }
}

// ---------------------------------------------------------------- bake
function windFor(name, t) {
  if (name === 'Run') return v3(0.4 * Math.sin(t * 23), 0.8 * Math.sin(t * 17), -5.0);
  if (name === 'Attack_B') {
    if (t > 0.3 && t < 0.62) { const k = smoothstep(0.3, 0.45, t); return v3(0.6 * Math.sin(t * 40) * k, 4.2 * k, 0.8 * k); }
    if (t >= 0.62 && t < 0.9) { const k = 1 - smoothstep(0.66, 0.9, t); return v3(0, 1.0 * k, -5.5 * k); }
  }
  if (name === 'Idle') return v3(0.15 * Math.sin(t * 3.1), 0, -0.2 * (1 + Math.sin(t * 2.3)));
  return v3();
}

export function poseAt(name, t) {
  if (name === 'Idle') return idlePose(t);
  if (name === 'Run') return runPose(t);
  const keys = name === 'Attack_A' ? attackAKeys() : attackBKeys();
  return unflatten(sampleKeys(keys, t, false, CLIP_DEFS[name].duration));
}

export function bakeAll(rig) {
  const clips = [];
  const samples = {};
  const sim = new SecondarySim(rig);
  const tracked = [rig.N.hips, ...JOINTS.map((j) => rig.N[j]), ...['L', 'R'].flatMap((t) => [rig.N[`thigh${t}`], rig.N[`shin${t}`], rig.N[`foot${t}`]])];
  const secBones = rig.chains.flatMap((c) => c.bones);
  const allQ = [...tracked, ...secBones];
  const fps = 60;
  const attackKeysCache = { Attack_A: attackAKeys(), Attack_B: attackBKeys() };
  for (const [name, def] of Object.entries(CLIP_DEFS)) {
    const n = Math.round(def.duration * fps);
    const dt = def.duration / n;
    const pose = (t) => {
      if (name === 'Idle') return idlePose(t);
      if (name === 'Run') return runPose(t);
      return unflatten(sampleKeys(attackKeysCache[name], t, false, def.duration));
    };
    // warm up
    applyPose(rig, pose(0));
    sim.step(dt, windFor(name, 0), true);
    if (def.loop) {
      for (let c = 0; c < 3; c++) for (let i = 0; i < n; i++) { const t = i * dt; applyPose(rig, pose(t)); sim.step(dt, windFor(name, t)); }
    } else {
      for (let i = 0; i < 90; i++) { applyPose(rig, pose(0)); sim.step(dt, windFor(name, 0)); }
    }
    const times = [];
    const qv = allQ.map(() => []);
    const hp = [];
    const blink = [];
    const base = [], tip = [];
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      const p = pose(t);
      applyPose(rig, p);
      if (i > 0 || !def.loop) sim.step(dt, windFor(name, t));
      else sim.step(dt, windFor(name, t));
      rig.root.updateMatrixWorld(true);
      times.push(t);
      allQ.forEach((o, k) => qv[k].push(o.quaternion.clone()));
      hp.push(rig.N.hips.position.clone());
      blink.push(p.blink);
      base.push(rig.swordBase.getWorldPosition(v3()));
      tip.push(rig.swordTip.getWorldPosition(v3()));
    }
    if (def.loop) {
      // make primary + secondary exactly periodic: spread end mismatch across the cycle
      for (let k = 0; k < allQ.length; k++) {
        const arr = qv[k];
        const err = arr[n].clone().invert().multiply(arr[0]);
        for (let i = 0; i <= n; i++) {
          const corr = new THREE.Quaternion().slerp(err, i / n);
          arr[i] = arr[i].clone().multiply(corr);
          if (i > 0 && arr[i].dot(arr[i - 1]) < 0) arr[i].set(-arr[i].x, -arr[i].y, -arr[i].z, -arr[i].w);
        }
        arr[n] = arr[0].clone();
      }
      hp[n] = hp[0].clone();
    }
    const tracks = [];
    allQ.forEach((o, k) => {
      const vals = [];
      qv[k].forEach((q, i) => {
        if (i > 0) { const pq = qv[k][i - 1]; if (q.dot(pq) < 0) q.set(-q.x, -q.y, -q.z, -q.w); }
        vals.push(q.x, q.y, q.z, q.w);
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, times, vals));
    });
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hp.flatMap((p) => [p.x, p.y, p.z])));
    for (const tag of ['L', 'R']) {
      tracks.push(new THREE.NumberKeyframeTrack(`eyelid${tag}.morphTargetInfluences[0]`, times, blink));
      tracks.push(new THREE.NumberKeyframeTrack(`upperLash${tag}.morphTargetInfluences[0]`, times, blink));
    }
    const clip = new THREE.AnimationClip(name, def.duration, tracks);
    clips.push(clip);
    samples[name] = { times, base, tip, dt };
  }
  // restore rest-ish idle pose
  applyPose(rig, idlePose(0));
  return { clips, samples };
}
