// Page bootstrap: renderer, camera presets, UI, contact sheet and the controller API.
import * as THREE from './vendor/three.module.js';
import { createPalette, canvasTexture } from './src/materials.js';
import { buildCharacter } from './src/character.js';
import { bakeAll, CLIP_DEFS, CONTACT } from './src/animations.js';
import { Effects } from './src/effects.js';

const VARIANT = 'L-Stylized';
const TARGET_BODY_RATIO = '4.5-5.5 heads (stylized anime, long limbs)';
const CLIP_ORDER = ['Idle', 'Run', 'Attack_A', 'Attack_B'];

window.__CHARACTER_BENCH__ = { ready: false, variant: VARIANT };

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = canvasTexture(4, 256, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#b9c1d6'); g.addColorStop(0.55, '#d9dde8'); g.addColorStop(1, '#eceef4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 60);
const CAM_TARGET = new THREE.Vector3(0.0, 0.84, 0.42);
const CAM_DIST = 3.7;
const VIEWS = { front: 0, '3/4': -32, side: -90, back: 180 };
const camState = { az: VIEWS['3/4'], el: 6, dist: CAM_DIST, view: '3/4' };
function applyCamera(cam = camera, st = camState) {
  const az = THREE.MathUtils.degToRad(st.az), el = THREE.MathUtils.degToRad(st.el);
  cam.position.set(
    CAM_TARGET.x + st.dist * Math.cos(el) * Math.sin(az),
    CAM_TARGET.y + st.dist * Math.sin(el),
    CAM_TARGET.z + st.dist * Math.cos(el) * Math.cos(az),
  );
  cam.lookAt(CAM_TARGET);
}

// lights: neutral studio setup
const hemi = new THREE.HemisphereLight(0xffffff, 0xa9a2cc, 0.95);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfffaf4, 1.85);
key.position.set(-2.0, 3.8, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -0.6, near: 0.5, far: 10 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe5ff, 0.5);
fill.position.set(2.6, 1.6, 2.2);
scene.add(fill);
const rim = new THREE.DirectionalLight(0xf2f0ff, 0.9);
rim.position.set(0.8, 2.6, -3.2);
scene.add(rim);

// ground
{
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#c9ccd8'); g.addColorStop(0.7, '#bcc0cf'); g.addColorStop(1, '#aeb3c6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(90,100,140,0.22)'; ctx.lineWidth = 2;
    for (const r of [0.12, 0.24, 0.36]) { ctx.beginPath(); ctx.arc(w / 2, h / 2, r * w, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(90,100,140,0.14)';
    ctx.beginPath(); ctx.moveTo(w / 2, h * 0.1); ctx.lineTo(w / 2, h * 0.9); ctx.moveTo(w * 0.1, h / 2); ctx.lineTo(w * 0.9, h / 2); ctx.stroke();
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3.2, 96), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);
}

// ---------------------------------------------------------------- character
const palette = createPalette();
const rig = buildCharacter(palette);
const turntable = new THREE.Group();
turntable.name = 'turntable';
scene.add(turntable);
turntable.add(rig.root);
for (const m of rig.meshes) if (!m.userData.isOutline) m.castShadow = true;

const t0 = performance.now();
const { clips, samples } = bakeAll(rig);
const bakeMs = performance.now() - t0;
const effects = new Effects(samples);
turntable.add(effects.group);

const mixer = new THREE.AnimationMixer(rig.root);
const actions = {};
for (const c of clips) {
  const a = mixer.clipAction(c);
  if (CLIP_DEFS[c.name].loop) a.setLoop(THREE.LoopRepeat, Infinity);
  else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  actions[c.name] = a;
}

