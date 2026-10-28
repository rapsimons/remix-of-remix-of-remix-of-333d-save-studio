import * as THREE from "three";
import type { Design } from "./types";
import { renderLabel } from "./labelCanvas";

// The live three.js scene(s), registered by whichever 3D view is mounted.
let current: THREE.Object3D[] | null = null;
let currentScale = 1;
let version = 0;
export const registerExportScene = (s: THREE.Object3D | THREE.Object3D[] | null, scale = 1) => {
  current = s ? (Array.isArray(s) ? s : [s]) : null;
  currentScale = scale;
  version++;
};
/** Clear the registration only if it still belongs to this view (avoids swap races). */
export const unregisterExportScene = (s: THREE.Object3D) => {
  if (current?.includes(s)) {
    current = null;
    version++;
  }
};
export const hasExportScene = () => !!current;
export const exportSceneVersion = () => version;

const MAX_TEX = 2048;

type Img = CanvasImageSource & { width?: number; height?: number; videoWidth?: number };

/** Copy a texture onto a plain canvas so GLTFExporter can always encode it. */
function safeTexture(t: unknown, cache: Map<string, THREE.Texture | null>): THREE.Texture | null {
  const tex = t as THREE.Texture | undefined;
  if (!tex?.isTexture) return null;
  if (cache.has(tex.uuid)) return cache.get(tex.uuid)!;
  let out: THREE.Texture | null = null;
  try {
    const img = tex.image as Img | undefined;
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    const drawable =
      img &&
      w > 0 &&
      h > 0 &&
      !(tex as THREE.DataTexture).isDataTexture &&
      !(tex as THREE.CubeTexture).isCubeTexture &&
      !(tex as unknown as { isRenderTargetTexture?: boolean }).isRenderTargetTexture &&
      (img instanceof HTMLImageElement ||
        img instanceof HTMLCanvasElement ||
        (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) ||
        (typeof OffscreenCanvas !== "undefined" && img instanceof OffscreenCanvas));
    if (drawable) {
      const k = Math.min(1, MAX_TEX / Math.max(w, h));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      out = tex.clone();
      out.source = new THREE.Source(c);
      out.needsUpdate = true;
    }
  } catch {
    out = null;
  }
  cache.set(tex.uuid, out);
  return out;
}

const pick = (mat: THREE.Material, key: string) => (mat as unknown as Record<string, unknown>)[key];

/** Turn any runtime material (custom shaders, liquid glass…) into a plain glTF PBR one. */
function convertMaterial(mat: THREE.Material, cache: Map<string, THREE.Texture | null>): THREE.Material {
  const u = (mat as THREE.ShaderMaterial).uniforms;
  const isShader = !!(mat as THREE.ShaderMaterial).isShaderMaterial;
  const color = (pick(mat, "color") as THREE.Color | undefined) ?? (u?.["uTint"]?.value as THREE.Color | undefined);
  const out = new THREE.MeshPhysicalMaterial({
    name: mat.name || (isShader ? "disc" : "material"),
    color: color instanceof THREE.Color ? color.clone() : new THREE.Color("#d8dde4"),
    side: mat.side,
    transparent: mat.transparent,
    opacity: mat.opacity,
    alphaTest: mat.alphaTest,
  });
  if (isShader) {
    // diffraction disc → mirror metal with iridescence
    out.map = safeTexture(u?.["uMap"]?.value ?? u?.["map"]?.value ?? u?.["uArt"]?.value, cache);
    out.metalness = 1;
    out.roughness = 0.15;
    out.iridescence = 1;
    out.iridescenceIOR = 1.8;
    return out;
  }
  const num = (k: string, d: number) => (typeof pick(mat, k) === "number" ? (pick(mat, k) as number) : d);
  out.metalness = num("metalness", 0);
  out.roughness = num("roughness", 0.5);
  out.clearcoat = num("clearcoat", 0);
  out.clearcoatRoughness = num("clearcoatRoughness", 0);
  out.iridescence = num("iridescence", 0);
  out.emissive.copy((pick(mat, "emissive") as THREE.Color | undefined) ?? new THREE.Color(0));
  for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "alphaMap", "emissiveMap", "aoMap"] as const) {
    const t = safeTexture(pick(mat, k), cache);
    if (t) (out as unknown as Record<string, THREE.Texture>)[k] = t;
  }
  if (mat.userData?.["liquidGlass"] || num("transmission", 0) > 0) {
    // clear plastic: glTF transmission keeps it see-through in other apps
    out.transmission = 1;
    out.ior = 1.5;
    out.thickness = 0.002;
    out.roughness = Math.min(out.roughness, 0.1);
  }
  return out;
}

