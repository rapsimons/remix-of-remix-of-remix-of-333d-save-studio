import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { GLASS_EDGE_START, GLASS_EDGE_END } from "@/lib/glassRules";

/**
 * Liquid Glass: screen-space refraction of everything behind the clear plastic
 * (background image + inner parts), with multi-tap spectral dispersion, gentle
 * liquid waves and rim glints. Inspired by phileeppov.com/glass and
 * olivierlarose/3d-distorted-glass-effect (distorted background through glass).
 */
export const LG = {
  uLGScene: { value: null as THREE.Texture | null },
  uLGBackground: { value: null as THREE.Texture | null },
  uLGDepth: { value: null as THREE.Texture | null },
  uLGRes: { value: new THREE.Vector2(1, 1) },
  uLGRefr: { value: 0.5 },
  uLGDisp: { value: 0.4 },
  uLGWave: { value: 0.3 },
  uLGGlint: { value: 0.5 },
  uLGTime: { value: 0 },
  uLGClear: { value: new THREE.Color(0.95, 0.95, 0.95) },
};

export const liquidGlassDefaults = { refraction: 0.5, dispersion: 0.4, waves: 0.3, glint: 0.5 };

/** Patch a plastic material so it refracts the scene behind it. */
export function applyLiquidGlass<T extends THREE.MeshPhysicalMaterial>(mat: T): T {
  mat.userData["liquidGlass"] = true;
  mat.transmission = 0; // our pass replaces three's transmission (avoids the ghost copy)
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, LG);
    shader.vertexShader = `varying vec3 vLGSurfaceNormal;\n` + shader.vertexShader.replace(
      "#include <defaultnormal_vertex>",
      "#include <defaultnormal_vertex>\nvLGSurfaceNormal = normalize(transformedNormal);",
    );
    shader.fragmentShader =
      `uniform sampler2D uLGScene, uLGBackground, uLGDepth; varying vec3 vLGSurfaceNormal; uniform vec2 uLGRes; uniform float uLGRefr, uLGDisp, uLGWave, uLGGlint, uLGTime; uniform vec3 uLGClear;
vec3 lgSpec(float t){ return clamp(vec3(abs(t*6.0-3.0)-1.0, 2.0-abs(t*6.0-2.0), 2.0-abs(t*6.0-4.0)),0.0,1.0); }
` +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
{
  vec2 suv = gl_FragCoord.xy / uLGRes;
  vec3 n = normalize(normal);
  vec3 vd = normalize(vViewPosition);
  float edge = smoothstep(${GLASS_EDGE_START.toFixed(2)}, ${GLASS_EDGE_END.toFixed(2)}, 1.0 - abs(dot(normalize(vLGSurfaceNormal), vd)));
  float w = sin(suv.y*38.0 + uLGTime*1.4 + n.x*6.0)*0.5 + sin(suv.x*29.0 - uLGTime*1.1 + n.y*6.0)*0.5;
  vec2 off = n.xy * uLGRefr * 0.09 + vec2(w, -w) * uLGWave * 0.012;
  vec3 acc = vec3(0.0); vec3 wsum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float t = float(i) / 11.0;
    vec2 o = off * (1.0 + (t - 0.5) * uLGDisp * edge * 0.9);
    vec4 s = texture2D(uLGBackground, clamp(suv + o, 0.001, 0.999));
    vec3 c = mix(uLGClear, s.rgb, s.a);
    vec3 sp = lgSpec(t);
    acc += c * sp; wsum += sp;
  }
  vec3 refr = acc / wsum;
  // Any physical part behind the case stays sharp at its original screen pixel.
  float solid = 1.0 - step(0.999999, texture2D(uLGDepth, suv).r);
  vec4 sharp = texture2D(uLGScene, suv);
  refr = mix(refr, mix(uLGClear, sharp.rgb, sharp.a), solid);
  float fres = pow(1.0 - abs(dot(n, vd)), 3.0);
  vec3 glint = (lgSpec(fract(fres * 1.7 + suv.x * 0.6 + suv.y * 0.3)) * fres * 0.7
             + vec3(pow(fres, 6.0))) * edge * uLGGlint;
  float a = gl_FragColor.a;
  vec3 tinted = refr * mix(vec3(1.0), diffuseColor.rgb, a * 0.4 * (1.0 - solid));
  float coating = a * 0.55 * (1.0 - solid) + edge * a * 0.12;
  gl_FragColor = vec4(mix(tinted, gl_FragColor.rgb, coating) + glint, 1.0);
}`,
      );
  };
  mat.customProgramCacheKey = () => "liquidGlass-background-only-v2";
  mat.needsUpdate = true;
  return mat;
}

function cssBg(): THREE.Color {
  const c = new THREE.Color(0.95, 0.95, 0.95);
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d");
    if (!ctx) return c;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#f5f5f5";
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    c.setRGB((d[0] ?? 240) / 255, (d[1] ?? 240) / 255, (d[2] ?? 240) / 255, THREE.SRGBColorSpace);
  } catch { /* keep default */ }
  return c;
}

/** Renders the scene minus glass into a buffer each frame for the glass to sample. */
export function LiquidGlassPass({ design }: { design: Design }) {
  const { gl, scene, camera } = useThree();
  const depthTexture = useMemo(() => new THREE.DepthTexture(1, 1, THREE.UnsignedIntType), []);
  const fbo = useFBO({ depthTexture });
  const backgroundFbo = useFBO();
  useEffect(() => () => depthTexture.dispose(), [depthTexture]);
  useEffect(() => {
    LG.uLGClear.value.copy(cssBg());
  }, [design.updatedAt]);
  LG.uLGRefr.value = design.glassRefraction ?? liquidGlassDefaults.refraction;
  LG.uLGDisp.value = design.glassDispersion ?? liquidGlassDefaults.dispersion;
  LG.uLGWave.value = design.glassWaves ?? liquidGlassDefaults.waves;
  LG.uLGGlint.value = design.glassGlint ?? liquidGlassDefaults.glint;
  useFrame((state) => {
    const glass: THREE.Object3D[] = [];
    const solids: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!o.visible || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some((m) => m.userData?.["liquidGlass"])) glass.push(o);
      else solids.push(o);
    });
    if (!glass.length) return;
    const target = gl.getRenderTarget();
    const autoClear = gl.autoClear;
    try {
      gl.autoClear = true;
      glass.forEach((o) => (o.visible = false));
      gl.setRenderTarget(fbo);
      gl.clear();
      gl.render(scene, camera);
      solids.forEach((o) => (o.visible = false));
      gl.setRenderTarget(backgroundFbo);
      gl.clear();
      gl.render(scene, camera);
    } finally {
      glass.forEach((o) => (o.visible = true));
      solids.forEach((o) => (o.visible = true));
      gl.setRenderTarget(target);
      gl.autoClear = autoClear;
    }
    LG.uLGScene.value = fbo.texture;
    LG.uLGBackground.value = backgroundFbo.texture;
    LG.uLGDepth.value = fbo.depthTexture;
    gl.getDrawingBufferSize(LG.uLGRes.value);
    LG.uLGTime.value = state.clock.elapsedTime;
  });
  return null;
}
