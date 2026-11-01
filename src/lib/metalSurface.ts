import * as THREE from "three";

let brushedTexture: THREE.DataTexture | undefined;

/** Seamless directional micro-grooves; shared by all shutter and hub materials. */
export function brushedMetalNormal() {
  if (brushedTexture) return brushedTexture;
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const slope = Math.sin(y * Math.PI * 2 * 37 / size) * 0.32
      + Math.sin(y * Math.PI * 2 * 79 / size) * 0.12;
    const normal = new THREE.Vector3(0, slope, 1).normalize();
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      pixels[i] = 128;
      pixels[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      pixels[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      pixels[i + 3] = 255;
    }
  }
  brushedTexture = new THREE.DataTexture(pixels, size, size);
  brushedTexture.wrapS = brushedTexture.wrapT = THREE.RepeatWrapping;
  brushedTexture.repeat.set(4, 4);
  brushedTexture.needsUpdate = true;
  return brushedTexture;
}

export function metalFinish(brushed = 0.3, iridescence = 0) {
  return {
    normalMap: brushedMetalNormal(),
    normalScale: new THREE.Vector2(brushed * 0.35, brushed * 0.35),
    anisotropy: brushed * 0.8,
    anisotropyRotation: Math.PI / 2,
    iridescence,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400] as [number, number],
  };
}