// ---------------------------------------------------------------- playback state
const state = { current: 'Idle', scrub: false, auto: false, autoStep: 0, autoTimer: 0, turntable: false, speed: 1 };
function play(name, fade = 0.2) {
  const next = actions[name];
  if (!next) return false;
  const prev = actions[state.current];
  if (state.scrub) { mixer.stopAllAction(); state.scrub = false; next.reset().play(); }
  else if (prev === next && CLIP_DEFS[name].loop && next.isRunning()) { /* keep looping */ }
  else {
    next.reset(); next.setEffectiveWeight(1); next.play();
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
  }
  state.current = name;
  updateButtons();
  return true;
}
mixer.addEventListener('finished', (e) => {
  if (state.scrub) return;
  const name = e.action.getClip().name;
  if (name !== state.current) return;
  if (state.auto) nextAuto();
  else play('Idle', 0.28);
});
const AUTO = [['Idle', 4.0], ['Run', 0.7 * 5], ['Attack_A', null], ['Attack_B', null]];
function startAuto(on) {
  state.auto = on;
  document.getElementById('autoplay-btn').setAttribute('aria-pressed', String(on));
  if (on) { state.autoStep = -1; nextAuto(); }
}
function nextAuto() {
  state.autoStep = (state.autoStep + 1) % AUTO.length;
  const [name, dur] = AUTO[state.autoStep];
  state.autoTimer = dur ?? 0;
  play(name, 0.22);
}

function setAnimationTime(name, normalizedTime) {
  const a = actions[name];
  if (!a) return false;
  state.scrub = true; state.auto = false;
  document.getElementById('autoplay-btn').setAttribute('aria-pressed', 'false');
  mixer.stopAllAction();
  a.reset(); a.setEffectiveWeight(1); a.play();
  a.time = THREE.MathUtils.clamp(normalizedTime, 0, 1) * a.getClip().duration;
  mixer.update(0);
  state.current = name;
  syncEffects();
  updateButtons();
  return true;
}


const _tip = new THREE.Vector3(), _base = new THREE.Vector3();
function syncEffects() {
  const a = actions[state.current];
  rig.root.updateMatrixWorld(true);
  effects.group.updateMatrixWorld(true);
  effects.group.worldToLocal(rig.swordTip.getWorldPosition(_tip));
  effects.group.worldToLocal(rig.swordBase.getWorldPosition(_base));
  const active = a && (a.isRunning() || state.scrub || a.enabled) ? state.current : null;
  effects.update(active, a ? a.time : 0, _tip, _base);
}

// ---------------------------------------------------------------- measurement (real scene traversal)
function measure() {
  const saved = { name: state.current, scrub: state.scrub };
  setAnimationTime('Idle', 0);
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let triangles = 0, trianglesNoOutline = 0, meshCount = 0, nodeCount = 0, skinned = 0, outlineMeshes = 0;
  const materials = new Set();
  rig.root.traverse((o) => {
    nodeCount++;
    if (!o.isMesh) return;
    meshCount++;
    if (o.isSkinnedMesh) skinned++;
    const g = o.geometry;
    const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    triangles += tris;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m));
    if (o.userData.isOutline) { outlineMeshes++; return; }
    trianglesNoOutline += tris;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      box.expandByPoint(v);
    }
  });
  const size = box.getSize(new THREE.Vector3());
  const result = {
    measuredHeight: +size.y.toFixed(4), measuredWidth: +size.x.toFixed(4), measuredDepth: +size.z.toFixed(4),
    boundsMin: box.min.toArray().map((x) => +x.toFixed(4)), boundsMax: box.max.toArray().map((x) => +x.toFixed(4)),
    triangleCount: triangles, triangleCountExcludingOutlines: trianglesNoOutline,
    meshCount, outlineMeshCount: outlineMeshes, skinnedMeshCount: skinned,
    materialCount: materials.size, nodeCount,
  };
  if (saved.scrub) setAnimationTime(saved.name, 0); else { state.scrub = true; play(saved.name, 0); }
  return result;
}

// head-to-body ratio: measured head height (chin to hair top) vs total height
function measureHeadRatio(total) {
  const head = rig.N.head;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  head.traverse((o) => {
    if (!o.isMesh || o.userData.isOutline || o.isSkinnedMesh) return;
    if (!/^(face|hairMass)$/.test(o.name)) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); box.expandByPoint(v); }
  });
  const faceBox = new THREE.Box3().setFromObject(head.getObjectByName('face'), true);
  const h = box.max.y - faceBox.min.y;
  return { headHeight: +h.toFixed(4), headsTall: +(total / h).toFixed(2) };
}

