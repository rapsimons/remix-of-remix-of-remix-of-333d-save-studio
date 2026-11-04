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
const HALF = 0.004;
// From the real PS2 card interior: board is ~1.31x wider than the contact row,
// and its top edge sits just above the contacts.

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

// chip rects in back-photo pixels: [x0, y0, x1, y1, height]
const CHIPS: [number, number, number, number, number][] = [
  [180, 687, 710, 919, 0.022], // SONY flash
  [500, 399, 635, 529, 0.018], // TERTA controller
  [372, 335, 445, 372, 0.01], // L001
  [680, 625, 735, 695, 0.01], // IC003
];

/** Memory Card V2 circuit board: traces face the front print, chips face the back. */
export type PcbFit = { w: number; l: number; x: number; y: number; chips: number };

export function McardPcb({ model, fit }: { model: THREE.Object3D; fit: PcbFit }) {
  const Z = useMemo(() => {
    const b = pinsBounds(model);
    // Pins determine depth only; their whole mesh is not the board silhouette.
    return b ? (b.min.z + b.max.z) / 2 : 0;
  }, [model]);
  const W = MCARD_PCB.W * fit.w;
  const H = MCARD_PCB.H * fit.l;
  const X = MCARD_PCB.X + fit.x;
  const Y = MCARD_PCB.Y + fit.y;
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
    const chip = new THREE.MeshStandardMaterial({ color: "#141414", roughness: 0.38, metalness: 0.05 });
    // chip tops show the printed markings from the photo
    const chipTops = CHIPS.map(([x0, y0, x1, y1]) => {
      const t = back.map?.clone();
      if (!t) return chip.clone();
      t.repeat.set((x1 - x0) / IMG_W, (y1 - y0) / IMG_H);
      t.offset.set(x0 / IMG_W, 1 - y1 / IMG_H);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.38, metalness: 0.05 });
    });
    return { front, back, chip, chipTops };
  }, []);

  return (
    <group position={[X, Y, Z]}>
      <mesh position={[0, 0, HALF]} material={mats.front} renderOrder={-1}>
        <planeGeometry args={[W, H]} />
      </mesh>
      <group position={[0, 0, -HALF]} rotation={[0, Math.PI, 0]}>
        <mesh material={mats.back} renderOrder={-1}>
          <planeGeometry args={[W, H]} />
        </mesh>
        {CHIPS.map(([x0, y0, x1, y1, d], i) => {
          const w = ((x1 - x0) / IMG_W) * W;
          const h = ((y1 - y0) / IMG_H) * H;
          const cx = ((x0 + x1) / 2 / IMG_W - 0.5) * W;
          const cy = (0.5 - (y0 + y1) / 2 / IMG_H) * H;
          const top = mats.chipTops[i] ?? mats.chip;
          return (
            <mesh
              key={i}
               position={[cx, cy, d * fit.chips / 2]}
              material={[mats.chip, mats.chip, mats.chip, mats.chip, top, mats.chip]}
            >
               <boxGeometry args={[w, h, Math.max(0.0001, d * fit.chips)]} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
