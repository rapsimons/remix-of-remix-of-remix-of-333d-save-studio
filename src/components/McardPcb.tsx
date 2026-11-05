import { useMemo } from "react";
import * as THREE from "three";
import { MCARD_PCB } from "@/lib/mcardInterior";
import frontUrl from "@/assets/pcb-front-final.png.asset.json";
import backUrl from "@/assets/pcb-back-final.png.asset.json";
import backNrm from "@/assets/pcb-back-normal-final.png.asset.json";
import backMetal from "@/assets/pcb-back-metalness-final.png.asset.json";
import backRough from "@/assets/pcb-back-roughness-final.png.asset.json";
import frontMetal from "@/assets/pcb-front-metalness-final.png.asset.json";

// Source photos are 850x1092; both sides share one aligned silhouette.
const IMG_W = 850;
const IMG_H = 1092;
/** default board thickness in scene units (thickness slider multiplies this) */
const BASE_THICK = 0.03;

/** Bounds of the card's built-in connector pins, in the model's parent space. */
function pinsBounds(model: THREE.Object3D): THREE.Box3 | null {
  model.updateMatrix();
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const box = new THREE.Box3();
  let found = false;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.includes("Cube_Material004")) return;
    m.geometry.computeBoundingBox();
    const bounds = m.geometry.boundingBox;
    if (!bounds) return;
    const b = bounds.clone();
    const rel = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    b.applyMatrix4(rel).applyMatrix4(model.matrix);
    box.union(b);
    found = true;
  });
  return found ? box : null;
}

// chip bodies measured on the back photo: [x0, y0, x1, y1, height].
const CHIPS: [number, number, number, number, number][] = [
  [178, 712, 612, 956, 0.022], // SONY flash
  [474, 384, 634, 546, 0.018], // TERTA controller
  [372, 335, 445, 372, 0.01], // L001
  [674, 618, 728, 676, 0.01], // IC003
];

// gold edge contacts measured on the back photo: [x0, y0, x1, y1]
export const CONTACTS: [number, number, number, number][] = [
  [127, 44, 160, 157],
  [187, 44, 218, 155],
  [316, 22, 347, 157],
  [374, 22, 407, 157],
  [434, 22, 465, 157],
  [563, 46, 594, 158],
  [622, 43, 653, 158],
  [681, 43, 712, 158],
];

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Memory Card V2 circuit board: traces face the front print, chips face the back. */
export type PcbFit = { w: number; l: number; x: number; y: number; chips: number; thick?: number };

export function McardPcb({ model, fit }: { model: THREE.Object3D; fit: PcbFit }) {
  const Z = useMemo(() => {
    const b = pinsBounds(model);
    return b ? (b.min.z + b.max.z) / 2 : 0;
  }, [model]);
  const W = MCARD_PCB.W * fit.w;
  const H = MCARD_PCB.H * fit.l;
  const X = MCARD_PCB.X + fit.x;
  const Y = MCARD_PCB.Y + fit.y;
  const T = Math.max(0.002, BASE_THICK * (fit.thick ?? 1));
  const HALF = T / 2;

  const mats = useMemo(() => {
    const l = new THREE.TextureLoader();
    const tex = (u: string, srgb = false) => {
      const t = l.load(u);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const front = new THREE.MeshStandardMaterial({
      map: tex(frontUrl.url, true),
      metalnessMap: tex(frontMetal.url),
      metalness: 1,
      roughness: 0.45,
      alphaTest: 0.5,
      envMapIntensity: 1.4,
    });
    const back = new THREE.MeshStandardMaterial({
      map: tex(backUrl.url, true),
      normalMap: tex(backNrm.url),
      normalScale: new THREE.Vector2(1.2, 1.2),
      metalnessMap: tex(backMetal.url),
      roughnessMap: tex(backRough.url),
      metalness: 1,
      roughness: 1,
      alphaTest: 0.5,
      envMapIntensity: 1.6,
    });
    // board edge: FR4 fibreglass core
    const edge = new THREE.MeshStandardMaterial({ color: "#2f5a35", roughness: 0.7, metalness: 0 });
    const gold = new THREE.MeshPhysicalMaterial({
      color: "#e8b54a", metalness: 1, roughness: 0.18, clearcoat: 0.6, envMapIntensity: 2,
    });
    const chip = new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.38, metalness: 0.05 });
    const chipTops = CHIPS.map(([x0, y0, x1, y1]) => {
      const t = back.map?.clone();
      if (!t) return chip.clone();
      t.repeat.set((x1 - x0) / IMG_W, (y1 - y0) / IMG_H);
      t.offset.set(x0 / IMG_W, 1 - y1 / IMG_H);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.38, metalness: 0.05 });
    });
    return { front, back, edge, gold, chip, chipTops };
  }, []);

  // board core: silhouette from the photo is roughly rectangular; inset so the
  // textured faces (alpha-cut) cover the core edges.
  const core = { w: W * (795 / IMG_W) * 0.995, h: H * (1064 / IMG_H) * 0.995,
    cx: ((28 + 823) / 2 / IMG_W - 0.5) * W, cy: (0.5 - (13 + 1077) / 2 / IMG_H) * H };

  const contactGeos = useMemo(() => CONTACTS.map(([x0, y0, x1, y1]) => {
    const w = ((x1 - x0) / IMG_W) * W;
    const h = ((y1 - y0) / IMG_H) * H;
    return new THREE.ShapeGeometry(roundedRect(w, h, Math.min(w, h) * 0.3), 6);
  }), [W, H]);

  return (
    <group position={[X, Y, Z]}>
      <mesh position={[core.cx, core.cy, 0]} material={mats.edge}>
        <boxGeometry args={[core.w, core.h, T * 0.98]} />
      </mesh>
      <mesh position={[0, 0, HALF]} material={mats.front} renderOrder={-1}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <group position={[0, 0, -HALF]} rotation={[0, Math.PI, 0]}>
        <mesh material={mats.back} renderOrder={-1}>
          <planeGeometry args={[W, H]} />
        </mesh>
        {CONTACTS.map(([x0, y0, x1, y1], i) => (
          <mesh key={`c${i}`} geometry={contactGeos[i]} material={mats.gold}
            position={[((x0 + x1) / 2 / IMG_W - 0.5) * W, (0.5 - (y0 + y1) / 2 / IMG_H) * H, 0.0015]} />
        ))}
        {CHIPS.map(([x0, y0, x1, y1, d], i) => {
          const w = ((x1 - x0) / IMG_W) * W;
          const h = ((y1 - y0) / IMG_H) * H;
          const cx = ((x0 + x1) / 2 / IMG_W - 0.5) * W;
          const cy = (0.5 - (y0 + y1) / 2 / IMG_H) * H;
          const top = mats.chipTops[i] ?? mats.chip;
          return (
            <mesh key={i} position={[cx, cy, (d * fit.chips) / 2]}
              material={[mats.chip, mats.chip, mats.chip, mats.chip, top, mats.chip]}>
              <boxGeometry args={[w, h, Math.max(0.0001, d * fit.chips)]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