// ---------------------------------------------------------------- camera interaction
function setView(name) {
  if (!(name in VIEWS)) return false;
  camState.az = VIEWS[name]; camState.el = 6; camState.dist = CAM_DIST; camState.view = name;
  applyCamera();
  updateButtons();
  return true;
}
function resetView() {
  state.turntable = false; turntable.rotation.y = 0;
  document.getElementById('turntable-btn').setAttribute('aria-pressed', 'false');
  return setView('3/4');
}
{
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, az: camState.az, el: camState.el }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    camState.az = drag.az - (e.clientX - drag.x) * 0.35;
    camState.el = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.25, -10, 60);
    camState.view = 'custom'; applyCamera(); updateButtons();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camState.dist = THREE.MathUtils.clamp(camState.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.6, 7);
    applyCamera();
  }, { passive: false });
}

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement);
window.addEventListener('resize', resize);
resize();
setView('3/4');

// ---------------------------------------------------------------- UI
function updateButtons() {
  document.querySelectorAll('[data-animation]').forEach((b) => b.classList.toggle('active', b.dataset.animation === state.current));
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === camState.view));
}
document.querySelectorAll('[data-animation]').forEach((b) => b.addEventListener('click', () => {
  startAuto(false);
  play(b.dataset.animation);
}));
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('autoplay-btn').addEventListener('click', () => startAuto(!state.auto));
document.getElementById('turntable-btn').addEventListener('click', (e) => {
  state.turntable = !state.turntable;
  e.currentTarget.setAttribute('aria-pressed', String(state.turntable));
  if (!state.turntable) turntable.rotation.y = 0;
});
document.getElementById('reset-btn').addEventListener('click', resetView);
const speed = document.getElementById('speed');
speed.addEventListener('input', () => {
  state.speed = parseFloat(speed.value);
  document.getElementById('speed-out').textContent = `${state.speed.toFixed(2)}×`;
});

