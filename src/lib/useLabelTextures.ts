import { useEffect, useState } from "react";
import * as THREE from "three";
import { renderLabel, type LabelFilter, type ShellStyle } from "./labelCanvas";
import type { LabelObject } from "./types";

export function useLabelTexture(
  objects: LabelObject[],
  size = 1024,
  filter: LabelFilter = "all",
  shell: ShellStyle = { color: "#2f6fd0", opacity: 0.55 },
) {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);
  const key = JSON.stringify(objects);
  const shellKey = `${shell.color}|${shell.opacity}`;

  useEffect(() => {
    let cancelled = false;
    let created: THREE.CanvasTexture | null = null;
    const [color, opacity] = shellKey.split("|");
    renderLabel(objects, size, filter, { color: color!, opacity: Number(opacity) }).then((canvas) => {
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
  }, [key, size, filter, shellKey]);

  return texture;
}

