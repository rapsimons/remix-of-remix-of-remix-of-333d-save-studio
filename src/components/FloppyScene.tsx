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
  // bin face normals by direction, weighted by triangle area; the largest bin
  // is the normal of the biggest flat face (the disk face)
  const bins = new Map<string, { area: number; n: THREE.Vector3 }>();
  const n = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    const index = geo.getIndex();
    const triCount = index ? index.count / 3 : pos.count / 3;
    const step = Math.max(1, Math.floor(triCount / 6000));
    for (let t = 0; t < triCount; t += step) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos as THREE.BufferAttribute, i0).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(pos as THREE.BufferAttribute, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos as THREE.BufferAttribute, i2).applyMatrix4(mesh.matrixWorld);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      // cross of world-space edges is already a world-space normal
      n.crossVectors(ab, ac);
      const area2 = n.length();
      if (area2 < 1e-10) continue;
      n.divideScalar(area2);
      const key = `${Math.round(n.x * 20)},${Math.round(n.y * 20)},${Math.round(n.z * 20)}`;
      const bin = bins.get(key);
      if (bin) {
        bin.area += area2 / 2;
      } else {
        bins.set(key, { area: area2 / 2, n: n.clone() });
      }
    }
  });
  let best: { area: number; n: THREE.Vector3 } | undefined;
  for (const bin of bins.values()) {
    if (!best || bin.area > best.area) best = bin;
  }
  return best ? best.n.clone().normalize() : new THREE.Vector3(0, 0, 1);
}

function normalize(scene: THREE.Object3D) {
  const clone = scene.clone(true);
  clone.updateMatrixWorld(true);

  // the model's dominant face normal points out of its BACK, so negate it to
  // get the front face and turn that toward the camera (+Z)
  const frontNormal = dominantNormal(clone).negate();
  const qBase = new THREE.Quaternion().setFromUnitVectors(frontNormal, new THREE.Vector3(0, 0, 1));
  const aligned = new THREE.Group();
  aligned.add(clone);

  // roll the face upright: pick the in-plane angle with the tightest bounds.
  // compose roll with the base alignment via quaternion multiply — assigning
  // rotation.z directly would wipe out the face alignment
  let bestRoll = 0;
  let bestArea = Infinity;
  const probe = new THREE.Vector3();
  const qRoll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let deg = -45; deg <= 45; deg += 1) {
    const rad = (deg * Math.PI) / 180;
    qRoll.setFromAxisAngle(zAxis, rad);
    aligned.quaternion.copy(qRoll).multiply(qBase);
    aligned.updateMatrixWorld(true);
    new THREE.Box3().setFromObject(aligned, true).getSize(probe);
    const area = probe.x * probe.y;
    if (area < bestArea) {
      bestArea = area;
      bestRoll = rad;
    }
  }
  qRoll.setFromAxisAngle(zAxis, bestRoll);
  aligned.quaternion.copy(qRoll).multiply(qBase);
  aligned.updateMatrixWorld(true);

  // the metal shutter belongs at the top; flip 180° when it lands at the bottom
  let shutterMesh: THREE.Object3D | undefined;
  aligned.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.name.toLowerCase().includes("shutter")) shutterMesh = o;
  });
  if (shutterMesh) {
    const shutterY = new THREE.Box3().setFromObject(shutterMesh).getCenter(new THREE.Vector3()).y;
    const bodyY = new THREE.Box3().setFromObject(aligned, true).getCenter(new THREE.Vector3()).y;
    if (shutterY < bodyY) {
      qRoll.setFromAxisAngle(zAxis, bestRoll + Math.PI);
      aligned.quaternion.copy(qRoll).multiply(qBase);
      aligned.updateMatrixWorld(true);
    }
  }


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

  outer.updateMatrixWorld(true);
  // measure the shell body (the "floppy" mesh), not the overall bounds — the
  // metal shutter protrudes past the shell face, so overall bounds would park
  // labels at shutter depth, floating off the body
  let frontSurface = (size.z * scale) / 2;
  let backSurface = -(size.z * scale) / 2;
  let shellArea = 0;
  outer.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name.toLowerCase();
    if (!name.includes("floppy")) return;
    const mb = new THREE.Box3().setFromObject(mesh, true);
    const ms = mb.getSize(new THREE.Vector3());
    const area = ms.x * ms.y;
    if (area <= shellArea) return;
    shellArea = area;
    frontSurface = mb.max.z;
    backSurface = mb.min.z;
  });

  return { object: outer, frontSurface, backSurface, faceW: size.x * scale, faceH: size.y * scale };
}

function Floppy({ design, modelUrl, flat, lockX, lockY, onDoubleTap, interactive = true }: Props) {
  const gltf = useGLTF(modelUrl || DEFAULT_MODEL_URL);
  const group = useRef<THREE.Group>(null);
  const spin = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const { gl, camera } = useThree();

  const { object, frontSurface, backSurface, faceW, faceH } = useMemo(() => normalize(gltf.scene), [gltf.scene]);

  const frontTex = useLabelTexture(design.front, 1024, "base");
  const backTex = useLabelTexture(design.back, 1024, "base");
  const frontHoloTex = useLabelTexture(design.front, 1024, "holo");
  const backHoloTex = useLabelTexture(design.back, 1024, "holo");

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

  const surfaceGap = 0.0005;
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
        {frontTex && (
          <mesh position={[0, 0, frontSurface + surfaceGap]}>
            <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
            <meshStandardMaterial
              map={frontTex}
              transparent
              roughness={0.45}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {frontHoloTex && (
          <mesh position={[0, 0, frontSurface + surfaceGap * 3]}>
            <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
            <meshPhysicalMaterial
              map={frontHoloTex}
              transparent
              depthWrite={false}
              metalness={0.9}
              roughness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.05}
              iridescence={1}
              iridescenceIOR={1.6}
              iridescenceThicknessRange={[200, 820]}
              envMapIntensity={2.4}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        )}
        {backTex && (
          <mesh position={[0, 0, backSurface - surfaceGap]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
            <meshStandardMaterial
              map={backTex}
              transparent
              roughness={0.45}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {backHoloTex && (
          <mesh position={[0, 0, backSurface - surfaceGap * 3]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[faceW * 0.94, faceH * 0.94]} />
            <meshPhysicalMaterial
              map={backHoloTex}
              transparent
              depthWrite={false}
              metalness={0.9}
              roughness={0.12}
              clearcoat={1}
              clearcoatRoughness={0.05}
              iridescence={1}
              iridescenceIOR={1.6}
              iridescenceThicknessRange={[200, 820]}
              envMapIntensity={2.4}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        )}
      </group>
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
