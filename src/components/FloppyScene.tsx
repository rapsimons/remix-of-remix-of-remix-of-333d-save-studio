import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { useLabelTexture } from "@/lib/useLabelTextures";
import { DEFAULT_MODEL_URL } from "@/lib/store";

type Props = {
  design: Design;
  modelUrl?: string;
  flat: boolean;
  lockX: boolean;
  lockY: boolean;
  onDoubleTap?: () => void;
  interactive?: boolean;
};

function normalize(scene: THREE.Object3D) {
  const clone = scene.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  clone.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.add(clone);

  // thinnest axis becomes the depth (z) axis so the face points at the camera
  const dims = [size.x, size.y, size.z];
  const thin = dims.indexOf(Math.min(...dims));
  if (thin === 0) wrapper.rotation.y = Math.PI / 2;
  else if (thin === 1) wrapper.rotation.x = -Math.PI / 2;

  const outer = new THREE.Group();
  outer.add(wrapper);
  const faceDims = dims.filter((_, i) => i !== thin);
  const maxFace = Math.max(...faceDims);
  const scale = 2 / maxFace;
  outer.scale.setScalar(scale);

  const depth = dims[thin]! * scale;
  const faceW = (thin === 0 ? size.z : size.x) * scale;
  const faceH = (thin === 1 ? size.z : size.y) * scale;
  return { object: outer, depth, faceW, faceH };
}

function Floppy({ design, modelUrl, flat, lockX, lockY, onDoubleTap, interactive = true }: Props) {
  const gltf = useGLTF(modelUrl || DEFAULT_MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const spin = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const { gl, camera } = useThree();

  const { object, depth, faceW, faceH } = useMemo(() => normalize(gltf.scene), [gltf.scene]);

  const frontTex = useLabelTexture(design.front);
  const backTex = useLabelTexture(design.back);

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(design.color),
        roughness: design.roughness,
        transmission: 1,
        thickness: 0.5,
        ior: 1.45,
        clearcoat: 0.6,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: design.opacity,
        side: THREE.DoubleSide,
      }),
    [design.color, design.roughness, design.opacity],
  );

  useEffect(() => {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = material;
    });
  }, [object, material]);

  // pointer gestures
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTap = 0;

    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      if (now - lastTap < 320) onDoubleTap?.();
      lastTap = now;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!lockY) spin.current.vy = dx * 0.005;
      if (!lockX) spin.current.vx = dy * 0.005;
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, lockX, lockY, onDoubleTap, interactive]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const g = group.current;
    if (!g) return;
    const s = spin.current;
    if (flat) {
      s.vx = 0;
      s.vy = 0;
      s.x += (0 - s.x) * Math.min(1, dt * 6);
      s.y += (0 - s.y) * Math.min(1, dt * 6);
      camera.position.lerp(new THREE.Vector3(0, 0, 3.4), Math.min(1, dt * 4));
    } else {
      s.x += s.vx;
      s.y += s.vy;
      const damp = Math.exp(-4 * dt);
      s.vx *= damp;
      s.vy *= damp;
      if (design.autoRotate && Math.abs(s.vy) < 0.0008) s.y += design.autoRotateSpeed * dt;
      camera.position.lerp(new THREE.Vector3(0, 0, 4.2), Math.min(1, dt * 3));
    }
    g.rotation.x = s.x;
    g.rotation.y = s.y;
    camera.lookAt(0, 0, 0);
  });

  const off = depth / 2 + 0.004;
  const a = design.alignment;
  const rad = Math.PI / 180;

  return (
    <group ref={group}>
      <group
        rotation={[a.rotX * rad, a.rotY * rad, a.rotZ * rad]}
        scale={a.scale}
        position={[a.offsetX, a.offsetY, 0]}
      >
        <primitive object={object} />
      </group>
      {frontTex && (
        <mesh position={[0, 0, off]}>
          <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
          <meshStandardMaterial map={frontTex} transparent roughness={0.45} />
        </mesh>
      )}
      {backTex && (
        <mesh position={[0, 0, -off]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
          <meshStandardMaterial map={backTex} transparent roughness={0.45} />
        </mesh>
      )}
    </group>
  );
}

export function FloppyScene(props: Props) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="flex h-full items-center justify-center text-xs tracking-widest uppercase text-muted-foreground">
        Model unavailable
      </div>
    );
  return (
    <Canvas
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
      }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight position={[-4, -2, -3]} intensity={0.6} />
      <Suspense fallback={null}>
        <ErrorGuard onError={() => setFailed(true)}>
          <Floppy {...props} />
          <Environment resolution={256}>
            <Lightformer intensity={2.4} position={[0, 4, 2]} scale={[8, 8, 1]} />
            <Lightformer intensity={1.2} color="#dfe6ee" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[16, 3, 1]} />
            <Lightformer intensity={1.2} color="#ffffff" position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[16, 3, 1]} />
          </Environment>
        </ErrorGuard>
      </Suspense>
    </Canvas>
  );
}

import { Component, type ReactNode } from "react";
class ErrorGuard extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  override state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.hasError ? null : this.props.children;
  }
}
