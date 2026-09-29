// Character rig (semantic Object3D hierarchy) + procedural body, outfit, hands and rapier.
import * as THREE from '../vendor/three.module.js';
import {
  DEG, clamp, lerp, smoothstep, v3, profile, loft, sweep, clothSheet, mergeGeos, colorize,
  skinRadial, skinAlongChain, smoothNormalClone, weldNormals,
} from './util.js';
import { buildHead, bowGeometry } from './head.js';

const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const COL = {
  navy: rgb(0x26336a), navyDark: rgb(0x1c2654), white: rgb(0xf4f3fb), gold: rgb(0xd9b35c),
  pink: rgb(0xff6fae), skirt: rgb(0x33457f), skirtDark: rgb(0x2a3a70), frill: rgb(0xf7f5fc),
  leather: rgb(0x3d2a2c), skin: rgb(0xffe7dc),
};
const signedTheta = (th) => (th > Math.PI ? th - Math.PI * 2 : th);

export function buildCharacter(P) {
  const root = new THREE.Group();
  root.name = 'characterRoot';
  const N = {};
  const node = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name; o.position.set(x, y, z); o.rotation.order = 'ZXY';
    parent.add(o); N[name] = o; return o;
  };

  // ---------------------------------------------------------------- rig
  const hips = node('hips', root, 0, 0.9, 0);
  const torso = node('torso', hips, 0, 0.06, 0);
  const chest = node('chest', torso, 0, 0.13, 0);
  const neck = node('neck', chest, 0, 0.145, -0.006);
  const head = node('head', neck, 0, 0.065, 0.006);
  for (const [s, t] of [[1, 'L'], [-1, 'R']]) {
    const sh = node(`shoulder${t}`, chest, s * 0.055, 0.105, -0.006);
    const arm = node(`arm${t}`, sh, s * 0.09, 0, 0);
    const fore = node(`forearm${t}`, arm, 0, -0.245, 0);
    node(`hand${t}`, fore, 0, -0.225, 0);
    const th = node(`thigh${t}`, hips, s * 0.085, -0.05, 0);
    const shin = node(`shin${t}`, th, 0, -0.39, 0);
    node(`foot${t}`, shin, 0, -0.385, 0);
  }

  const meshes = [];
  const skinnedList = [];
  const reg = {
    mesh(m) { meshes.push(m); if (m.castShadow === false) m.castShadow = true; return m; },
    outline(m, mat, smooth = false) {
      const g = smooth ? smoothNormalClone(m.geometry) : m.geometry;
      const o = new THREE.Mesh(g, mat);
      o.name = `${m.name}_outline`; o.userData.isOutline = true; o.castShadow = false;
      m.add(o);
    },
    skinned(mesh, bones, outlineMat) { skinnedList.push({ mesh, bones, outlineMat }); },
  };
  const add = (geo, mat, name, parent, outline = P.outline, smooth = false) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; parent.add(m); reg.mesh(m);
    if (outline) reg.outline(m, outline, smooth);
    return m;
  };

  // ---------------------------------------------------------------- torso / coat body
  add(loft([
    { y: -0.108, rx: 0.07, rz: 0.055 },
    { y: -0.085, rx: 0.112, rz: 0.082 },
    { y: -0.03, rx: 0.126, rz: 0.09, rzb: 0.1 },
    { y: 0.03, rx: 0.11, rz: 0.08, rzb: 0.086 },
    { y: 0.08, rx: 0.088, rz: 0.068 },
  ], 32, { capBottom: true }), P.shorts, 'pelvis', hips);

  const coatColorAbd = (s, th) => {
    const a = Math.abs(signedTheta(th));
    if (a > 1.25 && a < 1.9) return COL.navyDark;
    return COL.navy;
  };
  add(loft([
    { y: -0.035, rx: 0.09, rz: 0.07 },
    { y: 0.03, rx: 0.081, rz: 0.063 },
    { y: 0.09, rx: 0.088, rz: 0.068 },
    { y: 0.155, rx: 0.097, rz: 0.073 },
  ], 48, { colorFn: coatColorAbd }), P.gloveMix, 'coatWaist', torso);

  const bust = (th, i) => {
    const a = signedTheta(th);
    const amp = [0, 0.06, 0.15, 0.12, 0.03, 0, 0, 0][i] || 0;
    return 1 + amp * (Math.exp(-((a - 0.48) ** 2) / 0.09) + Math.exp(-((a + 0.48) ** 2) / 0.09));
  };
  const coatColorChest = (s, th) => {
    const a = Math.abs(signedTheta(th));
    const half = 0.52 * smoothstep(0.035, 0.165, s.y);
    if (a < half) return COL.white;
    if (a < half + 0.09 && s.y > 0.03) return COL.gold;
    if (a > 1.3 && a < 1.85) return COL.navyDark;
    return COL.navy;
  };
  add(loft([
    { y: -0.035, rx: 0.095, rz: 0.072, fn: bust },
    { y: 0.015, rx: 0.1, rz: 0.074, fn: bust },
    { y: 0.05, rx: 0.103, rz: 0.075, fn: bust },
    { y: 0.085, rx: 0.106, rz: 0.072, fn: bust },
    { y: 0.12, rx: 0.103, rz: 0.066, p: 2.5, fn: bust },
    { y: 0.148, rx: 0.08, rz: 0.056, p: 2.3 },
    { y: 0.168, rx: 0.048, rz: 0.043 },
    { y: 0.176, rx: 0.036, rz: 0.034 },
  ], 64, { colorFn: coatColorChest, capTop: true }), P.gloveMix, 'coatChest', chest);

  // gold buttons (double breasted)
  for (const y of [0.005, 0.045, 0.085]) for (const s of [1, -1]) {
    const b = new THREE.SphereGeometry(0.0065, 12, 8); b.scale(1, 1, 0.6);
    b.translate(s * 0.03, y, 0.07 - (y > 0.06 ? 0.001 : 0));
    add(b, P.gold, 'button', torso, null);
  }
  for (const s of [1, -1]) {
    const b = new THREE.SphereGeometry(0.006, 12, 8); b.scale(1, 1, 0.6); b.translate(s * 0.058, 0.0, 0.083);
    add(b, P.gold, 'buttonChest', chest, null);
  }
  // neck
  add(loft([
    { y: -0.02, rx: 0.03, rz: 0.03 }, { y: 0.04, rx: 0.026, rz: 0.028 }, { y: 0.1, rx: 0.028, rz: 0.03 },
  ], 24), P.skin, 'neckSkin', neck, P.outlineThin);

  // chest ribbon (pink bow on the white shirt front)
  {
    const bow = add(bowGeometry(0.034), P.ribbon, 'chestRibbon', chest, P.outlineThin, true);
    bow.position.set(0, 0.128, 0.064); bow.rotation.x = -0.35;
  }

  // ---------------------------------------------------------------- scarf
  const scarf = node('scarf', chest, 0, 0.166, -0.004);
  {
    const g = new THREE.TorusGeometry(0.053, 0.026, 18, 64);
    g.rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const th = Math.atan2(x, z);
      const r = Math.hypot(x, z);
      const fold = 1 + 0.05 * Math.sin(th * 7 + y * 90);
      const k = 1 + 0.18 * smoothstep(0.2, -1, Math.cos(th)); // bulkier at back
      p.setXYZ(i, (x / r) * (0.053 + (r - 0.053) * fold * k), y * 1.35 * k, (z / r) * (0.056 + (r - 0.053) * fold * k));
    }
    g.deleteAttribute('uv'); g.computeVertexNormals(); weldNormals(g);
    add(g, P.scarf, 'scarfWrap', scarf, P.outline);
    const knot = new THREE.SphereGeometry(0.03, 16, 12); knot.scale(1.1, 0.9, 0.8); knot.translate(0.04, -0.005, -0.055);
    add(knot, P.scarf, 'scarfKnot', scarf, P.outline);
  }
  const scarfChains = [];
  const scarfTails = [
    { tag: 'A', w: 0.068, pts: [v3(0.045, -0.005, -0.055), v3(0.05, -0.09, -0.09), v3(0.055, -0.19, -0.104), v3(0.058, -0.28, -0.132), v3(0.06, -0.36, -0.172), v3(0.062, -0.43, -0.207)] },
    { tag: 'B', w: 0.058, pts: [v3(0.028, -0.01, -0.062), v3(0.014, -0.085, -0.094), v3(0.005, -0.17, -0.106), v3(0.0, -0.25, -0.13), v3(-0.004, -0.32, -0.165)] },
  ];
  for (const st of scarfTails) {
    const g = sweep(st.pts, {
      tubular: 30, radial: 8, curl: 0.12,
      widthFn: (t) => st.w * (1 - 0.15 * t) * (t > 0.96 ? 0.7 : 1),
      thickFn: () => 0.009, outwardFn: () => v3(0, 0, -1), capStart: true, capEnd: true,
      twistFn: (t) => 0.25 * Math.sin(t * 5),
    });
    skinAlongChain(g, st.pts, 0);
    const bones = [];
    let parent = scarf;
    for (let k = 0; k < st.pts.length - 1; k++) {
      const b = new THREE.Bone();
      b.name = k === 0 ? `scarfTail${st.tag}` : `scarfTail${st.tag}_${k}`;
      b.position.copy(k === 0 ? st.pts[0] : st.pts[k].clone().sub(st.pts[k - 1]));
      parent.add(b); bones.push(b); parent = b;
    }
    const m = new THREE.SkinnedMesh(g, P.scarf);
    m.name = `scarfTailMesh${st.tag}`; m.frustumCulled = false;
    scarf.add(m); reg.mesh(m); reg.skinned(m, bones, P.outline);
    scarfChains.push({ name: `scarfTail${st.tag}`, bones, tipLocal: st.pts[st.pts.length - 1].clone().sub(st.pts[st.pts.length - 2]) });
  }

  // ---------------------------------------------------------------- skirt (skinned radial rig)
  const skirtY = 0.058, skirtL = 0.25;
  const skirtRoot = new THREE.Bone(); skirtRoot.name = 'skirt'; skirtRoot.position.set(0, skirtY, 0); hips.add(skirtRoot);
  const skirtAngles = [];
  const skirtBones = [skirtRoot];
  const skirtChains = [];
  const SK = { rx0: 0.1, rz0: 0.084, rx1: 0.19, rz1: 0.17 };
  {
    const rows = 14, cols = 96;
    const tri = (x) => 1 - 4 * Math.abs((x - Math.floor(x)) - 0.5);
    const Pg = [];
    for (let r = 0; r <= rows; r++) {
      const f = r / rows, row = [];
      for (let c = 0; c < cols; c++) {
        const th = (c / cols) * Math.PI * 2;
        const L = skirtL + 0.012 * -Math.cos(th);
        const ff = Math.pow(f, 0.92);
        const amp = lerp(0.003, 0.02, f) * tri((c / cols) * 24 + 0.25);
        const rx = lerp(SK.rx0, SK.rx1, ff) + amp, rz = lerp(SK.rz0, SK.rz1, ff) + amp;
        row.push(v3(Math.sin(th) * rx, skirtY - f * L, Math.cos(th) * rz));
      }
      Pg.push(row);
    }
    const body = clothSheet(Pg, 0.004, {
      closedCols: true,
      colorFn: (rf) => (rf > 0.82 && rf < 0.89 ? COL.pink : rf < 0.07 ? COL.skirtDark : COL.skirt),
    });
    const Fg = [];
    for (let r = 0; r <= 4; r++) {
      const f = r / 4, row = [];
      for (let c = 0; c < cols; c++) {
        const th = (c / cols) * Math.PI * 2;
        const L = skirtL + 0.012 * -Math.cos(th);
        const ruffle = 0.006 * Math.sin(th * 44) * f;
        const rx = SK.rx1 - 0.026 + 0.034 * f + ruffle, rz = SK.rz1 - 0.026 + 0.034 * f + ruffle;
        row.push(v3(Math.sin(th) * rx, skirtY - L + 0.012 - f * 0.045, Math.cos(th) * rz));
      }
      Fg.push(row);
    }
    const frill = clothSheet(Fg, 0.003, { closedCols: true, colorFn: () => COL.frill });
    const g = mergeGeos([body, frill]);
    const nb = 12;
    for (let i = 0; i < nb; i++) {
      const th = (i / nb) * Math.PI * 2;
      skirtAngles.push(th);
      const b = new THREE.Bone(); b.name = `skirt_${i}`;
      b.position.set(Math.sin(th) * SK.rx0, 0, Math.cos(th) * SK.rz0);
      skirtRoot.add(b); skirtBones.push(b);
      skirtChains.push({ name: b.name, bones: [b], tipLocal: v3(Math.sin(th) * (SK.rx1 - SK.rx0), -skirtL, Math.cos(th) * (SK.rz1 - SK.rz0)), radial: true });
    }
    skinRadial(g, skirtAngles, skirtY, skirtL + 0.03, true);
    const m = new THREE.SkinnedMesh(g, P.skirt);
    m.name = 'skirtMesh'; m.frustumCulled = false;
    hips.add(m); reg.mesh(m); reg.skinned(m, skirtBones, P.outline);
  }

  // ---------------------------------------------------------------- coat hem (open front tails)
  const hemY = 0.088;
  const hemRoot = new THREE.Bone(); hemRoot.name = 'coatHem'; hemRoot.position.set(0, hemY, 0); hips.add(hemRoot);
  const hemBones = [hemRoot];
  const hemChains = [];
  {
    const a0 = 52 * DEG, a1 = 308 * DEG;
    const rows = 12, cols = 64;
    const Lf = (th) => 0.2 + 0.17 * Math.pow((1 - Math.cos(th)) / 2, 1.5);
    const rOf = (r0, d) => r0 + 0.03 * smoothstep(0, 0.035, d) + 0.4 * d;
    const Pg = [];
    for (let r = 0; r <= rows; r++) {
      const f = r / rows, row = [];
      for (let c = 0; c <= cols; c++) {
        const th = lerp(a0, a1, c / cols);
        const d = f * Lf(th);
        row.push(v3(Math.sin(th) * rOf(0.094, d), hemY - d, Math.cos(th) * rOf(0.078, d)));
      }
      Pg.push(row);
    }
    const g = clothSheet(Pg, 0.005, {
      closedCols: false,
      colorFn: (rf, cf) => (rf > 0.9 || cf < 0.025 || cf > 0.975 ? COL.gold : rf > 0.84 ? COL.navyDark : COL.navy),
    });
    const angles = [];
    const nb = 9;
    for (let i = 0; i < nb; i++) {
      const th = lerp(a0, a1, i / (nb - 1));
      angles.push(th);
      const b = new THREE.Bone(); b.name = `coatHem_${i}`;
      b.position.set(Math.sin(th) * 0.094, 0, Math.cos(th) * 0.078);
      hemRoot.add(b); hemBones.push(b);
      const L = Lf(th);
      hemChains.push({ name: b.name, bones: [b], tipLocal: v3(Math.sin(th) * (rOf(0.094, L) - 0.094), -L, Math.cos(th) * (rOf(0.078, L) - 0.078)), radial: true });
    }
    skinRadial(g, angles, hemY, 0.37, false);
    const m = new THREE.SkinnedMesh(g, P.coatHem);
    m.name = 'coatHemMesh'; m.frustumCulled = false;
    hips.add(m); reg.mesh(m); reg.skinned(m, hemBones, P.outline);
  }
  // belt + buckle
  add(loft([{ y: 0.07, rx: 0.1, rz: 0.083 }, { y: 0.097, rx: 0.097, rz: 0.08 }], 48), P.leather, 'belt', hips, P.outlineThin);
  {
    const b = new THREE.BoxGeometry(0.03, 0.03, 0.008); b.translate(0, 0.083, 0.083);
    add(b, P.gold, 'beltBuckle', hips, P.outlineThin, true);
  }

  // ---------------------------------------------------------------- arms
  for (const [s, t] of [[1, 'L'], [-1, 'R']]) {
    const arm = N[`arm${t}`], fore = N[`forearm${t}`], hand = N[`hand${t}`];
    const puff = new THREE.SphereGeometry(0.047, 24, 16); puff.scale(1.0, 0.95, 1.0); puff.translate(s * -0.004, -0.006, 0);
    add(puff, P.gloveMix, `shoulderPuff${t}`, arm).geometry = colorize(puff, 0x26336a);
    // epaulette
    {
      const e = new THREE.CylinderGeometry(0.036, 0.04, 0.008, 20); e.scale(1, 1, 0.85);
      e.rotateZ(s * -0.35); e.translate(s * 0.006, 0.036, 0);
      add(e, P.gold, `epaulette${t}`, arm, P.outlineThin);
    }
    add(loft([
      { y: -0.25, rx: 0.031, rz: 0.032 }, { y: -0.16, rx: 0.033, rz: 0.034 }, { y: -0.06, rx: 0.037, rz: 0.038 }, { y: 0.0, rx: 0.04, rz: 0.04 },
    ], 24), P.coat, `sleeveUpper${t}`, arm);
    const elbow = new THREE.SphereGeometry(0.031, 18, 12);
    add(elbow, P.coat, `elbow${t}`, fore, null);
    add(loft([
      { y: -0.2, rx: 0.026, rz: 0.027 }, { y: -0.1, rx: 0.029, rz: 0.03 }, { y: 0.0, rx: 0.031, rz: 0.031 },
    ], 24), P.coat, `sleeveFore${t}`, fore);
    add(loft([
      { y: -0.222, rx: 0.036, rz: 0.037 }, { y: -0.2, rx: 0.035, rz: 0.036 }, { y: -0.175, rx: 0.031, rz: 0.032 },
    ], 24, { colorFn: (sec) => (sec.y < -0.215 ? COL.gold : COL.white) }), P.gloveMix, `cuff${t}`, fore, P.outlineThin);
    buildHand(s, t, hand, P, add);
  }

  // ---------------------------------------------------------------- legs
  for (const [s, t] of [[1, 'L'], [-1, 'R']]) {
    const th = N[`thigh${t}`], shin = N[`shin${t}`], foot = N[`foot${t}`];
    add(loft([
      { y: -0.4, rx: 0.042, rz: 0.043 }, { y: -0.3, rx: 0.048, rz: 0.049 }, { y: -0.16, rx: 0.057, rz: 0.058 },
      { y: -0.04, rx: 0.065, rz: 0.066, cx: s * 0.004 }, { y: 0.05, rx: 0.062, rz: 0.062, cx: -s * 0.01 },
    ], 28), P.skin, `thighSkin${t}`, th, P.outlineThin);
    add(loft([
      { y: -0.41, rx: 0.046, rz: 0.047 }, { y: -0.3, rx: 0.051, rz: 0.052 }, { y: -0.236, rx: 0.055, rz: 0.056 },
    ], 28), P.boot, `bootUpper${t}`, th);
    add(loft([
      { y: -0.245, rx: 0.058, rz: 0.059 }, { y: -0.225, rx: 0.062, rz: 0.063 }, { y: -0.2, rx: 0.064, rz: 0.066 },
    ], 28, { colorFn: (sec) => (sec.y > -0.21 ? COL.pink : COL.leather) }), P.gloveMix, `bootCuff${t}`, th);
    {
      const strap = loft([{ y: -0.31, rx: 0.053, rz: 0.054 }, { y: -0.296, rx: 0.053, rz: 0.054 }], 28);
      add(strap, P.leather, `bootStrap${t}`, th, null);
      const bk = new THREE.BoxGeometry(0.004, 0.018, 0.016); bk.translate(s * 0.054, -0.303, 0);
      add(bk, P.gold, `bootBuckle${t}`, th, null);
    }
    add(new THREE.SphereGeometry(0.047, 20, 14), P.boot, `knee${t}`, shin, null);
    add(loft([
      { y: -0.39, rx: 0.031, rz: 0.034 }, { y: -0.33, rx: 0.033, rz: 0.036 }, { y: -0.2, rx: 0.043, rz: 0.046 },
      { y: -0.1, rx: 0.048, rz: 0.05, cz: -0.004 }, { y: 0.0, rx: 0.046, rz: 0.047 }, { y: 0.03, rx: 0.044, rz: 0.045 },
    ], 28), P.boot, `bootShin${t}`, shin);
    // foot: lofted along +Z, flat sole at y = -0.075
    const footSecs = [
      { z: -0.05, rx: 0.02, top: 0.028, bot: 0.04, cy: -0.037 },
      { z: -0.036, rx: 0.029, top: 0.05, bot: 0.04, cy: -0.035 },
      { z: 0.0, rx: 0.034, top: 0.062, bot: 0.08, cy: 0.0 },
      { z: 0.05, rx: 0.036, top: 0.04, bot: 0.045, cy: -0.032 },
      { z: 0.1, rx: 0.034, top: 0.026, bot: 0.028, cy: -0.049 },
      { z: 0.135, rx: 0.023, top: 0.017, bot: 0.018, cy: -0.058 },
      { z: 0.152, rx: 0.008, top: 0.007, bot: 0.012, cy: -0.063 },
    ];
    const fg = loft(footSecs.map((f) => ({ y: f.z, rx: f.rx, rz: f.bot, rzb: f.top, cz: -f.cy })), 28, { capTop: true, capBottom: true });
    fg.rotateX(Math.PI / 2);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) if (fp.getY(i) < -0.075) fp.setY(i, -0.075);
    fg.computeVertexNormals(); weldNormals(fg);
    add(fg, P.boot, `bootFoot${t}`, foot);
    const sole = fg.clone();
    const sp = sole.attributes.position;
    for (let i = 0; i < sp.count; i++) { sp.setX(i, sp.getX(i) * 1.06); sp.setY(i, Math.min(sp.getY(i), -0.066)); sp.setZ(i, sp.getZ(i) * 1.02 + 0.0005); }
    sole.computeVertexNormals();
    add(sole, P.sole, `sole${t}`, foot, null);
    const heel = new THREE.BoxGeometry(0.04, 0.024, 0.035); heel.translate(0, -0.063, -0.03);
    add(heel, P.sole, `heel${t}`, foot, null);
  }

  // ---------------------------------------------------------------- head
  const headParts = buildHead(head, P, reg);

  // ---------------------------------------------------------------- rapier
  const weaponHand = node('weaponHand', N.handR, 0.016, -0.083, 0.0);
  weaponHand.rotation.x = 34 * DEG; // blade leans slightly down from the fist
  const rapier = node('rapier', weaponHand, 0, 0, 0);
  buildRapier(rapier, P, add);
  const swordTip = node('swordTip', rapier, 0, 0, 0.848);
  const swordBase = node('swordBase', rapier, 0, 0, 0.14);

  // blink / face control proxy (animated via AnimationClip, applied to morph targets)
  const faceCtrl = node('faceCtrl', head, 0, 0, 0);

  // ---------------------------------------------------------------- skin binding + outlines
  root.updateMatrixWorld(true);
  for (const { mesh, bones, outlineMat } of skinnedList) {
    const sk = new THREE.Skeleton(bones);
    mesh.bind(sk, mesh.matrixWorld);
    mesh.castShadow = true;
    if (outlineMat) {
      const o = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
      o.name = `${mesh.name}_outline`; o.userData.isOutline = true; o.frustumCulled = false;
      mesh.parent.add(o);
      o.bind(sk, mesh.bindMatrix);
    }
  }
  root.traverse((o) => { if (o.isMesh && o.userData.isOutline) o.castShadow = false; });

  const chains = [...headParts.tails, ...scarfChains, ...skirtChains, ...hemChains];
  return { root, N, chains, eyes: headParts.eyes, swordTip, swordBase, weaponHand, rapier, faceCtrl, meshes };
}

