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
import mdModel from "@/assets/minidisc-v1.glb.asset.json";

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
  const gltf = useGLTF(mdModel.url);
  const shell = { color: design.color, opacity: design.opacity ?? 0.55 };
  const front = useLabelTexture(design.front, 1024, "all", shell, MD_ASPECT);
  const back = useLabelTexture(design.back, 1024, "all", shell, MD_ASPECT);

  // Clear plastic: opacity follows the Shell slider directly.
  const mat = useMemo(() => {
    const o = Math.max(0.06, Math.min(1, design.opacity ?? 0.3));
    return new THREE.MeshPhysicalMaterial({
      color: design.color,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      ior: 1.5,
      transparent: o < 0.98,
      opacity: o,
      depthWrite: o >= 0.98,
      side: THREE.DoubleSide,
    });
  }, [design.color, design.opacity]);
  const shellObj = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).material = mat;
        o.renderOrder = 3;
      }
    });
    return s;
  }, [gltf.scene, mat]);

  // Same optical disc + shader as the CD, sized to the 64 mm MiniDisc.
  const R = 0.032;
  const discGeo = useMemo(() => discGeometry(R, R * 0.17, 0.0012), []);
  const discMat = useMemo(() => {
    const m = createDiscMaterial(R, 14.4, 59.1);
    setDiscLights(m, design.lights ?? []);
    return m;
  }, [design.lights]);
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
  // Shutter: one U-shaped sheet wrapping the left edge — front plate, edge strip, back plate.
  const sw = W * 0.39;
  const sh = H * 0.28;
  const sx = -W / 2 + sw / 2;
  const st = 0.0002;
  const z = T / 2 + st / 2;

  return (
    <group scale={20}>
      <mesh geometry={discGeo} material={discMat} renderOrder={1} />
      <group renderOrder={4}>
        <mesh material={metal} position={[sx, 0, z]}>
          <boxGeometry args={[sw, sh, st]} />
        </mesh>
        <mesh material={metal} position={[sx, 0, -z]}>
          <boxGeometry args={[sw, sh, st]} />
        </mesh>
        <mesh material={metal} position={[-W / 2 - st / 2, 0, 0]}>
          <boxGeometry args={[st, sh, T + st * 2]} />
        </mesh>
      </group>
      <primitive object={shellObj} />

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
