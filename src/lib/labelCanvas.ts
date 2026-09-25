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

function drawStyledImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  o: LabelObject,
  width: number,
  height: number,
) {
  const x = -width / 2;
  const y = -height / 2;
  if (o.stickerKind !== "paper") {
    ctx.drawImage(img, x, y, width, height);
    return;
  }

  const layer = document.createElement("canvas");
  layer.width = Math.max(1, Math.round(width));
  layer.height = Math.max(1, Math.round(height));
  const layerCtx = layer.getContext("2d");
  if (!layerCtx) return;
  layerCtx.filter = `hue-rotate(${o.hue ?? 0}deg)`;
  layerCtx.drawImage(img, 0, 0, layer.width, layer.height);
  layerCtx.filter = "none";

  if (o.tintMode && o.tintMode !== "original") {
    layerCtx.globalCompositeOperation = "source-atop";
    if (o.tintMode === "gradient") {
      const angle = ((o.gradientAngle ?? 90) * Math.PI) / 180;
      const cx = layer.width / 2;
      const cy = layer.height / 2;
      const radius = Math.abs(layer.width * Math.cos(angle)) / 2 + Math.abs(layer.height * Math.sin(angle)) / 2;
      const gradient = layerCtx.createLinearGradient(
        cx - Math.cos(angle) * radius,
        cy - Math.sin(angle) * radius,
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
      );
      gradient.addColorStop(0, o.tintColor ?? "#d9b86c");
      gradient.addColorStop(1, o.gradientColor ?? "#e7e0cc");
      layerCtx.fillStyle = gradient;
    } else {
      layerCtx.fillStyle = o.tintColor ?? "#d9b86c";
    }
    layerCtx.globalAlpha = 0.82;
    layerCtx.fillRect(0, 0, layer.width, layer.height);
    layerCtx.globalAlpha = 0.28;
    layerCtx.globalCompositeOperation = "multiply";
    layerCtx.drawImage(img, 0, 0, layer.width, layer.height);
  }
  ctx.drawImage(layer, x, y, width, height);
}

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
        drawStyledImage(ctx, img, o, iw, ih);
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
