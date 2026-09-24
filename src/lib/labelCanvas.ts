import type { LabelObject } from "./types";

const imgCache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgCache.get(src);
  if (cached && cached.complete) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/** Aspect ratio of the label face: 3.5" floppy is 90 x 94 mm */
export const LABEL_ASPECT = 90 / 94;

export async function renderLabel(
  objects: LabelObject[],
  size = 1024,
): Promise<HTMLCanvasElement> {
  const w = size;
  const h = Math.round(size / LABEL_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  for (const o of objects) {
    ctx.save();
    ctx.globalAlpha = o.opacity ?? 1;
    ctx.translate(o.x * w, o.y * h);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    if (o.type === "image" && o.src) {
      try {
        const img = await loadImage(o.src);
        const iw = o.w * w;
        const ih = iw / (o.aspect || img.width / img.height || 1);
        ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      } catch {
        /* skip */
      }
    } else if (o.type === "text" && o.text) {
      const fs = (o.fontSize ?? 0.08) * h;
      ctx.font = `${fs}px ${o.fontFamily ? `"${o.fontFamily}", ` : ""}ui-monospace, monospace`;
      ctx.fillStyle = o.color || "#111111";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tracking = (o.tracking ?? 0) * fs;
      if (tracking) {
        const chars = [...o.text];
        const widths = chars.map((c) => ctx.measureText(c).width + tracking);
        const total = widths.reduce((a, b) => a + b, 0) - tracking;
        let x = -total / 2;
        ctx.textAlign = "left";
        chars.forEach((c, i) => {
          ctx.fillText(c, x, 0);
          x += widths[i] ?? 0;
        });
      } else {
        ctx.fillText(o.text, 0, 0);
      }
    }
    ctx.restore();
  }
  return canvas;
}
