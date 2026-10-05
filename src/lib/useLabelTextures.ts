import { useEffect, useState } from "react";
import * as THREE from "three";
import { LABEL_ASPECT, renderLabel, renderMoldMaps, type Donut, type LabelFilter, type ShellStyle } from "./labelCanvas";
import type { LabelObject } from "./types";

/** Bevel normal + slope mask for artwork pressed into the plastic shell. */
export function useMoldTextures(objects: LabelObject[], size = 1024) {
  const [maps, setMaps] = useState<{ normal: THREE.CanvasTexture; alpha: THREE.CanvasTexture } | null>(null);
  const key = JSON.stringify(objects.filter((o) => o.mold));

  useEffect(() => {
    let cancelled = false;
    let created: { normal: THREE.CanvasTexture; alpha: THREE.CanvasTexture } | null = null;
    void renderMoldMaps(objects, size).then((res) => {
      if (cancelled || !res) {
        if (!cancelled) setMaps(null);
        return;
      }
      const normal = new THREE.CanvasTexture(res.normal);
      const alpha = new THREE.CanvasTexture(res.alpha);
      for (const t of [normal, alpha]) {
        t.colorSpace = THREE.NoColorSpace;
        t.anisotropy = 8;
        t.needsUpdate = true;
      }
      created = { normal, alpha };
      setMaps(created);
    });
    return () => {
      cancelled = true;
      created?.normal.dispose();
      created?.alpha.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, size]);

  return maps;
}


export function useLabelTexture(
  objects: LabelObject[],
  size = 1024,
  filter: LabelFilter = "all",
  shell: ShellStyle = { color: "#2f6fd0", opacity: 0.55 },
  aspect: number = LABEL_ASPECT,
  donut?: Donut,
) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const key = JSON.stringify(objects);
  const shellKey = `${shell.color}|${shell.opacity}`;
  const donutKey = donut ? `${donut.outer}|${donut.inner}` : "";

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;
    const [color, opacity] = shellKey.split("|");
    renderLabel(objects, size, filter, { color: color!, opacity: Number(opacity) }, aspect, donut).then((canvas) => {
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
  }, [key, size, filter, shellKey, aspect, donutKey]);

  return texture;
}

