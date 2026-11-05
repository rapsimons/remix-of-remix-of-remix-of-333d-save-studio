import * as THREE from "three";
import type { SceneLight } from "./types";

/**
 * Optical disc shader ported from annnguyentt/vibe-coding (cd-case).
 * Artwork + spectral grating rainbow + glossy varnish glare, all in one pass,
 * so printed art can never float above the disc. Constants are authored for a
 * 120 mm CD and scaled by uR (disc radius in local units).
 */

const STUDIO = /* glsl */ `
  float box(vec2 p, vec2 c, vec2 hs, float soft) {
    vec2 q = abs(p - c) - hs;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
    return 1.0 - smoothstep(-soft, soft, d);
  }
  float band(float q, float c, float hw, float soft) {
    return 1.0 - smoothstep(hw - soft, hw + soft, abs(q - c));
  }
  float flags(float q) {
    float k = band(q, 0.27, 0.07, 0.02);
    k = max(k, band(q, 0.74, 0.12, 0.03));
    k = max(k, band(q, -0.32, 0.08, 0.02));
    k = max(k, band(q, -0.86, 0.14, 0.03));
    return k;
  }
  float hot(float q) {
    return band(q, 0.48, 0.07, 0.02) + band(q, 1.08, 0.14, 0.03) + band(q, -0.56, 0.08, 0.02) +
      0.8 * band(q, -1.25, 0.15, 0.03);
  }
  // smooth, featureless surround: no windows, bars or panels to reflect —
  // only the soft key and the user's gel lights show up in the disc
  vec3 room(vec3 d) {
    d = normalize(d);
    vec3 dim = vec3(0.03, 0.032, 0.036);
    float up = smoothstep(-0.6, 1.0, d.y);
    vec3 c = dim + vec3(0.32) * up;
    c += vec3(1.6) * pow(max(dot(d, normalize(vec3(-0.4, 0.6, 0.7))), 0.0), 24.0);
    return c;
  }
  // the uploaded background image, seen as a screen-facing reflection
  vec3 envRefl(vec3 d) {
    d = normalize(d);
    vec2 euv = clamp(d.xy * 0.5 + 0.5, 0.0, 1.0);
    vec3 c = textureLod(uEnv, euv, uEnvBlur * 9.0).rgb;
    return c * c * uEnvStr * 1.4; // to linear-ish, so bright parts glint
  }
  vec3 studio(vec3 d) {
    return room(d) * (1.0 - 0.6 * uHasEnv) + envRefl(d) * uHasEnv;
  }
  vec3 glare(vec3 d) { return max(studio(d) - vec3(0.45), 0.0); }
  const vec3 KEY = vec3(-0.625, 0.218, 0.75);
  const vec3 STRIP = vec3(0.725, 0.028, 0.688);
  const vec3 TOP = vec3(0.031, 0.786, 0.618);
  const vec3 BOUNCE = vec3(0.069, -0.722, 0.688);
  float fresnel(float cosv, float n) {
    float f0 = (n - 1.0) / (n + 1.0);
    f0 *= f0;
    return f0 + (1.0 - f0) * pow(1.0 - clamp(cosv, 0.0, 1.0), 5.0);
  }
`;

