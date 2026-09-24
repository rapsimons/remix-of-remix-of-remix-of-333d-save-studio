import { useEffect, useState } from "react";
import * as THREE from "three";
import { renderLabel } from "./labelCanvas";
import type { LabelObject } from "./types";

export function useLabelTexture(objects: LabelObject[], size = 1024) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const key = JSON.stringify(objects);

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;
    renderLabel(objects, size).then((canvas) => {
      if (cancelled) return;
      created = new THREE.CanvasTexture(canvas);
      created.colorSpace = THREE.SRGBColorSpace;
      created.anisotropy = 8;
      created.needsUpdate = true;
      setTexture(created);
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size]);

  return texture;
}
