// Toon materials, inverted-hull outline material and procedural textures.
import * as THREE from '../vendor/three.module.js';

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  // 3-step anime ramp: shadow | mid | lit. Lookup coordinate = dot(N,L)*0.5+0.5
  const data = new Uint8Array([120, 120, 120, 255, 120, 120, 120, 255, 205, 205, 205, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 5, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

export function toon(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
  return m;
}

/**
 * Toon material with a procedural "angel ring" highlight band and a vertical tint gradient,
 * both computed in object space so they stay glued to the hair while it moves.
 * mode 0: band on elevation around `center`; mode 1: band on object-space y.
 */
export function hairToon({ color, shade, highlight, center = new THREE.Vector3(), lo, hi, mode = 0, gradLo, gradHi, freq = 22 }) {
  const m = toon(color);
  m.userData.uniforms = {
    uHiColor: { value: new THREE.Color(highlight) },
    uShade: { value: new THREE.Color(shade) },
    uCenter: { value: center },
    uBand: { value: new THREE.Vector2(lo, hi) },
    uGrad: { value: new THREE.Vector2(gradLo, gradHi) },
    uMode: { value: mode },
    uFreq: { value: freq },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;\nvObjNormal = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObjPos;
varying vec3 vObjNormal;
uniform vec3 uHiColor; uniform vec3 uShade; uniform vec3 uCenter; uniform vec2 uBand; uniform vec2 uGrad; uniform int uMode; uniform float uFreq;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 d = normalize(vObjPos - uCenter);
  float ang = atan(d.x, d.z);
  float coord = (uMode == 0) ? d.y : vObjPos.y;
  float zig = abs(fract(ang * uFreq / 6.2831853) - 0.5) * 2.0; // triangle wave
  float lo = uBand.x + (uBand.y - uBand.x) * 0.35 * zig;
  float band = smoothstep(lo, lo + 0.004, coord) * (1.0 - smoothstep(uBand.y - 0.004, uBand.y, coord));
  float facing = (uMode == 0) ? smoothstep(0.35, 0.7, dot(normalize(vObjNormal), d)) : 1.0;
  float g = smoothstep(uGrad.x, uGrad.y, vObjPos.y);
  diffuseColor.rgb = mix(uShade, diffuseColor.rgb, g);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHiColor, band * facing);
}`);
  };
  m.customProgramCacheKey = () => `hair${mode}`;
  return m;
}

// Inverted hull outline. Works for Mesh and SkinnedMesh (skinning chunks included).
export function outlineMaterial(color, width) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uWidth: { value: width } },
    vertexShader: /* glsl */`
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uWidth;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed += normalize(objectNormal) * uWidth;
        #include <project_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); 
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Additive glow material for magic effects (no textures).
export function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

export function createPalette() {
  const P = {
    skin: toon(0xffe7dc),
    skinShade: toon(0xf6c9bd),
    coat: toon(0x26336a),
    coatDark: toon(0x1a2350),
    skirt: toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    coatHem: toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    shirt: toon(0xf4f3fb),
    gold: new THREE.MeshPhongMaterial({ color: 0xe0b85a, specular: 0xfff1c0, shininess: 70, emissive: 0x3a2a08 }),
    ribbon: toon(0xff6fae),
    ribbonDark: toon(0xe0508f),
    scarf: toon(0x49b9cc, { side: THREE.DoubleSide }),
    leather: toon(0x3d2a2c),
    leatherLight: toon(0x5b3f3c),
    boot: toon(0x33242a),
    sole: toon(0x1d1418),
    gloveMix: toon(0xffffff, { vertexColors: true }),
    shorts: toon(0x1b2148),
    steel: new THREE.MeshPhongMaterial({ color: 0xdfe8f5, specular: 0xffffff, shininess: 120, emissive: 0x1a2230 }),
    darkMetal: new THREE.MeshPhongMaterial({ color: 0x3a3f5a, specular: 0xaab4ff, shininess: 60 }),
    gem: new THREE.MeshBasicMaterial({ color: 0x7ff6ff, toneMapped: false }),
    runeCyan: glowMaterial(0x49e8ff, 0.9),
    mouth: new THREE.MeshBasicMaterial({ color: 0x8a2c3c }),
    tongue: new THREE.MeshBasicMaterial({ color: 0xff8b98 }),
    lash: new THREE.MeshBasicMaterial({ color: 0x2b1f3a, side: THREE.DoubleSide }),
    brow: new THREE.MeshBasicMaterial({ color: 0x8d8aa8, side: THREE.DoubleSide }),
  };
  P.outline = outlineMaterial(0x2a2140, 0.0032);
  P.outlineHair = outlineMaterial(0x4a4270, 0.0028);
  P.outlineThin = outlineMaterial(0x2a2140, 0.0018);
  return P;
}
