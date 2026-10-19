import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Design } from "@/lib/types";
import { useLabelTexture, useMoldTextures } from "@/lib/useLabelTextures";
import { DEFAULT_MODEL_URL } from "@/lib/store";
import { cdBackColor, isCd, labelAspect, labelDonut, modelUrlFor, CD_OUTER, CD_INNER } from "@/lib/media";
import { createCdBackMaterial, setCdLights } from "@/lib/cdShader";
import cdModel from "@/assets/cd.glb.asset.json";
import {
  createHoloMaterial,
  holoOverlayIndex,
  holoPatternIndex,
  studioEnvTexture,
} from "@/lib/holoShader";

type Props = {
  design: Design;
  modelUrl?: string | undefined;
  flat: boolean;
  lockX: boolean;
  lockY: boolean;
  onDoubleTap?: (() => void) | undefined;
  interactive?: boolean | undefined;
  /** enable pinch / wheel zoom (used by the full-screen viewer) */
  allowZoom?: boolean | undefined;
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

function normalizeCd(scene: THREE.Object3D) {
  const clone = scene.clone(true);
  clone.updateMatrixWorld(true);
  const frontNormal = dominantNormal(clone).negate();
  const aligned = new THREE.Group();
  aligned.add(clone);
  aligned.quaternion.setFromUnitVectors(frontNormal, new THREE.Vector3(0, 0, 1));
  aligned.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(aligned);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y);
  const outer = new THREE.Group();
  aligned.position.sub(center);
  outer.add(aligned);
  outer.scale.setScalar(scale);
  const d = Math.max(size.x, size.y) * scale;
  return { object: outer, frontSurface: (size.z * scale) / 2, backSurface: -(size.z * scale) / 2, faceW: d, faceH: d };
}

