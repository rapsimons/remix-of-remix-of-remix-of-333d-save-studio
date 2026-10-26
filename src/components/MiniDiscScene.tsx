import CaseStageRaw from "./cd-case/CaseStage";
import { Suspense, useMemo, type ComponentType } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { createDiscMaterial, discGeometry, setDiscLights } from "@/lib/discShader";
import * as THREE from "three";
const CaseStage = CaseStageRaw as unknown as ComponentType<{ disc: typeof DISC; spin?: boolean; paused?: boolean }>;
import { DISC } from "./cd-case/disc";
import type { Design } from "@/lib/types";
import { isMiniDiscCart, MD_ASPECT } from "@/lib/media";
import { useLabelTexture } from "@/lib/useLabelTextures";
import mdParts from "@/assets/minidisc-parts.glb.asset.json";

type Props = {
  design: Design;
  lockX?: boolean;
  lockY?: boolean;
  allowZoom?: boolean;
  onDoubleTap?: () => void;
};

// Model is centred, in metres: 71.8 x 68.2 x 5.01 mm.
const W = 0.0718;
const H = 0.0682;
const T = 0.00501;

function Cartridge({ design }: { design: Design }) {
  // The original CAD file split into its real parts: two case halves, the
  // wrap-around metal slider, the write-protect tab and the metal centre hub.
  const gltf = useGLTF(mdParts.url);
  const shell = { color: design.color, opacity: design.opacity ?? 0.55 };
  const front = useLabelTexture(design.front, 1024, "all", shell, MD_ASPECT);
  const back = useLabelTexture(design.back, 1024, "all", shell, MD_ASPECT);

  // Clear plastic: plain alpha blending (no transmission pass — that pass
  // re-renders the disc and produced the "ghost" inside the case).
  const plastic = useMemo(() => {
    const o = design.opacity ?? 0.55;
    const shimmer = design.glassShimmer ?? 0.3;
    return new THREE.MeshPhysicalMaterial({
      color: design.shellNone ? "#e8eef4" : design.color,
      roughness: Math.max(0.05, design.roughness ?? 0.05),
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      iridescence: shimmer,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [120, 700],
      envMapIntensity: 1.6,
      specularIntensity: 1,
      transparent: true,
      // keep the case readable even when fully clear
      opacity: Math.min(1, 0.3 + o * 0.7),
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }, [design.color, design.opacity, design.roughness, design.glassShimmer, design.shellNone]);
  const metal = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: design.shutterColor ?? "#d9dce0",
        metalness: design.shutterMetalness ?? 0.85,
        roughness: design.shutterRoughness ?? 0.35,
        side: THREE.DoubleSide,
      }),
    [design.shutterColor, design.shutterMetalness, design.shutterRoughness],
  );
  const parts = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const isMetal = /shutter|hub/.test(m.name) || /shutter|hub/.test(m.parent?.name ?? "");
      // the converted file ships without normals, which made the case unlit/invisible
      if (!m.geometry.attributes.normal) m.geometry.computeVertexNormals();
      m.material = isMetal ? metal : plastic;
      m.renderOrder = isMetal ? 2 : 5;
    });
    return s;
  }, [gltf.scene, plastic, metal]);

  // Same optical disc + shader as the CD, at the disc's true spot in the model.
  const R = 0.032;
  const discGeo = useMemo(() => discGeometry(R, 0.0076, 0.0012), []);
  const discMat = useMemo(() => {
    const m = createDiscMaterial(R, 15.2, 59.1);
    m.uniforms["uDataIn"] = { value: 21.5 };
    m.fragmentShader = m.fragmentShader
      .replace("uniform float uR;", "uniform float uR; uniform float uDataIn;")
      .replace("smoothstep(21.5, 23.0, r)", "smoothstep(uDataIn, uDataIn + 1.5, r)");
    return m;
  }, []);
  useMemo(() => {
    setDiscLights(discMat, design.lights ?? []);
    (discMat.uniforms["uTint"]!.value as THREE.Color).set(design.discColor ?? "#ffffff");
    // slider 0..1 → clear plastic ring from just past the hub to ~45% of the disc
    discMat.uniforms["uDataIn"]!.value = 18 + (design.discHubRing ?? 0.3) * 20;
  }, [discMat, design.lights, design.discColor, design.discHubRing]);

  return (
    <group scale={20}>
      <mesh geometry={discGeo} material={discMat} position={[-0.00195, 0, 0.0007]} renderOrder={1} />
      <primitive object={parts} />

      {front && (
        <mesh position={[0, 0, T / 2 + 0.00005]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={front} transparent roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
      {back && (
        <mesh position={[0, 0, -T / 2 - 0.00005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={back} transparent roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
    </group>
  );
}

/** MiniDisc tab: V1 = real cartridge model, V2 = the cd-case repo's jewel case. */
export function MiniDiscScene({ design, allowZoom, onDoubleTap }: Props) {
  if (isMiniDiscCart(design)) {
    return (
      <div className="relative h-full w-full" onDoubleClick={onDoubleTap}>
        <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5], fov: 35 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[3, 4, 5]} intensity={1.2} />
          <Suspense fallback={null}>
            <Cartridge design={design} />
            <Environment resolution={128}>
              <Lightformer intensity={1.5} position={[0, 4, 3]} scale={[8, 8, 1]} />
              <Lightformer intensity={0.6} position={[-4, 0, 2]} rotation-y={Math.PI / 2} scale={[6, 6, 1]} />
              <Lightformer intensity={1} color="#ffd0f0" position={[4, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 6, 1]} />
              <Lightformer intensity={1} color="#c8f0ff" position={[0, -3, 4]} scale={[8, 3, 1]} />
            </Environment>
          </Suspense>
          <OrbitControls enablePan={false} enableZoom={!!allowZoom} autoRotate={design.autoRotate ?? false} />
        </Canvas>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full [&_.cd-stage]:absolute [&_.cd-stage]:inset-0 [&_.cd-canvas]:block [&_.cd-canvas]:h-full [&_.cd-canvas]:w-full" onDoubleClick={onDoubleTap}>
      <CaseStage disc={DISC} spin={design.autoRotate ?? true} />
    </div>
  );
}
