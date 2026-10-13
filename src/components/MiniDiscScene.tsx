import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { CD_INNER, CD_OUTER, labelAspect, labelDonut } from "@/lib/media";
import { useLabelTexture } from "@/lib/useLabelTextures";
import { createDiscMaterial, discGeometry, setDiscLights } from "@/lib/discShader";

// MiniDisc cartridge, millimetres (real: 72 × 68 × 5 mm, 64 mm disc).
const W = 72;
const H = 68;
const T = 5;
const DISC_R = 32;
const HUB_R = 5.6;
const CLEAR_R = 8.5;
const SCALE = 0.036;

type Props = {
  design: Design;
  lockX?: boolean;
  lockY?: boolean;
  allowZoom?: boolean;
  onDoubleTap?: () => void;
};

function Cartridge({ design }: { design: Design }) {
  const aspect = labelAspect(design);
  const donut = labelDonut(design);
  const shell = useMemo(() => ({ color: design.color, opacity: 0 }), [design.color]);
  const art = useLabelTexture(design.front, 1024, "all", shell, aspect, donut);

  const geo = useMemo(() => discGeometry(DISC_R, CLEAR_R, 1.2), []);
  // artwork radii in the shader are expressed on the 120 mm CD scale
  const mat = useMemo(() => createDiscMaterial(DISC_R, CD_INNER * 60, CD_OUTER * 60), []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useEffect(() => {
    mat.uniforms["uArt"]!.value = art;
    mat.uniforms["uHasArt"]!.value = art ? 1 : 0;
  }, [art, mat]);
  useEffect(() => setDiscLights(mat, design.lights ?? []), [design.lights, mat]);

  const disc = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (disc.current) disc.current.rotation.z += Math.min(dt, 0.05) * 0.15;
  });

  const shutterColor = design.shutterColor ?? "#c9ccd1";
  const shutterMetal = design.shutterMetalness ?? 1;
  const shutterRough = design.shutterRoughness ?? 0.25;
  const discY = -3; // disc sits slightly below the cartridge centre

  return (
    <group scale={SCALE}>
      {/* the disc, rendered first and opaque */}
      <group ref={disc} position={[0, discY, 0]}>
        <mesh geometry={geo} material={mat} renderOrder={0} />
        {/* metal clamping hub */}
        <mesh rotation-x={Math.PI / 2} renderOrder={0}>
          <cylinderGeometry args={[HUB_R, HUB_R, 1.4, 48]} />
          <meshPhysicalMaterial color="#d7dadf" metalness={1} roughness={0.18} clearcoat={1} />
        </mesh>
        {/* clear polycarbonate between hub and data area */}
        <mesh renderOrder={1}>
          <ringGeometry args={[HUB_R, CLEAR_R, 64]} />
          <meshPhysicalMaterial color="#e8f0f6" transparent opacity={0.25} roughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>

      {/* metal shutter on the back, wraps over the top edge */}
      <mesh position={[0, discY - 8, -T / 2 - 0.15]} renderOrder={2}>
        <boxGeometry args={[44, 30, 0.3]} />
        <meshPhysicalMaterial color={shutterColor} metalness={shutterMetal} roughness={shutterRough} clearcoat={0.6} />
      </mesh>
      <mesh position={[0, -H / 2 - 0.15, -T / 4]} renderOrder={2}>
        <boxGeometry args={[44, 0.3, T / 2 + 0.3]} />
        <meshPhysicalMaterial color={shutterColor} metalness={shutterMetal} roughness={shutterRough} />
      </mesh>

      {/* clear plastic cartridge, drawn last so the disc shows through */}
      <RoundedBox args={[W, H, T]} radius={2.2} smoothness={4} renderOrder={3}>
        <meshPhysicalMaterial
          color={design.color}
          transparent
          opacity={Math.max(0.06, design.opacity)}
          roughness={design.roughness}
          metalness={design.metalness ?? 0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          ior={1.5}
          depthWrite={false}
          envMapIntensity={1.4}
        />
      </RoundedBox>
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
        camera={{ position: [0, 0, 4.2], fov: 42 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <directionalLight position={[-4, -2, -3]} intensity={0.7} />
        {lights.map((l) => (
          <hemisphereLight key={l.id} position={[l.x * 10, -l.y * 10, 6]} color={l.color} groundColor="#000000" intensity={l.intensity * 0.9} />
        ))}
        <BackgroundImage url={design.bgImage} />
        <Suspense fallback={null}>
          <Cartridge design={design} />
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
          maxDistance={8}
          autoRotate={design.autoRotate}
          autoRotateSpeed={design.autoRotateSpeed * 2}
          {...(lockY ? { minPolarAngle: Math.PI / 2, maxPolarAngle: Math.PI / 2 } : {})}
          {...(lockX ? { minAzimuthAngle: 0, maxAzimuthAngle: 0 } : {})}
        />
      </Canvas>
    </div>
  );
}