function Floppy({ design, modelUrl, flat, lockX, lockY, onDoubleTap, interactive = true, allowZoom = false }: Props) {
  const cd = isCd(design);
  const gltf = useGLTF(modelUrlFor(design, cd ? cdModel.url : modelUrl || DEFAULT_MODEL_URL));
  const group = useRef<THREE.Group>(null);
  const spin = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const zoom = useRef(1);
  const { gl, camera } = useThree();


  const { object, frontSurface, backSurface, faceW, faceH } = useMemo(
    () => (cd ? normalizeCd(gltf.scene) : normalize(gltf.scene)),
    [gltf.scene, cd],
  );
  const aspect = labelAspect(design);
  const donut = labelDonut(design);

  const shell = useMemo(
    () => ({ color: design.color, opacity: design.opacity }),
    [design.color, design.opacity],
  );
  const frontTex = useLabelTexture(design.front, 1024, "base", shell, aspect, donut);
  const backTex = useLabelTexture(design.back, 1024, "base", shell, aspect, donut);
  const frontHoloTex = useLabelTexture(design.front, 1024, "holo", shell, aspect, donut);
  const backHoloTex = useLabelTexture(design.back, 1024, "holo", shell, aspect, donut);
  const frontMoldRaw = useMoldTextures(design.front, 1024);
  const backMoldRaw = useMoldTextures(design.back, 1024);
  const frontMold = cd ? null : frontMoldRaw;
  const backMold = cd ? null : backMoldRaw;

  // molded artwork is the same plastic as the shell — only the bevel walls
  // catch light, so the shape reads as formed rather than printed
  const moldStyle = useMemo(() => {
    const objs = [...design.front, ...design.back].filter((o) => o.mold);
    const fill = objs[0]?.moldFill ?? "shell";
    const custom = objs[0]?.moldColor;
    const color = fill === "custom" && custom ? custom : design.color;
    const opacity = fill === "clear" ? 0.35 : fill === "custom" ? 0.9 : Math.min(1, 0.45 + design.opacity * 0.5);
    return { color, opacity };
  }, [design.front, design.back, design.color, design.opacity]);

  const makeMoldMaterial = (m: { normal: THREE.Texture; alpha: THREE.Texture } | null) =>
    m
      ? new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(moldStyle.color),
          roughness: Math.max(0.04, design.roughness * 0.5),
          metalness: 0,
          transmission: 0.85,
          thickness: 0.25,
          ior: 1.45,
          clearcoat: 1,
          clearcoatRoughness: 0.04,
          normalMap: m.normal,
          normalScale: new THREE.Vector2(1.6, 1.6),
          alphaMap: m.alpha,
          transparent: true,
          opacity: moldStyle.opacity,
          envMapIntensity: 1.8,
          depthWrite: false,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        })
      : null;

  const frontMoldMat = useMemo(
    () => makeMoldMaterial(frontMold),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frontMold, moldStyle.color, moldStyle.opacity, design.roughness],
  );
  const backMoldMat = useMemo(
    () => makeMoldMaterial(backMold),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backMold, moldStyle.color, moldStyle.opacity, design.roughness],
  );



  const metal = design.metalness ?? 0;
  const material = useMemo(() => {
    // metal blocks light: the more metallic, the less see-through the shell
    const solid = Math.max(0, Math.min(1, (design.opacity - 0.1) / 0.9));
    const transmission = cd ? 0 : Math.max(0, (1 - metal) * (1 - solid * 0.85));
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cd ? "#ffffff" : design.color),
      roughness: cd ? 0.03 : design.roughness,
      metalness: cd ? 0 : metal,
      transmission,
      thickness: 0.5,
      ior: cd ? 1.58 : 1.45,
      clearcoat: 0.6 + metal * 0.4,
      clearcoatRoughness: Math.max(0.02, design.roughness * 0.4),
      envMapIntensity: 1 + metal * 1.4,
      transparent: true,
      opacity: cd ? 0.18 : Math.max(design.opacity, metal * 0.9),
      side: THREE.DoubleSide,
    });
  }, [design.color, design.roughness, design.opacity, metal, cd]);

  // CD reflective data layer
  const holoEnvRef = useRef<THREE.Texture | null>(null);
  const backKind = design.cdBackStyle ?? "silver";
  const cdBackTint = backKind === "black" ? null : cdBackColor(design);
  const cdBackMat = useMemo(() => (cd ? createCdBackMaterial({ inner: CD_INNER }) : null), [cd]);
  useEffect(() => {
    if (!cdBackMat) return;
    cdBackMat.uniforms["uTint"]!.value.set(cdBackTint ?? "#ffffff");
    cdBackMat.uniforms["uDark"]!.value = backKind === "black" ? 1 : 0;
    setCdLights(cdBackMat, design.lights ?? []);
  }, [cdBackMat, cdBackTint, backKind, design.lights]);

  const metalMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(design.shutterColor ?? "#d7dce0"),
        metalness: design.shutterMetalness ?? 1,
        roughness: design.shutterRoughness ?? 0.18,
        clearcoat: 0.35 + (1 - (design.shutterMetalness ?? 1)) * 0.6,
        clearcoatRoughness: 0.12,
        envMapIntensity: 1 + (design.shutterMetalness ?? 1),
        side: THREE.DoubleSide,
      }),
    [design.shutterColor, design.shutterMetalness, design.shutterRoughness],
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

  // procedural studio environment used by the foil shader's reflections
  const holoEnv = useMemo(() => studioEnvTexture(), []);
  holoEnvRef.current = holoEnv;
  useEffect(() => () => holoEnv.dispose(), [holoEnv]);

  const frontHoloMat = useMemo(
    () => (frontHoloTex ? createHoloMaterial({ map: frontHoloTex, env: holoEnv }) : null),
    [frontHoloTex, holoEnv],
  );
  const backHoloMat = useMemo(
    () => (backHoloTex ? createHoloMaterial({ map: backHoloTex, env: holoEnv }) : null),
    [backHoloTex, holoEnv],
  );

  // keep the foil look in sync with the user's settings
  useEffect(() => {
    for (const m of [frontHoloMat, backHoloMat]) {
      if (!m) continue;
      m.uniforms['uHolo']!.value = design.holoIntensity ?? 0.85;
      m.uniforms['uBands']!.value = design.holoBands ?? 10;
      m.uniforms['uGrain']!.value = design.holoGrain ?? 0.25;
      m.uniforms['uPattern']!.value = holoPatternIndex[design.holoPattern ?? "linear"];
      m.uniforms['uOverlay']!.value = holoOverlayIndex[design.holoOverlay ?? "triangles"];
    }
  }, [
    frontHoloMat,
    backHoloMat,
    design.holoIntensity,
    design.holoBands,
    design.holoGrain,
    design.holoPattern,
    design.holoOverlay,
  ]);

  const clearPlasticMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#ffffff"),
        metalness: 0,
        roughness: 0.02,
        transmission: 1,
        thickness: 0.05,
        ior: 1.58,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const variant = design.modelVariant ?? "v1";
  const ps1 = (design.mediaType ?? "floppy") === "ps1";

  useEffect(() => {
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // remember the material the 3D file shipped with
      if (!mesh.userData["origMat"]) mesh.userData["origMat"] = mesh.material;
      const orig = mesh.userData["origMat"] as THREE.Material;
      const mat = (orig?.name ?? "").toLowerCase();
      const name = mesh.name.toLowerCase();
      mesh.visible = true;
      if (ps1) {
        // plastic casing follows the shell colour/see-through controls
        mesh.material = name.includes("cube") || mat.includes("004") ? material : orig;
      } else if (cd) {
        // one optical disc (front print + data side) is drawn by OpticalDisc;
        // the model only contributes its clear polycarbonate, so there is
        // never a second disc face fighting the first
        if (variant === "v1") {
          mesh.visible = false;
        } else if (variant === "v2") {
          mesh.material = clearPlasticMaterial;
        } else if (mat.includes("clearplastic")) {
          mesh.material = clearPlasticMaterial;
        } else {
          mesh.visible = false;
        }
      } else if (mat.includes("metal") || mat === "ring" || name.includes("shutter")) {
        mesh.material = metalMaterial;
      } else if (mat.includes("sticker") || mat === "sony" || mat.startsWith("material.")) {
        mesh.material = orig;
      } else if (name.includes("magnetic_disk") || name.includes("magnetic disk")) {
        mesh.material = opticalDiscMaterial;
      } else {
        mesh.material = material;
      }
    });
  }, [object, material, metalMaterial, opticalDiscMaterial, clearPlasticMaterial, cd, ps1, variant]);

  // pointer gestures (drag to spin, pinch / wheel to zoom)
  useEffect(() => {
    if (!interactive) return;
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTap = 0;
    const active = new Map<number, { x: number; y: number }>();
    let pinchStart = 0;
    let pinchZoom = 1;

    const twoFingerDist = () => {
      const [a, b] = [...active.values()];
      return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    };

    const down = (e: PointerEvent) => {
      active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2) {
        pinchStart = twoFingerDist();
        pinchZoom = zoom.current;
        dragging = false;
        return;
      }
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      const now = performance.now();
      if (now - lastTap < 320) onDoubleTap?.();
      lastTap = now;
    };
    const move = (e: PointerEvent) => {
      if (active.has(e.pointerId)) active.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (active.size === 2 && pinchStart > 0) {
        const d = twoFingerDist();
        if (d > 0) zoom.current = Math.max(0.6, Math.min(4, (pinchZoom * d) / pinchStart));
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!lockY) spin.current.vy = dx * 0.005;
      if (!lockX) spin.current.vx = dy * 0.005;
    };
    const up = (e: PointerEvent) => {
      active.delete(e.pointerId);
      if (active.size < 2) pinchStart = 0;
      dragging = false;
    };
    const wheel = (e: WheelEvent) => {
      if (!allowZoom) return;
      e.preventDefault();
      zoom.current = Math.max(0.6, Math.min(4, zoom.current * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [gl, lockX, lockY, onDoubleTap, interactive, allowZoom]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = (cam.fov * Math.PI) / 180;
    const fit = Math.max(faceH / (2 * Math.tan(vFov / 2)), faceW / (2 * Math.tan(vFov / 2) * cam.aspect));
    const g = group.current;
    if (!g) return;
    const s = spin.current;
    const z = allowZoom ? zoom.current : 1;
    if (flat) {
      s.vx = 0;
      s.vy = 0;
      const ty = Math.round(s.y / (Math.PI * 2)) * Math.PI * 2;
      s.x += (0 - s.x) * Math.min(1, dt * 6);
      s.y += (ty - s.y) * Math.min(1, dt * 6);
      camera.position.lerp(new THREE.Vector3(0, 0, (fit * 1.15) / z), Math.min(1, dt * 4));
    } else {
      s.x += s.vx;
      s.y += s.vy;
      const damp = Math.exp(-4 * dt);
      s.vx *= damp;
      s.vy *= damp;
      if (design.autoRotate && Math.abs(s.vy) < 0.0008) s.y += design.autoRotateSpeed * dt;
      camera.position.lerp(new THREE.Vector3(0, 0, (fit * (cd ? 1.0 : 1.5)) / z), Math.min(1, dt * 3));
    }

    g.rotation.x = s.x;
    g.rotation.y = s.y;
    camera.lookAt(0, 0, 0);
    // the foil's rainbow is view-dependent: feed it the live camera position
    if (frontHoloMat) frontHoloMat.uniforms['uCamPos']!.value.copy(camera.position);
    if (backHoloMat) backHoloMat.uniforms['uCamPos']!.value.copy(camera.position);
    if (cdBackMat) cdBackMat.uniforms['uCamPos']!.value.copy(camera.position);
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
            <planeGeometry args={[faceW, faceH]} />
            <meshStandardMaterial
              map={frontTex}
              transparent
              roughness={0.6}
              metalness={0}
              envMapIntensity={0.25}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {frontHoloMat && (
          <mesh
            position={[0, 0, frontSurface + surfaceGap * 3]}
            material={frontHoloMat}
            renderOrder={20}
          >
            <planeGeometry args={[faceW, faceH]} />
          </mesh>
        )}
        {cd && cdBackMat && (
          <mesh position={[0, 0, backSurface - surfaceGap * 0.5]} rotation={[0, Math.PI, 0]} material={cdBackMat}>
            <planeGeometry args={[faceW, faceH]} />
          </mesh>
        )}
        {cd && (design.cdFrontOpacity ?? 0) > 0 && (
          <mesh position={[0, 0, frontSurface + surfaceGap * 0.5]} renderOrder={5}>
            <ringGeometry args={[(faceW / 2) * CD_INNER, (faceW / 2) * CD_OUTER, 128]} />
            <meshPhysicalMaterial
              color={design.cdFrontColor ?? "#e8e8e8"}
              metalness={design.cdFrontMetalness ?? 0}
              roughness={design.cdFrontRoughness ?? 0.35}
              clearcoat={1}
              clearcoatRoughness={0.05}
              transparent
              opacity={design.cdFrontOpacity ?? 1}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {backTex && !cd && (
          <mesh position={[0, 0, backSurface - surfaceGap]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[faceW, faceH]} />
            <meshStandardMaterial
              map={backTex}
              transparent
              roughness={0.6}
              metalness={0}
              envMapIntensity={0.25}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        )}
        {backHoloMat && (
          <mesh
            position={[0, 0, backSurface - surfaceGap * 3]}
            rotation={[0, Math.PI, 0]}
            material={backHoloMat}
            renderOrder={20}
          >
            <planeGeometry args={[faceW, faceH]} />
          </mesh>
        )}
        {frontMoldMat && (
          <mesh
            position={[0, 0, frontSurface + surfaceGap * 0.5]}
            material={frontMoldMat}
            renderOrder={12}
          >
            <planeGeometry args={[faceW, faceH]} />
          </mesh>
        )}
        {backMoldMat && (
          <mesh
            position={[0, 0, backSurface - surfaceGap * 0.5]}
            rotation={[0, Math.PI, 0]}
            material={backMoldMat}
            renderOrder={12}
          >
            <planeGeometry args={[faceW, faceH]} />
          </mesh>
        )}
      </group>
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
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 4, 5]} intensity={1.8} />
      <directionalLight position={[-4, -2, -3]} intensity={0.8} />
      {/* soft gel washes: weak, far away, coming from the direction each dot was placed */}
      {(props.design.lights ?? []).map((l) => (
        <hemisphereLight
          key={l.id}
          position={[l.x * 10, -l.y * 10, 6]}
          color={l.color}
          groundColor="#000000"
          intensity={l.intensity * 0.9}
        />
      ))}
      <BackgroundImage url={props.design.bgImage} />
      <Suspense fallback={null}>
        <ErrorGuard onError={() => setFailed(true)}>
          <Floppy {...props} />
          <Environment resolution={256} key={JSON.stringify(props.design.lights ?? [])}>
            <Lightformer intensity={3} position={[0, 4, 2]} scale={[8, 8, 1]} />
            <Lightformer intensity={1.8} color="#dfe6ee" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[16, 3, 1]} />
            <Lightformer intensity={1.8} color="#ffffff" position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[16, 3, 1]} />
            {/* huge, dim, off-screen gel panels — reflect as smooth colour falloff, never a hotspot */}
            {(props.design.lights ?? []).map((l) => (
              <Lightformer
                key={l.id}
                intensity={l.intensity * 0.6}
                color={l.color}
                position={[l.x * 9, -l.y * 9, 3 - Math.hypot(l.x, l.y) * 2]}
                scale={[14, 14, 1]}
                target={[0, 0, 0]}
              />
            ))}
            {(props.design.lights ?? []).map((l) => (
              <Lightformer
                key={`${l.id}-wash`}
                intensity={l.intensity * 0.35}
                color={l.color}
                position={[l.x * 12, -l.y * 12, -2]}
                scale={[20, 20, 1]}
                target={[0, 0, 0]}
              />
            ))}
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
