import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { CD_INNER, CD_OUTER, labelAspect, labelDonut, cdBackColor } from "@/lib/media";
import { useLabelTexture } from "@/lib/useLabelTextures";
import { createDiscMaterial, discGeometry, setDiscLights } from "@/lib/discShader";
import { lidGeometry, trayGeometry } from "@/lib/caseGeometry";
import cdV2 from "@/assets/cd-v2.glb.asset.json";
import cdV3 from "@/assets/cd-v3.glb.asset.json";

// Closed CD jewel case (geometry ported from annnguyentt/vibe-coding cd-case), millimetres.
const DISC_R = 60;
const CLEAR_R = 15;
const DISC_Z = -1.8; // disc centre height inside the tray
const SCALE = 0.02;

type Props = {
  design: Design;
  lockX?: boolean;
  lockY?: boolean;
  allowZoom?: boolean;
  onDoubleTap?: () => void;
};

function useArt(design: Design) {
  const aspect = labelAspect({ mediaType: "cd" });
  const donut = labelDonut({ mediaType: "cd" });
  const shell = useMemo(() => ({ color: design.color, opacity: 0 }), [design.color]);
  return useLabelTexture(design.front, 1024, "all", shell, aspect ?? 1, donut);
}

/** V1 — procedural optical disc with the cd-case diffraction shader. */
function ProceduralDisc({ design }: { design: Design }) {
  const art = useArt(design);
  const geo = useMemo(() => discGeometry(DISC_R, CLEAR_R, 1.2), []);
  const mat = useMemo(() => createDiscMaterial(DISC_R, CD_INNER * 60, CD_OUTER * 60), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useEffect(() => {
    mat.uniforms["uArt"]!.value = art;
    mat.uniforms["uHasArt"]!.value = art ? 1 : 0;
  }, [art, mat]);
  useEffect(() => setDiscLights(mat, design.lights ?? []), [design.lights, mat]);
  return <mesh geometry={geo} material={mat} />;
}

/** V2/V3 — the uploaded CD models, fitted to a 120 mm disc lying flat in the tray. */
function GlbDisc({ url, design }: { url: string; design: Design }) {
  const { scene } = useGLTF(url);
  const art = useArt(design);
  const back = cdBackColor(design);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    // thinnest axis is the disc thickness: rotate it onto Z
    if (size.y < size.x && size.y < size.z) root.rotation.x = Math.PI / 2;
    else if (size.x < size.y && size.x < size.z) root.rotation.y = Math.PI / 2;
    root.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(root);
    const s2 = b2.getSize(new THREE.Vector3());
    const c = b2.getCenter(new THREE.Vector3());
    const k = (DISC_R * 2) / Math.max(s2.x, s2.y);
    const g = new THREE.Group();
    root.position.sub(c);
    g.add(root);
    g.scale.setScalar(k);
    return g;
  }, [scene]);
  useEffect(() => {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const n = `${m.name} ${(m.material as THREE.Material)?.name ?? ""}`.toLowerCase();
      if (n.includes("clearplastic")) {
        m.material = new THREE.MeshPhysicalMaterial({ color: "#eef4f8", transparent: true, opacity: 0.3, roughness: 0.03, clearcoat: 1, depthWrite: false });
      } else if (n.includes("label")) {
        m.visible = false;
      } else {
        m.material = new THREE.MeshPhysicalMaterial({ color: back, metalness: 1, roughness: 0.12, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900] });
      }
    });
  }, [obj, back]);
  return (
    <group>
      <primitive object={obj} />
      {art && (
        <mesh position={[0, 0, 0.9]} renderOrder={1}>
          <circleGeometry args={[DISC_R, 128]} />
          <meshPhysicalMaterial map={art} transparent roughness={0.35} clearcoat={0.6} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function JewelCase({ design }: { design: Design }) {
  const lid = useMemo(() => lidGeometry(), []);
  const tray = useMemo(() => trayGeometry(), []);
  useEffect(() => () => {
    [lid.rods, lid.sheets, tray.rods, tray.sheets].forEach((g: THREE.BufferGeometry) => g.dispose());
  }, [lid, tray]);

  const clear = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transparent: true,
        roughness: 0.02,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        ior: 1.59,
        depthWrite: false,
        side: THREE.DoubleSide,
        envMapIntensity: 1.6,
      }),
    [],
  );
  useEffect(() => {
    clear.color.set(design.color);
    clear.opacity = Math.max(0.08, design.opacity);
    clear.roughness = design.roughness;
  }, [clear, design.color, design.opacity, design.roughness]);
  const rods = useMemo(() => {
    const m = clear.clone();
    m.opacity = 0.6;
    return m;
  }, [clear]);
  useEffect(() => {
    rods.color.set(design.color);
    rods.opacity = Math.min(1, Math.max(0.25, design.opacity * 1.6));
  }, [rods, design.color, design.opacity]);

  const disc = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (disc.current) disc.current.rotation.z += Math.min(dt, 0.05) * 0.15;
  });
  const v = design.modelVariant ?? "v1";

  return (
    <group scale={SCALE}>
      <group ref={disc} position={[0, 0, DISC_Z]}>
        {v === "v1" && <ProceduralDisc design={design} />}
        {v === "v2" && <GlbDisc url={cdV2.url} design={design} />}
        {v === "v3" && <GlbDisc url={cdV3.url} design={design} />}
      </group>
      <mesh geometry={tray.sheets} material={clear} renderOrder={2} />
      <mesh geometry={tray.rods} material={rods} renderOrder={2} />
      <mesh geometry={lid.sheets} material={clear} renderOrder={3} />
      <mesh geometry={lid.rods} material={rods} renderOrder={3} />
    </group>
  );
}

