import * as THREE from "three";

let brushedTexture: THREE.DataTexture | undefined;

/** Seamless directional micro-grooves; shared by all shutter and hub materials. */
export function brushedMetalNormal() {
  if (brushedTexture) return brushedTexture;
  const size = 512;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Integer harmonics tile seamlessly; varied fine lines avoid coarse waves.
    const slope = Math.sin(y * Math.PI * 2 * 127 / size) * 0.2
      + Math.sin(y * Math.PI * 2 * 191 / size + 1.4) * 0.1
      + Math.sin(y * Math.PI * 2 * 73 / size + 2.1) * 0.06;
    for (let x = 0; x < size; x++) {
      const variation = 0.85 + 0.15 * Math.sin(x * Math.PI * 2 * 3 / size + y * Math.PI * 2 * 7 / size);
      const normal = new THREE.Vector3(0, slope * variation, 1).normalize();
      const i = (y * size + x) * 4;
      pixels[i] = 128;
      pixels[i + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      pixels[i + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      pixels[i + 3] = 255;
    }
  }
  brushedTexture = new THREE.DataTexture(pixels, size, size);
  brushedTexture.wrapS = brushedTexture.wrapT = THREE.RepeatWrapping;
  brushedTexture.repeat.set(1, 4);
  brushedTexture.minFilter = THREE.LinearMipmapLinearFilter;
  brushedTexture.generateMipmaps = true;
  brushedTexture.needsUpdate = true;
  return brushedTexture;
}

export function metalFinish(brushed = 0.3, iridescence = 0) {
  return {
    normalMap: brushedMetalNormal(),
    normalScale: new THREE.Vector2(brushed * 0.22, brushed * 0.22),
    anisotropy: brushed * 0.8,
    anisotropyRotation: 0,
    iridescence,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 400] as [number, number],
  };
}