// ---------------------------------------------------------------- hands
function buildHand(s, t, hand, P, add) {
  const med = -s; // medial direction (x sign)
  const L = COL.leather, S = COL.skin;
  const fist = t === 'R';
  const geos = [];
  geos.push(loft([
    { y: -0.088, rx: 0.012, rz: 0.026 }, { y: -0.062, rx: 0.0145, rz: 0.031 }, { y: -0.03, rx: 0.014, rz: 0.029 },
    { y: -0.004, rx: 0.0125, rz: 0.023 }, { y: 0.014, rx: 0.0118, rz: 0.02 },
  ], 20, { capTop: true, capBottom: true, colorFn: () => L }));
  const finger = (pts, r, leatherFrac) => sweep(pts, {
    tubular: 14, radial: 8, capStart: true, capEnd: true,
    widthFn: (tt) => r * 2 * (1 - 0.25 * tt), thickFn: (tt) => r * 2 * (1 - 0.25 * tt),
    outwardFn: () => v3(med, 0, 0),
    colorFn: (tt) => (tt < leatherFrac ? L : S),
  });
  const zs = [0.02, 0.0068, -0.0068, -0.02];
  const rs = [0.0074, 0.0078, 0.0074, 0.0066];
  if (fist) {
    const G = [0.016, -0.083];
    zs.forEach((z, i) => {
      const end = [392, 396, 390, 372][i];
      const pts = [v3(med * (-0.006), -0.072, z)];
      for (let phi = 168; phi <= end; phi += 32) {
        const a = G[0] + 0.0196 * Math.cos(phi * DEG), b = G[1] + 0.0196 * Math.sin(phi * DEG);
        pts.push(v3(med * a, b, z));
      }
      const fg = finger(pts, rs[i], 0.28);
      // curl plane follows the diagonal rapier grip (weaponHand tilt)
      fg.translate(-med * G[0], -G[1], 0); fg.rotateX(18 * DEG); fg.translate(med * G[0], G[1], 0);
      geos.push(fg);
    });
    geos.push(finger([v3(med * 0.004, -0.028, 0.022), v3(med * 0.012, -0.05, 0.032), v3(med * 0.024, -0.064, 0.031), v3(med * 0.031, -0.072, 0.02)], 0.0082, 0.4));
  } else {
    const len = [0.95, 1, 0.94, 0.78];
    zs.forEach((z, i) => {
      const k = len[i];
      const pts = [v3(med * -0.003, -0.078, z), v3(med * 0.0, -0.078 - 0.024 * k, z * 1.05), v3(med * 0.007, -0.078 - 0.044 * k, z * 1.08), v3(med * 0.015, -0.078 - 0.058 * k, z * 1.1)];
      geos.push(finger(pts, rs[i], 0.3));
    });
    geos.push(finger([v3(med * 0.004, -0.026, 0.022), v3(med * 0.011, -0.048, 0.036), v3(med * 0.017, -0.066, 0.042), v3(med * 0.021, -0.08, 0.041)], 0.008, 0.4));
  }
  add(mergeGeos(geos), P.gloveMix, `glove${t}`, hand, P.outlineThin);
}

