import CaseStageRaw from "./cd-case/CaseStage";
import { Suspense, useEffect, useMemo, type ComponentType } from "react";
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
import { metalFinish } from "@/lib/metalSurface";
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

/** Repair a private copy of CAD metal; never mutate useGLTF's shared geometry. */
function prepareMetalGeometry(source: THREE.BufferGeometry, shutter: boolean) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.getAttribute("position");
  if (!positions) return geometry;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return geometry;
  const middleZ = (bounds.min.z + bounds.max.z) / 2;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const edge = new THREE.Vector3();
  const uvs = new Float32Array(positions.count * 2);
  for (let i = 0; i + 2 < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    normal.subVectors(b, a).cross(edge.subVectors(c, a)).normalize();
    const faceZ = (a.z + b.z + c.z) / 3;
    if (shutter && Math.abs(normal.z) > 0.5 && normal.z * (faceZ - middleZ) < 0) {
      positions.setXYZ(i + 1, c.x, c.y, c.z);
      positions.setXYZ(i + 2, b.x, b.y, b.z);
      normal.negate();
    }
    // Dominant-axis projection also gives the wrap-around edge usable UVs.
    const axis = Math.abs(normal.z) >= Math.max(Math.abs(normal.x), Math.abs(normal.y))
      ? "z" : Math.abs(normal.x) >= Math.abs(normal.y) ? "x" : "y";
    const u = axis === "x" ? "z" : "x";
    const v = axis === "y" ? "z" : "y";
    for (let j = i; j < i + 3; j++) {
      a.fromBufferAttribute(positions, j);
      uvs[j * 2] = (a[u] - bounds.min[u]) / Math.max(bounds.max[u] - bounds.min[u], 0.000001);
      uvs[j * 2 + 1] = (a[v] - bounds.min[v]) / Math.max(bounds.max[v] - bounds.min[v], 0.000001);
    }
  }
  positions.needsUpdate = true;
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

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
        ...metalFinish(design.shutterBrushed, design.shutterIridescence),
        metalness: design.shutterMetalness ?? 1,
        roughness: design.shutterRoughness ?? 0.18,
        clearcoat: 0.15,
        envMapIntensity: 1.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.DoubleSide,
      }),
    [design.shutterColor, design.shutterMetalness, design.shutterRoughness, design.shutterBrushed, design.shutterIridescence],
  );
  const preparedParts = useMemo(() => {
    const s = gltf.scene.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = `${m.name} ${m.parent?.name ?? ""}`.toLowerCase();
      m.geometry = /shutter|hub/.test(name)
        ? prepareMetalGeometry(m.geometry, /shutter/.test(name))
        : m.geometry.clone();
      if (!m.geometry.attributes["normal"]) m.geometry.computeVertexNormals();
    });
    return s;
  }, [gltf.scene]);
  useEffect(() => () => {
    preparedParts.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }, [preparedParts]);
  const parts = useMemo(() => {
    const s = preparedParts.clone(true);
    s.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = `${m.name} ${m.parent?.name ?? ""}`.toLowerCase();
      const isMetal = /shutter|hub/.test(name);
      m.material = isMetal ? metal : plastic;
      m.renderOrder = /shutter/.test(name) ? 6 : isMetal ? 2 : 4;
    });
    return s;
  }, [preparedParts, plastic, metal]);

  // Same optical disc + shader as the CD, at the disc's true spot in the model.
  const R = 0.032;
  const innerRadius = R * (18 + (design.discHubRing ?? 0.3) * 20) / 60;
  const outerRadius = R * 0.975;
  const discGeo = useMemo(() => discGeometry(outerRadius, innerRadius, 0.0012), [innerRadius, outerRadius]);
  const clearInnerGeo = useMemo(() => discGeometry(innerRadius, 0.0076, 0.0012), [innerRadius]);
  const clearOuterGeo = useMemo(() => discGeometry(R, outerRadius, 0.0012), [outerRadius]);
  const clearDiscPlastic = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: "#ffffff", transparent: true, opacity: 0.12, depthWrite: false,
    roughness: 0.06, metalness: 0, clearcoat: 1, envMapIntensity: 1.2,
    side: THREE.FrontSide,
  }), []);
  useEffect(() => () => {
    discGeo.dispose(); clearInnerGeo.dispose(); clearOuterGeo.dispose();
  }, [discGeo, clearInnerGeo, clearOuterGeo]);
  useEffect(() => () => clearDiscPlastic.dispose(), [clearDiscPlastic]);
  const discMat = useMemo(() => {
    return createDiscMaterial(R, 15.2, 59.1);
  }, []);
  useMemo(() => {
    setDiscLights(discMat, design.lights ?? []);
    const tint = discMat.uniforms["uTint"];
    if (tint) (tint.value as THREE.Color).set(design.discColor ?? "#ffffff");
  }, [discMat, design.lights, design.discColor]);

  return (
    <group scale={20}>
      <mesh geometry={discGeo} material={discMat} position={[-0.00195, 0, 0.0007]} renderOrder={1} />
      <mesh geometry={clearInnerGeo} material={clearDiscPlastic} position={[-0.00195, 0, 0.0007]} renderOrder={3} />
      <mesh geometry={clearOuterGeo} material={clearDiscPlastic} position={[-0.00195, 0, 0.0007]} renderOrder={3} />
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
