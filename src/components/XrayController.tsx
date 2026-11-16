import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { xrayMix } from "@/lib/xray";

const CORE = /shutter|hub|disc|disk|pcb|chip|pin|metal|contact|gold|board|cube_material004/i;

const vert = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const frag = `uniform float uMix; uniform vec3 uColor; uniform vec3 uHot; uniform float uCore;
varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(f, uCore > 0.5 ? 1.2 : 2.2);
  vec3 c = mix(uColor, uHot, uCore * (1.0 - f) * 0.6);
  float a = uMix * (uCore > 0.5 ? 0.35 + edge * 0.65 : 0.08 + edge * 0.7);
  gl_FragColor = vec4(c, a); }`;

/** Rotation-linked CT-scan look: fades originals and adds additive density glow overlays. */
export function XrayController({ design }: { design: Design }) {
  const { scene, camera } = useThree();
  const uni = useMemo(() => ({ uMix: { value: 0 } }), []);
  const mats = useMemo(() => {
    const make = (core: boolean) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: !core ? true : true,
      blending: THREE.NormalBlending, side: THREE.DoubleSide,
      uniforms: { uMix: uni.uMix, uCore: { value: core ? 1 : 0 },
        uColor: { value: new THREE.Color(core ? "#06b6d4" : "#3730a3") }, uHot: { value: new THREE.Color("#ecfeff") } },
    });
    return { core: make(true), shell: make(false) };
  }, [uni]);
  const turn = useRef(0);
  const last = useRef<number | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const inv = useMemo(() => new THREE.Matrix4(), []);

  useFrame(() => {
    let ref: THREE.Object3D | null = null;
    scene.traverse((o) => { if (!ref && (o as THREE.Mesh).isMesh && !o.userData["xrayOverlay"]) ref = o; });
    if (ref) {
      const r = ref as THREE.Object3D;
      v.copy(camera.position).applyMatrix4(inv.copy(r.matrixWorld).invert());
      const a = Math.atan2(v.x, v.z);
      if (last.current !== null) {
        let d = a - last.current;
        if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
        turn.current += Math.abs(d);
      }
      last.current = a;
    }
    const mix = xrayMix(turn.current, {
      mode: design.xrayMode, cycle: design.xrayCycle, start: design.xrayStart, hold: design.xrayHold, fade: design.xrayFade,
    }) * (design.xrayAmount ?? 1);
    uni.uMix.value = mix;
    const on = mix > 0.001;
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !o.userData["xrayOverlay"]) meshes.push(m); });
    for (const m of meshes) {
      let ov = m.userData["xrayChild"] as THREE.Mesh | undefined;
      if (!ov && on) {
        const name = `${m.name} ${m.parent?.name ?? ""}`;
        const mm = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
        const core = CORE.test(name) || (mm?.metalness ?? 0) >= 0.5 || (mm as unknown as THREE.ShaderMaterial).isShaderMaterial;
        ov = new THREE.Mesh(m.geometry, core ? mats.core : mats.shell);
        ov.userData["xrayOverlay"] = true; ov.userData["noExport"] = true;
        ov.renderOrder = 20; ov.raycast = () => {};
        m.add(ov); m.userData["xrayChild"] = ov;
      }
      if (ov) { ov.visible = on; if (ov.geometry !== m.geometry) ov.geometry = m.geometry; }
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (!mat || (mat as THREE.ShaderMaterial).isShaderMaterial) continue;
        const ud = mat.userData;
        if (ud["xBase"] === undefined) { if (!on) continue; ud["xBase"] = mat.opacity; ud["xT"] = mat.transparent; ud["xD"] = mat.depthWrite; }
        mat.opacity = (ud["xBase"] as number) * (1 - 0.88 * mix);
        const wantT = on || (ud["xT"] as boolean);
        if (mat.transparent !== wantT) { mat.transparent = wantT; mat.needsUpdate = true; }
        mat.depthWrite = on ? false : (ud["xD"] as boolean);
        if (!on) delete ud["xBase"];
      }
    }
  });
  return null;
}
