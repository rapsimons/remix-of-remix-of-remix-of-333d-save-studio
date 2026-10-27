import * as THREE from "three";
import type { Design } from "./types";
import { renderLabel } from "./labelCanvas";

// The live three.js scene, registered by whichever 3D view is mounted.
let current: THREE.Scene | null = null;
export const registerExportScene = (s: THREE.Scene | null) => {
  current = s;
};
export const hasExportScene = () => !!current;

/** Replace shader-only materials (disc diffraction etc.) with glTF-safe PBR equivalents. */
function exportableClone(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = "model";
  scene.children.forEach((c) => {
    if ((c as THREE.Light).isLight || (c as THREE.Camera).isCamera) return;
    root.add(c.clone(true));
  });
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const conv = (mat: THREE.Material): THREE.Material => {
      if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
        const c = mat.clone();
        c.onBeforeCompile = () => {};
        return c;
      }
      const u = (mat as THREE.ShaderMaterial).uniforms ?? {};
      const tex = (u.uMap?.value ?? u.map?.value ?? u.uArt?.value) as THREE.Texture | undefined;
      const tint = u.uTint?.value as THREE.Color | undefined;
      return new THREE.MeshPhysicalMaterial({
        name: mat.name || "disc",
        color: tint ?? new THREE.Color("#d8dde4"),
        map: tex instanceof THREE.Texture ? tex : null,
        metalness: 1,
        roughness: 0.15,
        iridescence: 1,
        iridescenceIOR: 1.8,
        transparent: mat.transparent,
        side: mat.side,
      });
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return root;
}

const canvasBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));

export async function export3dZip(design: Design): Promise<Blob> {
  if (!current) throw new Error("Open the 3D view first");
  const [{ GLTFExporter }, { default: JSZip }] = await Promise.all([
    import("three/examples/jsm/exporters/GLTFExporter.js"),
    import("jszip"),
  ]);
  const root = exportableClone(current);
  const glb = (await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: true,
    maxTextureSize: 2048,
  })) as ArrayBuffer;

  const zip = new JSZip();
  zip.file("model.glb", glb);
  const tex = zip.folder("textures")!;
  for (const side of ["front", "back"] as const) {
    try {
      tex.file(`label_${side}.png`, await canvasBlob(await renderLabel(design[side], 2048)));
    } catch {
      /* skip side that fails to render */
    }
  }
  // Every texture embedded in the model, as loose PNGs.
  const seen = new Set<string>();
  let i = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => {
      for (const [k, v] of Object.entries(mat)) {
        const t = v as THREE.Texture;
        if (!t?.isTexture || seen.has(t.uuid)) continue;
        const img = t.image as CanvasImageSource & { width?: number; height?: number };
        if (!img?.width || !img?.height) continue;
        seen.add(t.uuid);
        try {
          const c = document.createElement("canvas");
          c.width = img.width;
          c.height = img.height;
          c.getContext("2d")!.drawImage(img, 0, 0);
          tex.file(`${String(++i).padStart(2, "0")}-${(m.name || "mesh").replace(/\W+/g, "_")}-${k}.png`, canvasBlob(c));
        } catch {
          /* non-drawable texture */
        }
      }
    });
  });
  zip.file("design_metadata.json", JSON.stringify({ exportedAt: new Date().toISOString(), design: { ...design, front: undefined, back: undefined, bgImage: undefined } }, null, 2));
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