const VERT = /* glsl */ `
  attribute float aFace;
  varying vec3 vLocal;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vRad;
  varying vec3 vTan;
  varying float vFace;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vP = mv.xyz;
    vN = normalize(normalMatrix * normal);
    vec2 r = normalize(position.xy + vec2(1e-5, 0.0));
    vRad = normalize(mat3(modelViewMatrix) * vec3(r, 0.0));
    vTan = normalize(mat3(modelViewMatrix) * vec3(-r.y, r.x, 0.0));
    vFace = aFace;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uArt;
  uniform sampler2D uEnv;
  uniform float uHasEnv;
  uniform float uEnvStr;
  uniform float uEnvBlur;
  uniform float uHasArt;
  uniform sampler2D uArtBack;
  uniform float uHasArtBack;
  uniform float uRainbow;
  uniform float uR;
  uniform float uArtIn;
  uniform float uPrintOut;
  uniform vec3 uTint;
  uniform vec3 uL[4];
  uniform vec3 uLc[4];
  uniform int uLn;
  varying vec3 vLocal;
  varying vec3 vP;
  varying vec3 vN;
  varying vec3 vRad;
  varying vec3 vTan;
  varying float vFace;
  ${STUDIO}
  vec3 bump3(vec3 x, vec3 y0) { return clamp(1.0 - x * x - y0, 0.0, 1.0); }
  vec3 spectral(float w) {
    float x = clamp((w - 400.0) / 300.0, 0.0, 1.0);
    vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
    vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
    vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
    vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
    vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
    vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
    float inside = step(380.0, w) * step(w, 760.0);
    return (bump3(c1 * (x - x1), y1) + bump3(c2 * (x - x2), y2)) * inside;
  }
  vec3 grating(vec3 L, vec3 V, float spread) {
    vec3 H = normalize(L) + V;
    float along = dot(H, vTan);
    float u = abs(dot(H, vRad));
    float w = exp(-along * along / (spread * spread));
    return (spectral(1600.0 * u) + 0.75 * spectral(800.0 * u) + 0.45 * spectral(533.3 * u)) * w;
  }
  vec3 lights(vec3 N) {
    return vec3(0.42) + vec3(0.62) * max(dot(N, KEY), 0.0) + vec3(0.28) * max(dot(N, STRIP), 0.0) +
      vec3(0.18) * max(dot(N, TOP), 0.0);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(-vP);
    if (dot(N, V) < 0.0) N = -N;
    float cosv = max(dot(N, V), 0.0);
    vec3 R = reflect(-V, N);
    float k = 60.0 / uR;
    float r = length(vLocal.xy) * k; // CD-equivalent radius in mm
    vec3 col;
    if (vFace > 1.5) {
      col = vec3(0.3, 0.31, 0.33) + studio(R) * 0.25;
    } else {
      vec3 rainbow = grating(KEY, V, 0.05) * 1.6 + grating(STRIP, V, 0.045) * 1.4 +
        grating(TOP, V, 0.06) * 0.9 + grating(BOUNCE, V, 0.16) * 0.35;
      rainbow *= uRainbow;
      for (int i = 0; i < 4; i++) {
        if (i >= uLn) break;
        rainbow += grating(uL[i], V, 0.06) * uLc[i] * 1.2;
      }
      float data = smoothstep(21.5, 23.0, r) * (1.0 - smoothstep(58.2, 58.8, r));
      float ring = 1.0 - 0.35 * (1.0 - smoothstep(0.15, 0.4, abs(r - 16.6)));
      vec3 edge = studio(R) * 0.35 + vec3(0.22, 0.23, 0.25);
      if (vFace > 0.5) {
        vec3 mirror = min(studio(R), vec3(1.6)) * 0.5 + uTint * vec3(0.42, 0.44, 0.47) * (0.6 + 0.4 * max(dot(N, KEY), 0.0));
        col = (mirror + rainbow * data * 1.3) * ring;
        vec4 bart = texture2D(uArtBack, vec2(1.0 - (vLocal.x / (2.0 * uR) + 0.5), vLocal.y / (2.0 * uR) + 0.5)) * uHasArtBack;
        float bprint = bart.a * (1.0 - smoothstep(uPrintOut, uPrintOut + 0.4, r)) * smoothstep(uArtIn - 0.2, uArtIn + 0.2, r);
        col = mix(col, bart.rgb * lights(N) + rainbow * data * 0.35, bprint);
        col = mix(col, edge, smoothstep(58.0, 58.9, r) * 0.85);
      } else {
        vec2 uv = vLocal.xy / (2.0 * uR) + 0.5;
        vec4 art = texture2D(uArt, uv) * uHasArt;
        col = (min(studio(R), vec3(2.0)) * 0.07 + vec3(0.012) + uTint * 0.15 + rainbow * data * 0.85) * ring;
        float printed = art.a * (1.0 - smoothstep(uPrintOut, uPrintOut + 0.4, r)) * smoothstep(uArtIn - 0.2, uArtIn + 0.2, r);
        col = mix(col, art.rgb * lights(N), printed);
        col += min(glare(R), vec3(2.5)) * fresnel(cosv, 1.5) * printed * 0.9;
        float rim = smoothstep(uPrintOut, uPrintOut + 0.5, r) * smoothstep(58.0, 58.9, r);
        col = mix(col, edge, rim * 0.85);
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Parametric disc: aFace 0 = printed top, 1 = data side, 2 = rims. */
export function discGeometry(R: number, clearR: number, thick: number) {
  const pos: number[] = [];
  const nrm: number[] = [];
  const face: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const SEG = 192;
  const ring = (r0: number, r1: number, z: number, nz: number, rings: number, kind: number) => {
    const base = pos.length / 3;
    for (let j = 0; j <= rings; j++) {
      const r = r0 + ((r1 - r0) * j) / rings;
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        uvs.push(0.5 + (r * Math.cos(a)) / (2 * R), 0.5 + (r * Math.sin(a)) / (2 * R));
        nrm.push(0, 0, nz);
        face.push(kind);
      }
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < SEG; i++) {
        const a = base + j * SEG + i;
        const b = base + j * SEG + ((i + 1) % SEG);
        const c = a + SEG;
        const d = b + SEG;
        if (nz > 0) index.push(a, b, c, b, d, c);
        else index.push(a, c, b, b, c, d);
      }
  };
  const band = (r: number, z0: number, z1: number, out: number) => {
    const base = pos.length / 3;
    for (const z of [z0, z1])
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
        uvs.push(0.5 + (r * Math.cos(a)) / (2 * R), 0.5 + (r * Math.sin(a)) / (2 * R));
        nrm.push(out * Math.cos(a), out * Math.sin(a), 0);
        face.push(2);
      }
    for (let i = 0; i < SEG; i++) {
      const a = base + i;
      const b = base + ((i + 1) % SEG);
      const c = a + SEG;
      const d = b + SEG;
      if (out > 0) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  };
  const z1 = thick / 2;
  const z0 = -thick / 2;
  ring(clearR, R, z1, 1, 16, 0);
  ring(clearR, R, z0, -1, 16, 1);
  band(R, z0, z1, 1);
  band(clearR, z0, z1, -1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aFace", new THREE.Float32BufferAttribute(face, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export function createDiscMaterial(R: number, artIn: number, printOut: number) {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uArt: { value: null },
      uEnv: { value: null },
      uHasEnv: { value: 0 },
      uEnvStr: { value: 1 },
      uEnvBlur: { value: 0.3 },
      uHasArt: { value: 0 },
      uArtBack: { value: null },
      uHasArtBack: { value: 0 },
      uRainbow: { value: 1 },
      uR: { value: R },
      uArtIn: { value: artIn },
      uPrintOut: { value: printOut },
      uTint: { value: new THREE.Color("#ffffff") },
      uL: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, 0, 1)) },
      uLc: { value: [0, 1, 2, 3].map(() => new THREE.Color("#000000")) },
      uLn: { value: 0 },
    },
  });
}

export function setDiscLights(m: THREE.ShaderMaterial, lights: SceneLight[]) {
  const L = m.uniforms["uL"]?.value as THREE.Vector3[] | undefined;
  const C = m.uniforms["uLc"]?.value as THREE.Color[] | undefined;
  if (!L || !C) return;
  const list = lights.slice(0, 4);
  list.forEach((l, i) => {
    L[i]?.set(l.x, -l.y, 0.8).normalize();
    C[i]?.set(l.color).multiplyScalar(l.intensity);
  });
  const count = m.uniforms["uLn"];
  if (count) count.value = list.length;
}

/** The optical effect on a supplied GLB's vertices, retaining its original UV print. */
export function createNativeDiscMaterial(radius: number, original: THREE.Texture | null, flipUv = false) {
  const material = createDiscMaterial(radius, 14.4, 59.1);
  material.uniforms["uNativeArt"] = { value: original };
  material.uniforms["uHasNativeArt"] = { value: original ? 1 : 0 };
  material.vertexShader = VERT.replace("attribute float aFace;", "attribute float aFace; varying vec2 vOriginalUv;")
    .replace("vLocal = position;", flipUv
      ? "vLocal = position; vOriginalUv = vec2(1.0 - uv.x, uv.y);"
      : "vLocal = position; vOriginalUv = uv;");
  material.fragmentShader = FRAG.replace("uniform sampler2D uArt;", "uniform sampler2D uArt; uniform sampler2D uNativeArt; uniform float uHasNativeArt; varying vec2 vOriginalUv;")
    .replace("vec4 art = texture2D(uArt, uv) * uHasArt;", "vec4 base = texture2D(uNativeArt, vOriginalUv) * uHasNativeArt; base.a = max(base.a, step(0.01, dot(base.rgb, vec3(1.0))) * uHasNativeArt); vec4 overlay = texture2D(uArt, uv) * uHasArt; vec4 art = vec4(mix(base.rgb, overlay.rgb, overlay.a), max(base.a, overlay.a));")
    .replace("art.rgb * lights(N)", "art.rgb * (0.82 + 0.18 * max(dot(N, KEY), 0.0))")
    .replace("min(studio(R), vec3(1.6)) * 0.5 + uTint * vec3(0.42, 0.44, 0.47) * (0.6 + 0.4 * max(dot(N, KEY), 0.0))", "min(studio(R), vec3(2.0)) * 0.48 + uTint * vec3(0.10, 0.11, 0.12)");
  return material;
}
