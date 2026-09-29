// Magic effects driven purely by (clip, time) so they are reproducible when scrubbing.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, smoothstep, v3 } from './util.js';

const CYAN = new THREE.Color(0x3fe6ff);
const PINK = new THREE.Color(0xff4fbf);

function ribbonMaterial(opacity) {
  return new THREE.ShaderMaterial({
    uniforms: { uCyan: { value: CYAN }, uPink: { value: PINK }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */`
      attribute float aSide; attribute float aAge;
      varying float vSide; varying float vAge;
      void main(){ vSide = aSide; vAge = aAge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCyan; uniform vec3 uPink; uniform float uOpacity;
      varying float vSide; varying float vAge;
      void main(){
        float edge = smoothstep(0.0, 0.25, vSide) * (0.55 + 0.45 * smoothstep(1.0, 0.8, vSide));
        float life = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.6);
        vec3 col = mix(uPink, uCyan, smoothstep(0.25, 0.9, vSide));
        col = mix(col, vec3(1.0), smoothstep(0.82, 1.0, vSide) * 0.55 * life);
        gl_FragColor = vec4(col, edge * life * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

function pointsMaterial(color, size) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aAlpha; varying float vAlpha; uniform float uSize;
      void main(){ vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize / -mv.z; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = smoothstep(0.5, 0.0, r);
        vec3 c = mix(uColor, vec3(1.0), smoothstep(0.25, 0.0, r) * 0.7);
        gl_FragColor = vec4(c, a * vAlpha * uOpacity);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

const mat = (color, opacity, additive = false) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
  blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false,
});

function magicCircleGeometry() {
  const parts = [];
  const ring = (r0, r1, seg = 64) => parts.push(new THREE.RingGeometry(r0, r1, seg));
  ring(0.118, 0.126); ring(0.094, 0.099); ring(0.05, 0.054);
  for (let i = 0; i < 12; i++) {
    const g = new THREE.PlaneGeometry(0.004, i % 2 ? 0.018 : 0.028);
    g.translate(0, 0.108, 0); g.rotateZ((i / 12) * Math.PI * 2); parts.push(g);
  }
  // hexagram from thin bars
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 + t * Math.PI / 3 + Math.PI / 2, a1 = a0 + (Math.PI * 2) / 3;
    const p0 = new THREE.Vector2(Math.cos(a0), Math.sin(a0)).multiplyScalar(0.094);
    const p1 = new THREE.Vector2(Math.cos(a1), Math.sin(a1)).multiplyScalar(0.094);
    const len = p0.distanceTo(p1);
    const g = new THREE.PlaneGeometry(len, 0.0035);
    g.rotateZ(Math.atan2(p1.y - p0.y, p1.x - p0.x));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, 0);
    parts.push(g);
  }
  return mergeFlat(parts);
}
function mergeFlat(parts) {
  const pos = [], idx = [];
  let off = 0;
  for (const g of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    for (const i of g.index.array) idx.push(i + off);
    off += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Effects {
  constructor(samples) {
    this.samples = samples;
    this.group = new THREE.Group();
    this.group.name = 'magicEffects';
    const G = this.group;

    // --- Attack A slash trail
    this.trailN = 56;
    const mkRibbon = (opacity) => {
      const g = new THREE.BufferGeometry();
      const n = this.trailN;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const side = new Float32Array(n * 2), age = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { side[i * 2] = 0; side[i * 2 + 1] = 1; }
      g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      g.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, ribbonMaterial(opacity));
      m.frustumCulled = false; m.renderOrder = 10; m.visible = false;
      G.add(m);
      return m;
    };
    this.trail = mkRibbon(0.92);
    this.trail.name = 'slashTrail';
    this.trailGlow = mkRibbon(0.35);
    this.trailGlow.name = 'slashTrailGlow';
    this.trailGlow.material.blending = THREE.AdditiveBlending;

    this.sparkN = 60;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sparkN * 3), 3));
    sg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.sparkN), 1));
    this.sparks = new THREE.Points(sg, pointsMaterial(0x9ff6ff, 90));
    this.sparks.name = 'slashSparks'; this.sparks.frustumCulled = false; this.sparks.visible = false; this.sparks.renderOrder = 11;
    G.add(this.sparks);
    this.rand = Array.from({ length: 400 }, (_, i) => fract(Math.sin(i * 91.7 + 13.1) * 43758.5453));

    // --- Attack B: charge at sword tip
    this.charge = new THREE.Group(); this.charge.name = 'chargeAtTip'; G.add(this.charge);
    this.orbCore = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 14), mat(0xffffff, 1));
    this.orbPink = new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 14), mat(PINK, 0.55, true));
    this.orbCyan = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), mat(CYAN, 0.28, true));
    this.circle = new THREE.Mesh(magicCircleGeometry(), mat(CYAN, 0.9));
    this.circle2 = new THREE.Mesh(magicCircleGeometry(), mat(PINK, 0.8));
    this.circle2.scale.setScalar(0.62);
    this.spinA = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.0035, 8, 48), mat(PINK, 0.9));
    this.spinB = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.003, 8, 48), mat(CYAN, 0.9));
    for (const m of [this.orbCore, this.orbPink, this.orbCyan, this.circle, this.circle2, this.spinA, this.spinB]) { m.renderOrder = 12; this.charge.add(m); }
    this.charge.visible = false;
    this.convN = 90;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.convN * 3), 3));
    cg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.convN), 1));
    this.conv = new THREE.Points(cg, pointsMaterial(0xff8be0, 70));
    this.conv.name = 'chargeParticles'; this.conv.frustumCulled = false; this.conv.visible = false;
    G.add(this.conv);

    // --- Attack B: forward wave
    this.wave = new THREE.Group(); this.wave.name = 'magicWave'; G.add(this.wave);
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 10, 64), mat(i % 2 ? PINK : CYAN, 0.9));
      r.renderOrder = 12; this.wave.add(r); this.rings.push(r);
    }
    const cone = new THREE.CylinderGeometry(0.02, 1, 1, 40, 1, true);
    cone.translate(0, 0.5, 0); cone.rotateX(Math.PI / 2); // along +Z from origin
    this.beam = new THREE.Mesh(cone, mat(CYAN, 0.35));
    this.beamCore = new THREE.Mesh(cone.clone(), mat(PINK, 0.5, true));
    this.crescent = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16, 0, Math.PI * 2, 0, 0.5), mat(0xbff8ff, 0.55));
    this.crescent.geometry.rotateX(Math.PI / 2);
    for (const m of [this.beam, this.beamCore, this.crescent]) { m.renderOrder = 11; this.wave.add(m); }
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat(0xffffff, 0.8, true));
    this.wave.add(this.flash);
    this.waveN = 70;
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.waveN * 3), 3));
    wg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.waveN), 1));
    this.waveSparks = new THREE.Points(wg, pointsMaterial(0x7ff0ff, 110));
    this.waveSparks.frustumCulled = false;
    G.add(this.waveSparks);
    this.wave.visible = false; this.waveSparks.visible = false;
  }

  sampleAt(name, t, key) {
    const S = this.samples[name];
    const f = clamp(t / S.dt, 0, S.times.length - 1);
    const i = Math.min(Math.floor(f), S.times.length - 2);
    return S[key][i].clone().lerp(S[key][i + 1], f - i);
  }

  hideAll() {
    for (const o of [this.trail, this.trailGlow, this.sparks, this.charge, this.conv, this.wave, this.waveSparks]) o.visible = false;
  }

  // name: active clip, t: clip time (s). tipWorld/baseWorld: live sword points in effect-group space.
  update(name, t, tipLocal, baseLocal) {
    this.hideAll();
    if (name === 'Attack_A') this.updateTrail(t);
    if (name === 'Attack_B') this.updateB(t, tipLocal, baseLocal);
  }

  updateTrail(t) {
    const t0 = 0.31, t1 = 0.56, win = 0.17;
    const a = Math.max(t0, t - win), b = Math.min(t, t1);
    if (b <= a + 0.004) return;
    const n = this.trailN;
    for (const [mesh, inner, outer] of [[this.trail, 0.3, 1.0], [this.trailGlow, 0.15, 1.12]]) {
      const pos = mesh.geometry.attributes.position, age = mesh.geometry.attributes.aAge;
      for (let i = 0; i < n; i++) {
        const ts = lerp(a, b, i / (n - 1));
        const base = this.sampleAt('Attack_A', ts, 'base'), tip = this.sampleAt('Attack_A', ts, 'tip');
        const p0 = base.clone().lerp(tip, inner), p1 = base.clone().lerp(tip, outer);
        pos.setXYZ(i * 2, p0.x, p0.y, p0.z); pos.setXYZ(i * 2 + 1, p1.x, p1.y, p1.z);
        const ag = clamp((t - ts) / win, 0, 1);
        age.setX(i * 2, ag); age.setX(i * 2 + 1, ag);
      }
      pos.needsUpdate = true; age.needsUpdate = true;
      mesh.visible = true;
    }
    // sparkles scattered along the arc
    const sp = this.sparks.geometry.attributes.position, sa = this.sparks.geometry.attributes.aAlpha;
    for (let i = 0; i < this.sparkN; i++) {
      const r1 = this.rand[i], r2 = this.rand[i + 100], r3 = this.rand[i + 200];
      const ts = lerp(t0, t1, r1);
      const age = (t - ts) / 0.3;
      const tip = this.sampleAt('Attack_A', ts, 'tip'), base = this.sampleAt('Attack_A', ts, 'base');
      const p = base.lerp(tip, 0.55 + 0.5 * r2);
      p.y += age > 0 ? -0.1 * age * age + 0.04 * age : 0;
      p.x += (r3 - 0.5) * 0.06 * Math.max(0, age);
      sp.setXYZ(i, p.x, p.y, p.z);
      sa.setX(i, age > 0 && age < 1 ? (1 - age) : 0);
    }
    sp.needsUpdate = true; sa.needsUpdate = true;
    this.sparks.visible = true;
  }

  updateB(t, tip, base) {
    const tStart = 0.3, tRel = 0.635;
    // ---- charge at the live sword tip
    if (t > tStart && t < tRel + 0.06) {
      const dir = tip.clone().sub(base).normalize();
      this.charge.visible = true;
      this.charge.position.copy(tip);
      this.charge.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
      const k = smoothstep(tStart, 0.58, t);
      const out = 1 - smoothstep(tRel, tRel + 0.06, t);
      const flick = 1 + 0.08 * Math.sin(t * 90);
      this.orbCore.scale.setScalar((0.35 + 0.8 * k) * flick * out);
      this.orbPink.scale.setScalar((0.3 + 0.9 * k) * flick * out);
      this.orbCyan.scale.setScalar((0.2 + 1.0 * k) * out);
      const cOpen = smoothstep(tStart, tStart + 0.1, t) * out;
      this.circle.scale.setScalar(0.4 + 0.9 * cOpen);
      this.circle.rotation.z = t * 5;
      this.circle.position.z = 0.05;
      this.circle2.scale.setScalar((0.3 + 0.5 * cOpen));
      this.circle2.rotation.z = -t * 7;
      this.circle2.position.z = 0.09;
      this.circle.material.opacity = 0.85 * cOpen;
      this.circle2.material.opacity = 0.75 * cOpen;
      this.spinA.rotation.set(t * 11, t * 7, 0); this.spinA.scale.setScalar(0.6 + 0.6 * k);
      this.spinB.rotation.set(-t * 9, 0, t * 13); this.spinB.scale.setScalar(0.5 + 0.7 * k);
      this.spinA.material.opacity = 0.9 * out; this.spinB.material.opacity = 0.9 * out;
      // converging motes
      const cp = this.conv.geometry.attributes.position, ca = this.conv.geometry.attributes.aAlpha;
      for (let i = 0; i < this.convN; i++) {
        const r1 = this.rand[i], r2 = this.rand[i + 100], r3 = this.rand[i + 200];
        const cyc = fract((t - tStart) / 0.28 + r1);
        const rad = (1 - cyc) * (0.45 + 0.2 * r2);
        const th = r2 * 6.283 + cyc * 3, ph = Math.acos(2 * r3 - 1);
        cp.setXYZ(i, tip.x + rad * Math.sin(ph) * Math.cos(th), tip.y + rad * Math.cos(ph), tip.z + rad * Math.sin(ph) * Math.sin(th));
        ca.setX(i, smoothstep(0, 0.3, cyc) * (t < tRel ? 1 : 0) * smoothstep(tStart, tStart + 0.08, t));
      }
      cp.needsUpdate = true; ca.needsUpdate = true;
      this.conv.visible = t < tRel;
    }
    // ---- release + forward energy wave from the tip position at release
    if (t >= tRel - 0.005 && t < 1.08) {
      const O = this.sampleAt('Attack_B', tRel, 'tip');
      const B = this.sampleAt('Attack_B', tRel, 'base');
      const D = O.clone().sub(B).normalize();
      D.add(v3(0, 0, 1.2)).normalize(); D.y *= 0.35; D.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), D);
      const tau = t - tRel;
      this.wave.visible = true;
      this.wave.position.copy(O);
      this.wave.quaternion.copy(q);
      const fl = 1 - smoothstep(0.0, 0.12, tau);
      this.flash.scale.setScalar(0.03 + 0.16 * smoothstep(0, 0.04, tau));
      this.flash.material.opacity = 0.85 * fl;
      this.flash.visible = fl > 0.01;
      this.rings.forEach((r, i) => {
        const tt = tau - i * 0.045;
        const on = tt > 0 && tt < 0.36;
        r.visible = on;
        if (!on) return;
        const u = tt / 0.36;
        const s = 0.07 + 0.5 * Math.pow(u, 0.6);
        r.scale.set(s, s, s);
        r.position.set(0, 0, 0.6 * Math.pow(u, 0.75) + 0.04);
        r.material.opacity = 0.9 * (1 - u) ** 1.2;
      });
      const bu = clamp(tau / 0.3, 0, 1);
      const bl = 0.85 * Math.pow(bu, 0.55);
      const bf = 1 - smoothstep(0.18, 0.4, tau);
      this.beam.scale.set(0.05 + 0.2 * bu, 0.05 + 0.2 * bu, Math.max(0.001, bl));
      this.beamCore.scale.set(0.02 + 0.08 * bu, 0.02 + 0.08 * bu, Math.max(0.001, bl * 0.95));
      this.beam.material.opacity = 0.22 * bf; this.beamCore.material.opacity = 0.45 * bf;
      this.beam.visible = this.beamCore.visible = bf > 0.01;
      const cu = clamp(tau / 0.34, 0, 1);
      const cr = 0.12 + 0.36 * cu;
      this.crescent.scale.set(cr, cr, cr * 0.45);
      this.crescent.position.set(0, 0, 0.08 + 0.7 * Math.pow(cu, 0.7));
      this.crescent.material.opacity = 0.55 * (1 - cu) ** 1.3;
      this.crescent.visible = cu < 0.999;
      const wp = this.waveSparks.geometry.attributes.position, wa = this.waveSparks.geometry.attributes.aAlpha;
      const pp = v3();
      for (let i = 0; i < this.waveN; i++) {
        const r1 = this.rand[i + 50], r2 = this.rand[i + 150], r3 = this.rand[i + 250];
        const u = clamp((tau - r1 * 0.12) / 0.4, 0, 1);
        const ang = r2 * 6.283, rad = (0.05 + 0.4 * u) * (0.5 + r3);
        pp.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0.9 * Math.pow(u, 0.7) * (0.6 + 0.5 * r3)).applyQuaternion(q).add(O);
        wp.setXYZ(i, pp.x, pp.y, pp.z);
        wa.setX(i, u > 0 && u < 1 ? (1 - u) : 0);
      }
      wp.needsUpdate = true; wa.needsUpdate = true;
      this.waveSparks.visible = true;
    }
  }
}
function fract(x) { return x - Math.floor(x); }