/** Fresh, flat copy of just the model meshes (no backgrounds, helpers or render targets). */
function exportableClone(roots: THREE.Object3D[], scale: number) {
  const root = new THREE.Group();
  root.name = "model";
  const cache = new Map<string, THREE.Texture | null>();
  const matCache = new Map<string, THREE.Material>();
  const conv = (m: THREE.Material) => {
    let c = matCache.get(m.uuid);
    if (!c) matCache.set(m.uuid, (c = convertMaterial(m, cache)));
    return c;
  };
  const scaleM = new THREE.Matrix4().makeScale(scale, scale, scale);
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (o as THREE.LineSegments).isLine || (o as THREE.Points).isPoints) return;
      // skip invisible branches and helpers
      let p: THREE.Object3D | null = o;
      while (p) {
        if (!p.visible || p.userData?.["noExport"]) return;
        p = p.parent;
      }
      const g = m.geometry as THREE.BufferGeometry | undefined;
      if (!g?.attributes?.["position"]?.count) return;
      const copy = new THREE.Mesh(g, Array.isArray(m.material) ? m.material.map(conv) : conv(m.material));
      copy.name = m.name || m.parent?.name || "part";
      copy.applyMatrix4(new THREE.Matrix4().multiplyMatrices(scaleM, m.matrixWorld));
      root.add(copy);
    });
  }
  return root;
}

const canvasBlob = (c: HTMLCanvasElement) => new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(msg)), ms);
    p.then((v) => (clearTimeout(t), res(v)), (e) => (clearTimeout(t), rej(e)));
  });
}

export async function export3dZip(design: Design): Promise<Blob> {
  console.warn("EXP start", performance.now());
  if (!current) throw new Error("Open the 3D view first");
  const [{ GLTFExporter }, { default: JSZip }] = await Promise.all([
    import("three/examples/jsm/exporters/GLTFExporter.js"),
    import("jszip"),
  ]);
  // the model may still be loading right after the 3D view opens
  let root = exportableClone(current, currentScale);
  for (let t = 0; !root.children.length && t < 40 && current; t++) {
    await new Promise((r) => setTimeout(r, 200));
    root = exportableClone(current, currentScale);
  }
  if (!root.children.length) throw new Error("Nothing to export");
  console.warn("EXP clone", root.children.length, performance.now());
  const glb = (await withTimeout(
    new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: MAX_TEX }),
    60_000,
    "Export timed out",
  )) as ArrayBuffer;

  console.warn("EXP glb", glb.byteLength, performance.now());
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
        const img = t.image as HTMLCanvasElement | undefined;
        if (!(img instanceof HTMLCanvasElement)) continue;
        seen.add(t.uuid);
        tex.file(`${String(++i).padStart(2, "0")}-${(m.name || "mesh").replace(/\W+/g, "_")}-${k}.png`, canvasBlob(img));
      }
    });
  });
  console.warn("EXP tex", performance.now());
  zip.file(
    "design_metadata.json",
    JSON.stringify({ exportedAt: new Date().toISOString(), design: { ...design, front: undefined, back: undefined, bgImage: undefined } }, null, 2),
  );
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