// ---------------------------------------------------------------- contact sheet (offscreen RT, same 3/4 framing)
async function buildContactSheet() {
  const root = document.getElementById('contact-sheet');
  const W = 300, H = 300, SS = 2;
  const rt = new THREE.WebGLRenderTarget(W * SS, H * SS, { colorSpace: THREE.SRGBColorSpace });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(35, W / H, 0.05, 60);
  applyCamera(cam, { az: VIEWS['3/4'], el: 6, dist: CAM_DIST * 1.05 });
  const buf = new Uint8Array(W * SS * H * SS * 4);
  const big = document.createElement('canvas'); big.width = W * SS; big.height = H * SS;
  const bctx = big.getContext('2d');
  const small = document.createElement('canvas'); small.width = W; small.height = H;
  const sctx = small.getContext('2d');
  const savedTT = turntable.rotation.y;
  turntable.rotation.y = 0;
  for (const name of CLIP_ORDER) {
    const row = document.createElement('div');
    row.className = 'clip-row';
    row.innerHTML = `<h3>${name}<span>${CLIP_DEFS[name].duration.toFixed(2)}s · ${CLIP_DEFS[name].loop ? 'loop' : 'one-shot'}</span></h3>`;
    const grid = document.createElement('div'); grid.className = 'thumbs';
    row.appendChild(grid); root.appendChild(row);
    CONTACT[name].forEach(([label, nt], i) => {
      setAnimationTime(name, nt);
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, W * SS, H * SS, buf);
      renderer.setRenderTarget(null);
      const img = new ImageData(W * SS, H * SS);
      const rowBytes = W * SS * 4;
      for (let y = 0; y < H * SS; y++) img.data.set(buf.subarray((H * SS - 1 - y) * rowBytes, (H * SS - y) * rowBytes), y * rowBytes);
      bctx.putImageData(img, 0, 0);
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(big, 0, 0, W, H);
      const fig = document.createElement('figure');
      fig.className = 'thumb';
      fig.tabIndex = 0;
      fig.dataset.contactAnimation = name;
      fig.dataset.contactIndex = String(i);
      fig.dataset.normalizedTime = String(nt);
      fig.setAttribute('role', 'button');
      fig.setAttribute('aria-label', `${name} ${label} (t=${nt})`);
      const im = new Image();
      im.alt = `${name} – ${label}`;
      im.src = small.toDataURL('image/png');
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<b>${i}. ${label}</b> · t=${nt.toFixed(2)}`;
      fig.append(im, cap);
      const hold = () => setAnimationTime(name, nt);
      fig.addEventListener('click', hold);
      fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hold(); } });
      grid.appendChild(fig);
    });
    await new Promise((r) => setTimeout(r, 0));
  }
  rt.dispose();
  turntable.rotation.y = savedTT;
}

// ---------------------------------------------------------------- loop
const timer = new THREE.Timer();
function frame() {
  timer.update(); const dt = Math.min(timer.getDelta(), 1 / 20);
  if (!state.scrub) {
    mixer.update(dt * state.speed);
    if (state.auto && AUTO[state.autoStep][1] != null) {
      state.autoTimer -= dt * state.speed;
      if (state.autoTimer <= 0) nextAuto();
    }
  }
  if (state.turntable) turntable.rotation.y += dt * 0.5;
  syncEffects();
  const a = actions[state.current];
  hud.textContent = `${state.current}  ${a ? a.time.toFixed(2) : '0.00'} / ${CLIP_DEFS[state.current].duration.toFixed(2)}s${state.scrub ? '  (held)' : ''}${state.auto ? '  · auto' : ''}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
const hud = document.getElementById('hud');

async function init() {
  let threeVersion = `r${THREE.REVISION}`;
  try {
    const pkg = await (await fetch('./vendor/three.package.json')).json();
    if (pkg.version && pkg.version.split('.')[1] === THREE.REVISION) threeVersion = pkg.version;
  } catch { /* keep revision string */ }
  const m = measure();
  const ratio = measureHeadRatio(m.measuredHeight);
  await buildContactSheet();
  play('Idle', 0);
  state.scrub = false;
  mixer.stopAllAction(); actions.Idle.reset().play(); state.current = 'Idle';

  const api = window.__CHARACTER_BENCH__;
  Object.assign(api, {
    ready: true,
    variant: VARIANT,
    threeVersion,
    threeRevision: THREE.REVISION,
    targetBodyRatio: TARGET_BODY_RATIO,
    measuredHeadsTall: ratio.headsTall,
    measuredHeadHeight: ratio.headHeight,
    ...m,
    animations: mixer._actions.map((a) => a.getClip().name).filter((n, i, arr) => arr.indexOf(n) === i),
    animationDurations: Object.fromEntries(clips.map((c) => [c.name, +c.duration.toFixed(3)])),
    bakeMs: Math.round(bakeMs),
    rendererInfo: () => ({ ...renderer.info.render, programs: renderer.info.programs?.length }),
    setAnimation: (name) => { startAuto(false); return play(name); },
    setAnimationTime,
    setView,
    resetView,
    setTurntable: (on) => { state.turntable = !!on; if (!on) turntable.rotation.y = 0; },
    setAutoPlay: (on) => startAuto(!!on),
    setCamera: (pos, target) => { camera.position.set(...pos); camera.lookAt(new THREE.Vector3(...target)); camState.view = 'custom'; },
    getState: () => ({ current: state.current, time: actions[state.current]?.time ?? 0, scrub: state.scrub, auto: state.auto, view: camState.view }),
    scene, characterRoot: rig.root, THREE,
  });
  api.animations = clips.map((c) => c.name);
  const panel = document.getElementById('metadata-panel');
  const rows = [
    ['variant', VARIANT], ['three.js', threeVersion], ['target ratio', TARGET_BODY_RATIO],
    ['measured height', `${m.measuredHeight.toFixed(3)} m`], ['heads tall', `${ratio.headsTall} (head ${ratio.headHeight.toFixed(3)} m)`],
    ['triangles', `${m.triangleCount.toLocaleString()} (${m.triangleCountExcludingOutlines.toLocaleString()} w/o outline)`],
    ['meshes', `${m.meshCount} (${m.skinnedMeshCount} skinned, ${m.outlineMeshCount} outline)`],
    ['materials', m.materialCount], ['nodes', m.nodeCount],
    ['clips', clips.map((c) => `${c.name} ${c.duration.toFixed(2)}s`).join(', ')],
    ['bake', `${Math.round(bakeMs)} ms`],
  ];
  panel.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  document.getElementById('loading').classList.add('done');
  updateButtons();
}

requestAnimationFrame(frame);
init().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = `Error: ${err.message}`;
});
