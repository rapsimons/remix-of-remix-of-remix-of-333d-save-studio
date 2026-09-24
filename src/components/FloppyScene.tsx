import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { useLabelTexture } from "@/lib/useLabelTextures";
import { DEFAULT_MODEL_URL } from "@/lib/store";

type Props = {
  design: Design;
  modelUrl?: string | undefined;
  flat: boolean;
  lockX: boolean;
  lockY: boolean;
  onDoubleTap?: (() => void) | undefined;
  interactive?: boolean | undefined;
};

function dominantNormal(root: THREE.Object3D): THREE.Vector3 {
  // accumulate n * n^T over surface normals; the dominant eigenvector is the
  // normal of the largest flat face (the disk face)
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const n = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const attr = mesh.geometry.getAttribute("normal");
    if (!attr) return;
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const step = Math.max(1, Math.floor(attr.count / 4000));
    for (let i = 0; i < attr.count; i += step) {
      n.fromBufferAttribute(attr as THREE.BufferAttribute, i).applyMatrix3(nm).normalize();
      const v = [n.x, n.y, n.z];
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a * 3 + b]! += v[a]! * v[b]!;
    }
  });
  let v = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
  for (let it = 0; it < 40; it++) {
    const x = m[0]! * v.x + m[1]! * v.y + m[2]! * v.z;
    const y = m[3]! * v.x + m[4]! * v.y + m[5]! * v.z;
    const z = m[6]! * v.x + m[7]! * v.y + m[8]! * v.z;
    const nv = new THREE.Vector3(x, y, z);
    if (nv.lengthSq() < 1e-12) break;
    v = nv.normalize();
  }
  return v;
}

function normalize(scene: THREE.Object3D) {
  const clone = scene.clone(true);
  clone.updateMatrixWorld(true);

  // rotate so the disk face points at the camera (+Z)
  const normal = dominantNormal(clone);
  const q = new THREE.Quaternion().setFromUnitVectors(normal, new THREE.Vector3(0, 0, 1));
  const aligned = new THREE.Group();
  aligned.quaternion.copy(q);
  aligned.add(clone);
  aligned.updateMatrixWorld(true);

  // roll the face upright: pick the in-plane angle with the tightest bounds
  let bestRoll = 0;
  let bestArea = Infinity;
  const probe = new THREE.Vector3();
  for (let deg = -45; deg <= 45; deg += 1) {
    aligned.rotation.z = (deg * Math.PI) / 180;
    aligned.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(aligned, true).getSize(probe);
    const area = probe.x * probe.y;
    if (area < bestArea) {
      bestArea = area;
      bestRoll = (deg * Math.PI) / 180;
    }
  }
  aligned.rotation.z = bestRoll;
  aligned.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(aligned, true);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  aligned.position.sub(center);

  const outer = new THREE.Group();
  outer.add(aligned);
  const scale = 2 / Math.max(size.x, size.y);
  outer.scale.setScalar(scale);

  return { object: outer, depth: size.z * scale, faceW: size.x * scale, faceH: size.y * scale };
}

function createOpticalDiscTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const center = canvas.width / 2;
  const gradient = ctx.createConicGradient(0.2, center, center);
  gradient.addColorStop(0, "#d7dde1");
  gradient.addColorStop(0.12, "#8ee8ef");
  gradient.addColorStop(0.25, "#f5f7f8");
  gradient.addColorStop(0.39, "#c59bea");
  gradient.addColorStop(0.53, "#f2a7b7");
  gradient.addColorStop(0.67, "#f0de86");
  gradient.addColorStop(0.82, "#91dce8");
  gradient.addColorStop(1, "#d7dde1");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#4e555b";
  ctx.lineWidth = 1;
  for (let radius = 48; radius < 252; radius += 4) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
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

  const metalMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#d7dce0"),
        metalness: 1,
        roughness: 0.18,
        clearcoat: 0.35,
        clearcoatRoughness: 0.12,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const opticalDiscMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#c8cdd2"),
        metalness: 0.92,
        roughness: 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        iridescence: 1,
        iridescenceIOR: 1.45,
        iridescenceThicknessRange: [180, 900],
        side: THREE.DoubleSide,
      }),
    [],
  );

  const opticalDiscTexture = useMemo(() => createOpticalDiscTexture(), []);
  const opticalDiscOverlayMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: opticalDiscTexture,
        color: new THREE.Color("#ffffff"),
        metalness: 0.82,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        iridescence: 1,
        iridescenceIOR: 1.5,
        iridescenceThicknessRange: [220, 780],
        side: THREE.DoubleSide,
      }),
    [opticalDiscTexture],
  );

  useEffect(() => {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name.toLowerCase();
      if (name.includes("magnetic_disk") || name.includes("magnetic disk")) {
        mesh.material = opticalDiscMaterial;
      } else if (name.includes("shutter")) {
        mesh.material = metalMaterial;
      } else {
        mesh.material = material;
      }
    });
  }, [object, material, metalMaterial, opticalDiscMaterial]);

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
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = (cam.fov * Math.PI) / 180;
    const fit = Math.max(faceH / (2 * Math.tan(vFov / 2)), faceW / (2 * Math.tan(vFov / 2) * cam.aspect));
    const g = group.current;
    if (!g) return;
    const s = spin.current;
    if (flat) {
      s.vx = 0;
      s.vy = 0;
      const ty = Math.round(s.y / (Math.PI * 2)) * Math.PI * 2;
      s.x += (0 - s.x) * Math.min(1, dt * 6);
      s.y += (ty - s.y) * Math.min(1, dt * 6);
      camera.position.lerp(new THREE.Vector3(0, 0, fit * 1.15), Math.min(1, dt * 4));
    } else {
      s.x += s.vx;
      s.y += s.vy;
      const damp = Math.exp(-4 * dt);
      s.vx *= damp;
      s.vy *= damp;
      if (design.autoRotate && Math.abs(s.vy) < 0.0008) s.y += design.autoRotateSpeed * dt;
      camera.position.lerp(new THREE.Vector3(0, 0, fit * 1.5), Math.min(1, dt * 3));
    }
    g.rotation.x = s.x;
    g.rotation.y = s.y;
    camera.lookAt(0, 0, 0);
  });

  const off = depth / 2 + 0.004;
  const discRadius = Math.min(faceW, faceH) * 0.39;
  const discY = -faceH * 0.08;
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
      <mesh position={[0, discY, 0]} material={opticalDiscOverlayMaterial}>
        <ringGeometry args={[discRadius * 0.13, discRadius, 96]} />
      </mesh>
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
      <ambientLight intensity={0.72} />
      <directionalLight position={[3, 4, 5]} intensity={1.8} />
      <directionalLight position={[-4, -2, -3]} intensity={0.8} />
      <Suspense fallback={null}>
        <ErrorGuard onError={() => setFailed(true)}>
          <Floppy {...props} />
          <Environment resolution={256}>
            <Lightformer intensity={3} position={[0, 4, 2]} scale={[8, 8, 1]} />
            <Lightformer intensity={1.8} color="#dfe6ee" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[16, 3, 1]} />
            <Lightformer intensity={1.8} color="#ffffff" position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[16, 3, 1]} />
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
