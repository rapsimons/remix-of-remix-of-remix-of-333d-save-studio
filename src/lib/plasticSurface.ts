import * as THREE from "three";

let grainTexture: THREE.CanvasTexture | null = null;

/** Fine, repeatable injection-mould stipple; data stays in linear colour space. */
export function plasticGrainNormal() {
  if (grainTexture || typeof document === "undefined") return grainTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const height = new Float32Array(size * size);
  let seed = 1977;
  for (let i = 0; i < height.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    height[i] = seed / 4294967296;
  }
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  const smooth = (x: number, y: number) => (at(x, y) * 4 + at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 8;
  const image = ctx.createImageData(size, size);
  const normal = new THREE.Vector3();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    normal.set(smooth(x - 1, y) - smooth(x + 1, y), smooth(x, y - 1) - smooth(x, y + 1), 1).normalize();
    const offset = (y * size + x) * 4;
    image.data[offset] = (normal.x * 0.5 + 0.5) * 255;
    image.data[offset + 1] = (normal.y * 0.5 + 0.5) * 255;
    image.data[offset + 2] = (normal.z * 0.5 + 0.5) * 255;
    image.data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  grainTexture = new THREE.CanvasTexture(canvas);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.repeat.set(36, 36);
  return grainTexture;
}