import * as THREE from "three";

/**
 * Real CD data side: mirror-silver aluminium under clear polycarbonate.
 * The spiral tracks are a circular diffraction grating, so light splits into
 * sharp radial rainbow fans that swing round the disc as the view changes.
 * Inner hub is clear plastic with a stacking ring; the spindle hole is empty.
 */
const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vCenter;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
uniform vec3 uCamPos;
uniform vec3 uTint;
uniform float uDark;
uniform vec3 uLightDir[6];
uniform vec3 uLightCol[6];
uniform int uLightCount;
uniform float uHole;
uniform float uHub;
uniform float uData;
uniform float uRim;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vCenter;

vec3 spectrum(float w) { // w: 0 (violet) .. 1 (red)
  vec3 c = vec3(
    smoothstep(0.45, 0.8, w) + smoothstep(0.15, 0.0, w) * 0.5,
    smoothstep(0.15, 0.45, w) - smoothstep(0.65, 0.9, w),
    1.0 - smoothstep(0.2, 0.5, w));
  return clamp(c, 0.0, 1.0) * smoothstep(0.0, 0.08, w) * smoothstep(1.0, 0.9, w);
}

vec3 sky(vec3 r) { // simple studio reflection
  float t = r.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.38, 0.40, 0.44), vec3(0.95, 0.96, 1.0), smoothstep(0.2, 0.9, t));
  c += vec3(1.0) * pow(max(0.0, r.y), 24.0) * 0.6;
  return c;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0 || r < uHole) discard;

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(uCamPos - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 radial = vWorld - vCenter;
  radial -= N * dot(radial, N);
  radial = normalize(radial + 1e-6);
  vec3 tang = normalize(cross(N, radial));

  vec3 R = reflect(-V, N);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);

  // hub: clear polycarbonate with a moulded stacking ring
  if (r < uHub) {
    float ring = smoothstep(0.012, 0.0, abs(r - mix(uHole, uHub, 0.55))) * 0.6
               + smoothstep(0.008, 0.0, abs(r - uHub + 0.01)) * 0.5
               + smoothstep(0.01, 0.0, abs(r - uHole - 0.01)) * 0.4;
    vec3 c = sky(R) * (0.25 + ring) + fres * 0.4;
    gl_FragColor = vec4(c, 0.12 + ring * 0.5 + fres * 0.3);
    #include <colorspace_fragment>
    return;
  }
  // clear outer rim
  if (r > uRim) {
    vec3 c = sky(R) * 0.6 + fres;
    gl_FragColor = vec4(c, 0.3 + fres * 0.5);
    #include <colorspace_fragment>
    return;
  }

  vec3 base = sky(R) * mix(uTint, uTint * 0.08, uDark);
  // mirror band (no tracks) between hub and data area
  float tracks = smoothstep(uData - 0.01, uData + 0.01, r);
  vec3 dif = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    if (i >= uLightCount) break;
    vec3 L = normalize(uLightDir[i]);
    vec3 S = L + V;
    // grating vector is radial: diffraction requires S to lie along it
    float along = dot(S, radial);
    float across = dot(S, tang);
    float sharp = exp(-across * across * 45.0);
    // first and second order, track pitch ~1.6 um
    for (int m = 1; m <= 2; m++) {
      float lambda = abs(along) * 1.6 / float(m); // in um
      float w = (lambda - 0.38) / (0.75 - 0.38);
      dif += spectrum(w) * uLightCol[i] * sharp * (m == 1 ? 1.0 : 0.55);
    }
  }
  // fine track shimmer
  float grain = 0.92 + 0.08 * sin(r * 900.0);
  vec3 col = base + dif * tracks * grain * mix(1.0, 0.7, uDark) * 1.6 + fres * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export const CD_LIGHTS: { dir: THREE.Vector3; col: THREE.Color }[] = [
  { dir: new THREE.Vector3(0.6, 0.8, 0.9), col: new THREE.Color(1, 1, 1) },
  { dir: new THREE.Vector3(-0.8, 0.3, 0.7), col: new THREE.Color(0.9, 0.9, 1) },
  { dir: new THREE.Vector3(0.1, -0.9, 0.6), col: new THREE.Color(0.8, 0.8, 0.8) },
  { dir: new THREE.Vector3(-0.3, 0.9, -0.4), col: new THREE.Color(0.7, 0.7, 0.7) },
];

export function createCdBackMaterial(opts: { inner: number }) {
  const dirs = Array.from({ length: 6 }, () => new THREE.Vector3(0, 0, 1));
  const cols = Array.from({ length: 6 }, () => new THREE.Color(0, 0, 0));
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: true,
    uniforms: {
      uCamPos: { value: new THREE.Vector3() },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uDark: { value: 0 },
      uLightDir: { value: dirs },
      uLightCol: { value: cols },
      uLightCount: { value: 0 },
      uHole: { value: 0.125 },
      uHub: { value: opts.inner },
      uData: { value: opts.inner + 0.1 },
      uRim: { value: 0.985 },
    },
  });
}

export function setCdLights(
  m: THREE.ShaderMaterial,
  extra: { x: number; y: number; color: string; intensity: number }[],
) {
  const all = [
    ...CD_LIGHTS,
    ...extra.map((l) => ({
      dir: new THREE.Vector3(l.x * 1.2, -l.y * 1.2, 0.8),
      col: new THREE.Color(l.color).multiplyScalar(l.intensity),
    })),
  ].slice(0, 6);
  const dirs = m.uniforms["uLightDir"]!.value as THREE.Vector3[];
  const cols = m.uniforms["uLightCol"]!.value as THREE.Color[];
  all.forEach((l, i) => {
    dirs[i]!.copy(l.dir).normalize();
    cols[i]!.copy(l.col);
  });
  m.uniforms["uLightCount"]!.value = all.length;
}
