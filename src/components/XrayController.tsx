import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { isXrayCore, XRAY_PALETTE, xrayMix } from "@/lib/xray";

const vert = `varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`;
const frag = `uniform float uMix; uniform vec3 uColor; uniform vec3 uHot; uniform float uCore;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(f, 1.4);
  vec3 c = mix(uColor, uHot, uCore * (0.22 + rim * 0.4));
  float a = uMix * mix(0.09 + rim * 0.28, 0.19 + rim * 0.38, uCore);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

type RecordEntry = {
  geometry: THREE.BufferGeometry;
  original: THREE.Material | THREE.Material[];
  faded: THREE.Material | THREE.Material[];
  surface: THREE.Mesh;
  edges: THREE.LineSegments;
};
const materials = (m: THREE.Material | THREE.Material[]) => Array.isArray(m) ? m : [m];

/** Density surfaces plus real crease/cutout edges, without touching native materials. */
export function XrayController({ design }: { design: Design }) {
  const { scene, camera } = useThree();
  const entries = useRef(new Map<THREE.Mesh, RecordEntry>());
  const turn = useRef(0);
  const last = useRef<number | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  const inv = useMemo(() => new THREE.Matrix4(), []);
  const fx = useMemo(() => {
    const mix = { value: 0 };
    const surface = (core: boolean) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: { uMix: mix, uCore: { value: core ? 1 : 0 },
        uColor: { value: new THREE.Color(core ? XRAY_PALETTE.core : XRAY_PALETTE.shell) },
        uHot: { value: new THREE.Color(XRAY_PALETTE.hot) } },
    });
    const edge = (core: boolean) => new THREE.LineBasicMaterial({
      color: core ? XRAY_PALETTE.coreEdge : XRAY_PALETTE.shellEdge,
      transparent: true, opacity: 0, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: "void main(){gl_Position=vec4(position.xy,0.99999,1.0);}",
      fragmentShader: "uniform float uMix; uniform vec3 uColor; void main(){gl_FragColor=vec4(uColor,uMix); #include <colorspace_fragment>\n}",
      uniforms: { uMix: mix, uColor: { value: new THREE.Color(XRAY_PALETTE.background) } },
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    }));
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -1000;
    backdrop.userData = { xrayOverlay: true, noExport: true };
    return { mix, core: surface(true), shell: surface(false), coreEdge: edge(true), shellEdge: edge(false), backdrop };
  }, []);

  useEffect(() => {
    scene.add(fx.backdrop);
    const records = entries.current;
    return () => {
      for (const [mesh, entry] of records) {
        if (mesh.material === entry.faded) mesh.material = entry.original;
        mesh.remove(entry.surface, entry.edges);
        entry.edges.geometry.dispose();
        materials(entry.faded).forEach((m) => m.dispose());
      }
      records.clear();
      scene.remove(fx.backdrop);
      fx.backdrop.geometry.dispose();
      (fx.backdrop.material as THREE.Material).dispose();
      fx.core.dispose(); fx.shell.dispose(); fx.coreEdge.dispose(); fx.shellEdge.dispose();
    };
  }, [scene, fx]);

  useFrame(() => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData["xrayOverlay"] && !o.userData["noExport"]) meshes.push(o);
    });
    const reference = meshes[0];
    if (reference) {
      v.copy(camera.position).applyMatrix4(inv.copy(reference.matrixWorld).invert());
      const angle = Math.atan2(v.x, v.z);
      if (last.current !== null) {
        let delta = angle - last.current;
        if (delta > Math.PI) delta -= Math.PI * 2;
        else if (delta < -Math.PI) delta += Math.PI * 2;
        turn.current += Math.abs(delta);
      }
      last.current = angle;
    }
    const amount = xrayMix(turn.current, {
      mode: design.xrayMode, cycle: design.xrayCycle, start: design.xrayStart,
      hold: design.xrayHold, fade: design.xrayFade,
    }) * (design.xrayAmount ?? 1);
    const on = amount > 0.001;
    fx.mix.value = amount;
    fx.backdrop.visible = on;
    fx.coreEdge.opacity = amount * 0.85;
    fx.shellEdge.opacity = amount * 0.6;

    const release = (mesh: THREE.Mesh, entry: RecordEntry) => {
      if (mesh.material === entry.faded) mesh.material = entry.original;
      mesh.remove(entry.surface, entry.edges);
      entry.edges.geometry.dispose();
      materials(entry.faded).forEach((m) => m.dispose());
      entries.current.delete(mesh);
    };
    for (const [mesh, entry] of entries.current) {
      if (!meshes.includes(mesh) || entry.geometry !== mesh.geometry ||
          (mesh.material !== entry.original && mesh.material !== entry.faded)) release(mesh, entry);
    }
    for (const mesh of meshes) {
      let entry = entries.current.get(mesh);
      if (!entry && on) {
        const original = mesh.material;
        const source = materials(original);
        const core = isXrayCore(`${mesh.name} ${mesh.parent?.name ?? ""}`,
          Math.max(...source.map((m) => (m as THREE.MeshStandardMaterial).metalness ?? 0)),
          source.some((m) => (m as THREE.ShaderMaterial).isShaderMaterial === true));
        const clones = source.map((m) => {
          const clone = m.clone();
          // X-ray replaces refraction; cloned native shader output still fades correctly.
          clone.userData["liquidGlass"] = false;
          clone.transparent = true; clone.depthWrite = false;
          if ((clone as THREE.ShaderMaterial).isShaderMaterial) {
            const shader = clone as THREE.ShaderMaterial;
            shader.uniforms["uXrayNativeFade"] = { value: 1 };
            const end = shader.fragmentShader.lastIndexOf("}");
            shader.fragmentShader = "uniform float uXrayNativeFade;\n" +
              shader.fragmentShader.slice(0, end) + "\ngl_FragColor.a *= uXrayNativeFade;\n" + shader.fragmentShader.slice(end);
          }
          return clone;
        });
        const surface = new THREE.Mesh(mesh.geometry, core ? fx.core : fx.shell);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 16), core ? fx.coreEdge : fx.shellEdge);
        for (const overlay of [surface, edges]) {
          overlay.userData = { xrayOverlay: true, noExport: true };
          overlay.raycast = () => {};
          overlay.frustumCulled = false;
        }
        surface.renderOrder = 20; edges.renderOrder = 21;
        mesh.add(surface, edges);
        entry = { geometry: mesh.geometry, original, faded: Array.isArray(original) ? clones : clones[0] ?? original, surface, edges };
        entries.current.set(mesh, entry);
      }
      if (!entry) continue;
      mesh.material = on ? entry.faded : entry.original;
      entry.surface.visible = on; entry.edges.visible = on;
      const originals = materials(entry.original);
      materials(entry.faded).forEach((mat, i) => {
        mat.opacity = (originals[i]?.opacity ?? 1) * (1 - amount);
        mat.visible = amount < 0.999;
        const fade = (mat as THREE.ShaderMaterial).uniforms?.["uXrayNativeFade"];
        if (fade) fade.value = 1 - amount;
      });
    }
  });
  return null;
}