function BackgroundImage({ url }: { url?: string | undefined }) {
  const { scene } = useThree();
  useEffect(() => {
    if (!url) {
      scene.background = null;
      return;
    }
    let alive = true;
    let tex: THREE.Texture | null = null;
    new THREE.TextureLoader().load(url, (t) => {
      if (!alive) return t.dispose();
      t.colorSpace = THREE.SRGBColorSpace;
      tex = t;
      scene.background = t;
    });
    return () => {
      alive = false;
      scene.background = null;
      tex?.dispose();
    };
  }, [url, scene]);
  return null;
}

export function MiniDiscScene({ design, lockX, lockY, allowZoom, onDoubleTap }: Props) {
  const lights = design.lights ?? [];
  return (
    <div className="h-full w-full" onDoubleClick={onDoubleTap}>
      <Canvas
        camera={{ position: [0, 0, 5.4], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
        }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.4} />
        <directionalLight position={[-4, -2, -3]} intensity={0.6} />
        {lights.map((l) => (
          <hemisphereLight key={l.id} position={[l.x * 10, -l.y * 10, 6]} color={l.color} groundColor="#000000" intensity={l.intensity * 0.9} />
        ))}
        <BackgroundImage url={design.bgImage} />
        <Suspense fallback={null}>
          <JewelCase design={design} />
          <Environment resolution={256} key={JSON.stringify(lights)}>
            <Lightformer intensity={3} position={[0, 4, 2]} scale={[8, 8, 1]} />
            <Lightformer intensity={1.8} color="#dfe6ee" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[16, 3, 1]} />
            <Lightformer intensity={1.8} position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[16, 3, 1]} />
            {lights.map((l) => (
              <Lightformer key={l.id} intensity={l.intensity * 0.6} color={l.color} position={[l.x * 9, -l.y * 9, 3]} scale={[14, 14, 1]} target={[0, 0, 0]} />
            ))}
          </Environment>
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={!!allowZoom}
          minDistance={2}
          maxDistance={10}
          autoRotate={design.autoRotate}
          autoRotateSpeed={design.autoRotateSpeed * 2}
          {...(lockY ? { minPolarAngle: Math.PI / 2, maxPolarAngle: Math.PI / 2 } : {})}
          {...(lockX ? { minAzimuthAngle: 0, maxAzimuthAngle: 0 } : {})}
        />
      </Canvas>
    </div>
  );
}
