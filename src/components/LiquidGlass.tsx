import { useFrame, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";
import type { Design } from "@/lib/types";

/**
 * Liquid Glass: screen-space refraction of everything behind the clear plastic
 * (background image + inner parts), with multi-tap spectral dispersion, gentle
 * liquid waves and rim glints. Inspired by phileeppov.com/glass and
 * olivierlarose/3d-distorted-glass-effect (distorted background through glass).
 */
export const LG = {
  uLGScene: { value: null as THREE.Texture | null },
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
    shader.fragmentShader =
      `uniform sampler2D uLGScene; uniform vec2 uLGRes; uniform float uLGRefr, uLGDisp, uLGWave, uLGGlint, uLGTime; uniform vec3 uLGClear;
vec3 lgSpec(float t){ return clamp(vec3(abs(t*6.0-3.0)-1.0, 2.0-abs(t*6.0-2.0), 2.0-abs(t*6.0-4.0)),0.0,1.0); }
` +
      shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
{
  vec2 suv = gl_FragCoord.xy / uLGRes;
  vec3 n = normalize(normal);
  vec3 vd = normalize(vViewPosition);
  float w = sin(suv.y*38.0 + uLGTime*1.4 + n.x*6.0)*0.5 + sin(suv.x*29.0 - uLGTime*1.1 + n.y*6.0)*0.5;
  vec2 off = n.xy * uLGRefr * 0.09 + vec2(w, -w) * uLGWave * 0.012;
  vec3 acc = vec3(0.0); vec3 wsum = vec3(0.0);
  for (int i = 0; i < 12; i++) {
    float t = float(i) / 11.0;
    vec2 o = off * (1.0 + (t - 0.5) * uLGDisp * 0.9);
    vec4 s = texture2D(uLGScene, clamp(suv + o, 0.001, 0.999));
    vec3 c = mix(uLGClear, s.rgb, s.a);
    vec3 sp = lgSpec(t);
    acc += c * sp; wsum += sp;
  }
  vec3 refr = acc / wsum;
  float fres = pow(1.0 - abs(dot(n, vd)), 3.0);
  vec3 glint = lgSpec(fract(fres * 1.7 + suv.x * 0.6 + suv.y * 0.3)) * fres * uLGGlint * 1.4
             + vec3(pow(fres, 6.0) * uLGGlint);
  float a = gl_FragColor.a;
  vec3 tinted = refr * mix(vec3(1.0), diffuseColor.rgb, 0.35 + a * 0.4);
  gl_FragColor = vec4(mix(tinted, gl_FragColor.rgb, a * 0.55) + glint, 1.0);
}`,
      );
  };
  mat.customProgramCacheKey = () => "liquidGlass";
  mat.needsUpdate = true;
  return mat;
}

function cssBg(): THREE.Color {
  const c = new THREE.Color(0.95, 0.95, 0.95);
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#f5f5f5";
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    c.setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
  } catch { /* keep default */ }
  return c;
}

/** Renders the scene minus glass into a buffer each frame for the glass to sample. */
export function LiquidGlassPass({ design }: { design: Design }) {
  const { gl, scene, camera } = useThree();
  const fbo = useFBO();
  useEffect(() => {
    LG.uLGClear.value.copy(cssBg());
  }, [design.updatedAt]);
  LG.uLGRefr.value = design.glassRefraction ?? liquidGlassDefaults.refraction;
  LG.uLGDisp.value = design.glassDispersion ?? liquidGlassDefaults.dispersion;
  LG.uLGWave.value = design.glassWaves ?? liquidGlassDefaults.waves;
  LG.uLGGlint.value = design.glassGlint ?? liquidGlassDefaults.glint;
  useFrame((state) => {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (o.visible && m && !Array.isArray(m) && m.userData?.["liquidGlass"]) { o.visible = false; hidden.push(o); }
    });
    if (!hidden.length) return;
    gl.setRenderTarget(fbo);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    hidden.forEach((o) => (o.visible = true));
    LG.uLGScene.value = fbo.texture;
    gl.getDrawingBufferSize(LG.uLGRes.value);
    LG.uLGTime.value = state.clock.elapsedTime;
  });
  return null;
}