// ---------------------------------------------------------------- rapier
function buildRapier(rapier, P, add) {
  // grip with spiral wrap, along +Z
  const grip = loft([-0.046, -0.03, -0.015, 0, 0.015, 0.03, 0.046].map((y, i) => ({
    y, rx: 0.0112, rz: 0.0112, fn: (th) => 1 + 0.08 * Math.sin(th * 2 + y * 420),
  })), 24);
  grip.rotateX(Math.PI / 2);
  add(grip, P.leather, 'grip', rapier, P.outlineThin);
  for (const z of [-0.047, 0.047]) {
    const r = new THREE.TorusGeometry(0.0118, 0.0032, 8, 24); r.translate(0, 0, z);
    add(r, P.gold, 'ferrule', rapier, null);
  }
  const pommel = new THREE.SphereGeometry(0.0155, 18, 12); pommel.scale(1, 1, 1.25); pommel.translate(0, 0, -0.064);
  add(pommel, P.gold, 'pommel', rapier, P.outlineThin);
  const qu = sweep([v3(-0.078, 0, 0.038), v3(-0.05, 0, 0.056), v3(0, 0, 0.056), v3(0.05, 0, 0.056), v3(0.078, 0, 0.038)], {
    tubular: 24, radial: 10, widthFn: (tt) => 0.009 - 0.003 * Math.abs(tt - 0.5), thickFn: (tt) => 0.009 - 0.003 * Math.abs(tt - 0.5),
    outwardFn: () => v3(0, 1, 0), capEnd: true,
  });
  add(qu, P.gold, 'quillons', rapier, P.outlineThin);
  for (const x of [-0.079, 0.079]) {
    const b = new THREE.SphereGeometry(0.0072, 12, 10); b.translate(x, 0, 0.036);
    add(b, P.gold, 'quillonTip', rapier, null);
  }
  const cup = new THREE.SphereGeometry(0.038, 28, 10, 0, Math.PI * 2, 0, 0.42 * Math.PI);
  cup.rotateX(Math.PI / 2); cup.scale(1, 1, 0.55); cup.translate(0, 0, 0.044);
  const cupMat = P.darkMetal.clone(); cupMat.side = THREE.DoubleSide; cupMat.color.set(0x8f9bc4);
  add(cup, cupMat, 'shellGuard', rapier, null);
  const bow = sweep([v3(0.004, 0, 0.052), v3(0.03, 0, 0.034), v3(0.037, 0, -0.008), v3(0.024, 0, -0.046), v3(0.006, 0, -0.062)], {
    tubular: 24, radial: 8, widthFn: () => 0.0065, thickFn: () => 0.0065, outwardFn: () => v3(0, 1, 0),
  });
  add(bow, P.gold, 'knuckleBow', rapier, P.outlineThin);
  // blade: diamond section, tapering
  const blade = loft([
    { y: 0.06, rx: 0.0042, rz: 0.0118, p: 1 }, { y: 0.1, rx: 0.0036, rz: 0.0104, p: 1 }, { y: 0.4, rx: 0.0032, rz: 0.0092, p: 1 },
    { y: 0.7, rx: 0.0027, rz: 0.0066, p: 1 }, { y: 0.81, rx: 0.0016, rz: 0.0034, p: 1 }, { y: 0.848, rx: 0.0002, rz: 0.0003, p: 1 },
  ], 16, { capTop: true });
  blade.rotateX(Math.PI / 2);
  add(blade, P.steel, 'blade', rapier, P.outlineThin, true);
  // magical fuller accent (cyan glow line both faces)
  for (const s of [1, -1]) {
    const f = new THREE.BoxGeometry(0.0006, 0.0028, 0.5); f.translate(s * 0.0034, 0, 0.36);
    add(f, P.runeCyan, 'fullerGlow', rapier, null).renderOrder = 3;
  }
  const gem = new THREE.OctahedronGeometry(0.0085, 0); gem.scale(1, 1.3, 0.7); gem.translate(0, 0, 0.068);
  add(gem, P.gem, 'guardGem', rapier, null);
}
