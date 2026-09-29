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

/** stamp custom text / artwork on top of a sticker */
async function drawStickerContent(
  ctx: CanvasRenderingContext2D,
  o: LabelObject,
  width: number,
  height: number,
) {
  if (o.labelImage) {
    try {
      const stamp = await loadImage(o.labelImage);
      const scale = o.labelImageScale ?? 0.5;
      const sw = width * scale;
      const sh = sw / (stamp.width / stamp.height || 1);
      ctx.drawImage(stamp, -sw / 2, -sh / 2 - (o.labelText ? height * 0.12 : 0), sw, sh);
    } catch {
      /* skip */
    }
  }
  if (o.labelText) {
    const fs = (o.labelSize ?? 0.22) * height;
    ctx.font = `${fs}px ${o.labelFontFamily ? `"${o.labelFontFamily}", ` : ""}ui-monospace, monospace`;
    ctx.fillStyle = o.labelColor || "#1a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.labelText, 0, o.labelImage ? height * 0.26 : 0);
  }
}

export type ShellStyle = { color: string; opacity: number };

/** paint a silhouette in one flat colour */
function tintedMask(img: CanvasImageSource, w: number, h: number, color: string, alpha: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-in";
  g.globalAlpha = alpha;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Draw a traced silhouette as if it were molded into the plastic shell:
 * a bevel pair (shadow + highlight) offset along the light direction plus a
 * body fill that follows the disc colour.
 */
function drawMold(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  o: LabelObject,
  width: number,
  height: number,
  shell: ShellStyle,
) {
  const x = -width / 2;
  const y = -height / 2;
  const depth = o.moldDepth ?? 0.5;
  const d = Math.max(1, Math.min(width, height) * 0.02 * (0.35 + depth));
  const raised = o.mold === "emboss";
  // key light sits top-left
  const hi = raised ? -d : d;
  const sh = raised ? d : -d;

  const fill = o.moldFill ?? "shell";
  const bodyColor = fill === "custom" ? o.moldColor ?? shell.color : shell.color;
  const bodyAlpha = fill === "clear" ? 0.07 : fill === "custom" ? 0.8 : Math.min(0.55, 0.2 + shell.opacity * 0.45);

  ctx.drawImage(tintedMask(img, width, height, "#05070a", 0.55 * (0.5 + depth)), x + sh, y + sh, width, height);
  ctx.drawImage(tintedMask(img, width, height, "#ffffff", 0.6 * (0.5 + depth)), x + hi, y + hi, width, height);
  ctx.drawImage(tintedMask(img, width, height, bodyColor, bodyAlpha), x, y, width, height);
}

export type LabelFilter = "all" | "holo" | "base";

function matches(o: LabelObject, filter: LabelFilter) {
  if (filter === "all") return true;
  const isHolo = o.type === "image" && o.stickerKind === "holo" && !o.mold;
  return filter === "holo" ? isHolo : !isHolo;
}

export async function renderLabel(
  objects: LabelObject[],
  size = 1024,
  filter: LabelFilter = "all",
  shell: ShellStyle = { color: "#2f6fd0", opacity: 0.55 },
): Promise<HTMLCanvasElement> {
  const w = size;
  const h = Math.round(size / LABEL_ASPECT);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);

  for (const o of objects) {
    if (!matches(o, filter)) continue;
    ctx.save();
    ctx.globalAlpha = o.opacity ?? 1;
    ctx.translate(o.x * w, o.y * h);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    if (o.type === "image" && o.src) {
      try {
        const img = await loadImage(o.src);
        const iw = o.w * w;
        const ih = iw / (o.aspect || img.width / img.height || 1);
        if (o.mold) {
          drawMold(ctx, img, o, iw, ih, shell);
        } else {
          drawStyledImage(ctx, img, o, iw, ih);
          await drawStickerContent(ctx, o, iw, ih);
        }
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

