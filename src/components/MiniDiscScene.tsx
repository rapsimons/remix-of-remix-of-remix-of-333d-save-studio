import CaseStageRaw from "./cd-case/CaseStage";
import { Suspense, useMemo, type ComponentType } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { createDiscMaterial, discGeometry, setDiscLights } from "@/lib/discShader";
import * as THREE from "three";
const CaseStage = CaseStageRaw as unknown as ComponentType<{ disc: typeof DISC; spin?: boolean; paused?: boolean }>;
import { applyLiquidGlass, LiquidGlassPass } from "./LiquidGlass";
import { BackgroundImage, ExportRegistrar } from "./FloppyScene";
import { DISC } from "./cd-case/disc";
import type { Design } from "@/lib/types";
import { isMiniDiscCart, MD_ASPECT } from "@/lib/media";
import { useLabelTexture } from "@/lib/useLabelTextures";
import mdParts from "@/assets/minidisc-parts.glb.asset.json";
import { plasticGrainNormal } from "@/lib/plasticSurface";
import { StudioSoftboxes } from "./StudioSoftboxes";

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
    return applyLiquidGlass(new THREE.MeshPhysicalMaterial({
      color: design.shellNone ? "#e8eef4" : design.color,
      roughness: Math.max(0.05, design.roughness ?? 0.05),
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
      specularIntensity: 1,
      normalMap: plasticGrainNormal(),
      normalScale: new THREE.Vector2((design.plasticGrain ?? 0.3) * 0.18, (design.plasticGrain ?? 0.3) * 0.18),
      clearcoatNormalMap: plasticGrainNormal(),
      clearcoatNormalScale: new THREE.Vector2((design.plasticGrain ?? 0.3) * 0.08, (design.plasticGrain ?? 0.3) * 0.08),
      transparent: true,
      // keep the case readable even when fully clear
      opacity: Math.min(1, 0.22 + o * 0.78),
      depthWrite: false,
      side: THREE.FrontSide,
    }));
  }, [design.color, design.opacity, design.roughness, design.shellNone, design.plasticGrain]);
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
      if (!m.geometry.attributes["normal"]) m.geometry.computeVertexNormals();
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
    const tint = discMat.uniforms["uTint"];
    if (tint) (tint.value as THREE.Color).set(design.discColor ?? "#ffffff");
    // slider 0..1 → clear plastic ring from just past the hub to ~45% of the disc
    const dataIn = discMat.uniforms["uDataIn"];
    if (dataIn) dataIn.value = 18 + (design.discHubRing ?? 0.3) * 20;
  }, [discMat, design.lights, design.discColor, design.discHubRing]);

  return (
    <group scale={20}>
      <mesh geometry={discGeo} material={discMat} position={[-0.00195, 0, 0.0007]} renderOrder={1} />
      <primitive object={parts} />

      {front && (
        <mesh position={[0, 0, T / 2 + 0.00005]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={front} transparent alphaTest={0.01} depthWrite={false} roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
      {back && (
        <mesh position={[0, 0, -T / 2 - 0.00005]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={back} transparent alphaTest={0.01} depthWrite={false} roughness={0.4} polygonOffset polygonOffsetFactor={-2} />
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
          <ExportRegistrar />
          <BackgroundImage url={design.bgImage} />
          <LiquidGlassPass design={design} />
          <Suspense fallback={null}>
            <Cartridge design={design} />
            <Environment resolution={128}>
              <StudioSoftboxes />
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
