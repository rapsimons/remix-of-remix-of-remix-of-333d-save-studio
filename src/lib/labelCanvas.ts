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
  // the plastic itself stays clear — only the bevel walls catch light
  const bodyAlpha = fill === "clear" ? 0.03 : fill === "custom" ? 0.5 : Math.min(0.16, 0.05 + shell.opacity * 0.14);

  ctx.drawImage(tintedMask(img, width, height, "#05070a", 0.55 * (0.5 + depth)), x + sh, y + sh, width, height);
  ctx.drawImage(tintedMask(img, width, height, "#ffffff", 0.6 * (0.5 + depth)), x + hi, y + hi, width, height);
  ctx.drawImage(tintedMask(img, width, height, bodyColor, bodyAlpha), x, y, width, height);

}

/** draw one pass of an object's text at an offset in a flat colour */
function paintText(
  ctx: CanvasRenderingContext2D,
  o: LabelObject,
  h: number,
  color: string,
  alpha: number,
  dx: number,
  dy: number,
) {
  const text = o.text ?? "";
  const fs = (o.fontSize ?? 0.08) * h;
  ctx.save();
  ctx.globalAlpha = (ctx.globalAlpha || 1) * alpha;
  ctx.font = `${fs}px ${o.fontFamily ? `"${o.fontFamily}", ` : ""}ui-monospace, monospace`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  const tracking = (o.tracking ?? 0) * fs;
  if (tracking) {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width + tracking);
    const total = widths.reduce((a, b) => a + b, 0) - tracking;
    let x = -total / 2 + dx;
    ctx.textAlign = "left";
    chars.forEach((c, i) => {
      ctx.fillText(c, x, dy);
      x += widths[i] ?? 0;
    });
  } else {
    ctx.textAlign = "center";
    ctx.fillText(text, dx, dy);
  }
  ctx.restore();
}

/** draw text as if molded into the plastic shell */
function drawMoldedText(ctx: CanvasRenderingContext2D, o: LabelObject, h: number, shell: ShellStyle) {
  const depth = o.moldDepth ?? 0.5;
  const fs = (o.fontSize ?? 0.08) * h;
  const d = Math.max(1, fs * 0.05 * (0.35 + depth));
  const raised = o.mold === "emboss";
  const hi = raised ? -d : d;
  const sh = raised ? d : -d;
  const fill = o.moldFill ?? "shell";
  const bodyColor = fill === "custom" ? o.moldColor ?? shell.color : shell.color;
  const bodyAlpha = fill === "clear" ? 0.03 : fill === "custom" ? 0.5 : Math.min(0.16, 0.05 + shell.opacity * 0.14);
  paintText(ctx, o, h, "#05070a", 0.55 * (0.5 + depth), sh, sh);
  paintText(ctx, o, h, "#ffffff", 0.6 * (0.5 + depth), hi, hi);
  paintText(ctx, o, h, bodyColor, bodyAlpha, 0, 0);
}

export type LabelFilter = "all" | "holo" | "base" | "mold";

function matches(o: LabelObject, filter: LabelFilter) {
  if (filter === "all") return true;
  const isMold = !!o.mold;
  if (filter === "mold") return isMold;
  if (isMold) return false;
  const isHolo = o.type === "image" && o.stickerKind === "holo";
  return filter === "holo" ? isHolo : !isHolo;
}

/**
 * Build the depth maps for everything molded into the shell.
 * Returns a tangent-space normal map (the bevel walls) plus a mask whose
 * strength follows the slope, so flat areas stay fully clear plastic.
 */
export async function renderMoldMaps(
  objects: LabelObject[],
  size = 1024,
): Promise<{ normal: HTMLCanvasElement; alpha: HTMLCanvasElement } | null> {
  const w = size;
  const h = Math.round(size / LABEL_ASPECT);
  const height = document.createElement("canvas");
  height.width = w;
  height.height = h;
  const g = height.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, w, h);

  let any = false;
  for (const o of objects) {
    if (!o.mold) continue;
    const depth = o.moldDepth ?? 0.5;
    const blur = Math.max(1, size * 0.0035 * (0.4 + depth));
    const tone = o.mold === "emboss" ? "#ffffff" : "#000000";
    g.save();
    g.translate(o.x * w, o.y * h);
    g.rotate(((o.rot || 0) * Math.PI) / 180);
    g.filter = `blur(${blur}px)`;
    if (o.type === "image" && o.src) {
      try {
        const img = await loadImage(o.src);
        const iw = o.w * w;
        const ih = iw / (o.aspect || img.width / img.height || 1);
        g.drawImage(tintedMask(img, iw, ih, tone, 1), -iw / 2, -ih / 2, iw, ih);
        any = true;
      } catch {
        /* skip */
      }
    } else if (o.type === "text" && o.text) {
      paintText(g, o, h, tone, 1, 0, 0);
      any = true;
    }
    g.restore();
  }
  if (!any) return null;

  const src = g.getImageData(0, 0, w, h).data;
  const normal = document.createElement("canvas");
  normal.width = w;
  normal.height = h;
  const alpha = document.createElement("canvas");
  alpha.width = w;
  alpha.height = h;
  const nCtx = normal.getContext("2d")!;
  const aCtx = alpha.getContext("2d")!;
  const nImg = nCtx.createImageData(w, h);
  const aImg = aCtx.createImageData(w, h);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    return src[(cy * w + cx) * 4]! / 255;
  };
  const strength = 6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const gx = at(x + 1, y) - at(x - 1, y);
      const gy = at(x, y + 1) - at(x, y - 1);
      const nx = -gx * strength;
      const ny = gy * strength;
      const len = Math.hypot(nx, ny, 1);
      nImg.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nImg.data[i + 3] = 255;
      const slope = Math.min(1, Math.hypot(gx, gy) * 10);
      const inside = Math.min(1, Math.abs(at(x, y) - 0.5) * 2);
      const a = Math.min(1, slope * 0.95 + inside * 0.12);
      nImg.data[i + 3] = 255;
      aImg.data[i] = a * 255;
      aImg.data[i + 1] = a * 255;
      aImg.data[i + 2] = a * 255;
      aImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  aCtx.putImageData(aImg, 0, 0);
  return { normal, alpha };
}


export type Donut = { outer: number; inner: number };

export async function renderLabel(
  objects: LabelObject[],
  size = 1024,
  filter: LabelFilter = "all",
  shell: ShellStyle = { color: "#2f6fd0", opacity: 0.55 },
  aspect: number = LABEL_ASPECT,
  donut?: Donut,
): Promise<HTMLCanvasElement> {
  const w = size;
  const h = Math.round(size / aspect);
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
      if (o.mold) {
        drawMoldedText(ctx, o, h, shell);
      } else {
        paintText(ctx, o, h, o.color || "#111111", 1, 0, 0);
      }
    }
    ctx.restore();
  }

  if (donut) {
    // clip everything to the printable ring: outside the rim and inside the hub vanish
    const r = Math.min(w, h) / 2;
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r * donut.outer, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, r * donut.inner, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
  }
  return canvas;
}


