import * as THREE from "three";

/**
 * Holographic foil shader — the optical model ported from the
 * jal-co/holosticker project (MIT), with the peel/curl geometry,
 * exploded layers and drop shadow removed. Only the flat-sticker
 * light response is kept: thin-film diffraction, refractor facets,
 * metallic flakes and the two-layer laminate specular.
 */

export type HoloPattern = "linear" | "radial" | "patches";
export type HoloOverlay = "none" | "triangles" | "squares" | "stripes";

export const holoPatternIndex: Record<HoloPattern, number> = {
  linear: 0,
  radial: 1,
  patches: 2,
};

export const holoOverlayIndex: Record<HoloOverlay, number> = {
  none: 0,
  triangles: 1,
  squares: 2,
  stripes: 3,
};

/** Procedural studio environment as an equirect texture (softboxes + sky). */
export function studioEnvTexture(): THREE.Texture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f4f5f7");
  g.addColorStop(0.45, "#c9ccd2");
  g.addColorStop(0.55, "#aeb2b9");
  g.addColorStop(1, "#7c8087");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const blob = (x: number, y: number, rx: number, ry: number, a: number) => {
    const r = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    r.addColorStop(0, `rgba(255,255,255,${a})`);
    r.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = r;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  blob(260, 140, 160, 90, 0.85);
  blob(780, 170, 220, 120, 0.7);
  blob(520, 70, 260, 55, 0.95);
  blob(512, 380, 140, 70, 0.25);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const VERT = /* glsl */ `
out vec2 vUv;
out vec3 vNormal;
out vec3 vWorldPos;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
in vec3 vNormal;
in vec3 vWorldPos;
out vec4 outColor;

uniform sampler2D uMap;   // albedo, alpha = die-cut shape
uniform sampler2D uEnv;   // equirect studio environment
uniform vec3 uCamPos;
uniform float uMaxMip;
uniform float uMetal;
uniform float uRough;
uniform float uEnvIntensity;
uniform float uHolo;
uniform float uBands;
uniform float uHue;
uniform float uGrain;
uniform float uPattern;
uniform float uOverlay;
uniform vec2 uLight;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0));
  float c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srgb2lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 lin2srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

vec2 equirectUv(vec3 d) {
  d = normalize(d);
  float phi = atan(d.z, d.x);
  float theta = acos(clamp(d.y, -1.0, 1.0));
  return vec2((phi + 3.14159265) / 6.2831853, theta / 3.14159265);
}

vec3 envSample(vec3 R, float rough) {
  return srgb2lin(textureLod(uEnv, equirectUv(R), rough * uMaxMip).rgb);
}

// diffraction phase pattern across the sticker surface
float patternPhase(vec2 uv) {
  float n = vnoise(uv * 5.0 + uLight);
  if (uPattern < 0.5) {
    return dot(uv - uLight, normalize(vec2(0.85, 0.55))) * uBands + n * 1.5;
  } else if (uPattern < 1.5) {
    return length(uv - uLight) * uBands * 1.6 + n * 1.2;
  }
  return n * 5.0 + vnoise(uv * 11.0) * 2.5;
}

// refractor overlay: facet cells that each carry their own diffraction phase
float facetOffset(vec2 uv) {
  if (uOverlay < 0.5) return 0.0;
  if (uOverlay < 1.5) {
    vec2 g = uv * 9.0;
    vec2 i = floor(g);
    vec2 f = fract(g);
    float t = step(f.x + f.y, 1.0);
    return hash(i + t * 0.37) * 0.85;
  }
  if (uOverlay < 2.5) {
    return hash(floor(uv * 7.0)) * 0.85;
  }
  return hash(vec2(floor(dot(uv, normalize(vec2(1.0, 0.6))) * 16.0), 3.0)) * 0.85;
}

float fbm(vec2 p) {
  float a = 0.54;
  float r = 0.0;
  for (int i = 0; i < 4; i++) {
    r += a * vnoise(p);
    p = p * 2.13 + vec2(31.4, 47.2);
    a *= 0.46;
  }
  return r;
}

// pooling field for the flare zones; the pattern select shapes the flow
float poolField(vec2 uv) {
  vec2 pu;
  if (uPattern < 0.5) {
    pu = vec2((uv.x + uv.y) * 0.5, (uv.y - uv.x) * 1.1) * (uBands * 0.28);
  } else if (uPattern < 1.5) {
    vec2 d = uv - uLight;
    pu = vec2(length(d) * 1.7, atan(d.y, d.x) * 0.6) * (uBands * 0.24);
  } else {
    pu = uv * (uBands * 0.3);
  }
  vec2 warp = vec2(fbm(pu + vec2(5.2, 1.3)), fbm(pu + vec2(1.7, 8.6)));
  return fbm(pu * 1.4 + warp * 2.0);
}

vec3 rainbowFilm(float cosT, vec2 uv, vec3 R, float flatness) {
  float sweep = dot(R.xy, normalize(vec2(0.8, 0.6))) * (uBands * 0.4) * flatness;
  float phase = 6.2831853 *
    (0.35 + 1.15 * (1.0 - cosT) + patternPhase(uv) * 0.18 + sweep +
     facetOffset(uv) + uHue);
  return 0.5 + 0.5 * vec3(sin(phase), sin(phase + 2.094), sin(phase + 4.188));
}

vec3 filmColor(float cosT, vec2 uv, vec3 R, float flatness) {
  return mix(vec3(1.0), rainbowFilm(cosT, uv, R, flatness), uHolo);
}

void main() {
  vec4 base = texture(uMap, vUv);
  if (base.a < 0.02) discard;
  base.rgb = srgb2lin(base.rgb);

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  if (!gl_FrontFacing) N = -N;

  vec3 R = reflect(-V, N);
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float brightness = lum(base.rgb);

  // ---- metallic flakes ----
  float flakeI = 0.0;
  vec3 flakeEnv = vec3(0.0);
  if (uGrain > 0.01) {
    float cell = hash(floor(vUv * 700.0));
    float mask = smoothstep(1.0 - uGrain * 0.6, 1.0, cell);
    float angleOff = (hash(vec2(cell, cell + 3.0)) - 0.5) * 0.3;
    vec3 pN = normalize(N + vec3(angleOff, angleOff * 0.7, 0.0));
    vec3 PR = reflect(-V, pN);
    float spark = pow(clamp(dot(pN, V) * 0.5 + 0.5, 0.0, 1.0), 8.0);
    flakeEnv = envSample(PR, 0.15) *
      mix(vec3(1.0), filmColor(dot(pN, V), vUv, PR, smoothstep(0.25, 0.85, abs(N.z))), 0.9);
    flakeI = clamp(mask * max(spark, 0.2) * 6.0, 0.0, 1.0) * min(uGrain * 2.0, 1.0);
  }

  // ---- environment reflection with fresnel ----
  float rough = mix(uRough, 0.9, flakeI);
  vec3 env = envSample(R, rough) * uEnvIntensity;
  env = mix(env, flakeEnv * uEnvIntensity, flakeI);

  float F0 = mix(0.05, 0.9, uMetal);
  float fres = F0 + (1.0 - F0) * pow(1.0 - cosT, 5.0);

  // ---- key light ----
  vec3 L = normalize(vec3((uLight.x - 0.5) * 2.2, (uLight.y - 0.5) * 2.2, 1.4));
  float dif = clamp(dot(N, L), 0.0, 1.0);
  float specKey = pow(clamp(dot(R, L), 0.0, 1.0), 60.0);

  vec3 diffuse = base.rgb * (1.0 - uMetal * 0.55) * (0.5 + 0.6 * dif);

  // two-layer laminate: the metallic base reflects in the ink's own color,
  // while the thin-film flare lives in the clear laminate above the print
  float inkA = clamp(1.0 - brightness / 0.62, 0.0, 1.0);
  vec3 specTint = mix(vec3(1.0), base.rgb * 1.25 + 0.08, 0.8 * inkA * uHolo);
  diffuse *= 1.0 - 0.18 * uHolo * (1.0 - inkA);
  vec3 rawSpec = env * (1.0 - rough * 0.6) * 1.35 + vec3(specKey * 0.6);

  float pool = poolField(vUv);
  float band = smoothstep(0.35, 0.7, pool);
  float flatness = smoothstep(0.25, 0.85, abs(N.z));
  vec3 film = rainbowFilm(cosT, vUv, R, flatness);

  // per-cell glitter twinkle: micro-facets light up as the angle sweeps
  float twk = 1.0 + pow(0.5 + 0.5 * sin(hash(floor(vUv * 950.0)) * 6.28318 +
                                        cosT * 48.0), 20.0) * (uGrain * 1.2);

  vec3 specCol = rawSpec * specTint * fres;
  specCol *= mix(1.0, 0.5, uHolo * band);
  specCol += rawSpec * mix(vec3(1.0), film, 0.75) * (0.3 * uHolo);
  specCol *= mix(0.3, 1.0, brightness);
  vec3 flare = rawSpec * film * (2.3 * uHolo * band) * mix(0.55, 1.0, brightness);

  vec3 color = diffuse + (specCol + flare) * twk + flakeEnv * flakeI * 0.5;
  outColor = vec4(lin2srgb(color), base.a);
}
`;

export type HoloMaterialOptions = {
  map: THREE.Texture;
  env: THREE.Texture;
  intensity?: number;
  bands?: number;
  hue?: number;
  grain?: number;
  pattern?: HoloPattern;
  overlay?: HoloOverlay;
};

export function createHoloMaterial(opts: HoloMaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uMap: { value: opts.map },
      uEnv: { value: opts.env },
      uCamPos: { value: new THREE.Vector3() },
      uMaxMip: { value: 8 },
      uMetal: { value: 0.75 },
      uRough: { value: 0.14 },
      uEnvIntensity: { value: 1.6 },
      uHolo: { value: opts.intensity ?? 0.85 },
      uBands: { value: opts.bands ?? 10 },
      uHue: { value: opts.hue ?? 0 },
      uGrain: { value: opts.grain ?? 0.25 },
      uPattern: { value: holoPatternIndex[opts.pattern ?? "linear"] },
      uOverlay: { value: holoOverlayIndex[opts.overlay ?? "triangles"] },
      uLight: { value: new THREE.Vector2(0.65, 0.7) },
    },
  });
}
