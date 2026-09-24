export type ProcessSettings = {
  removeBg: boolean;
  bgThreshold: number; // 0..100
  colors: number; // 2..32, 0 = off
  halftone: boolean;
  halftoneSize: number;
  threshold: boolean;
  thresholdLevel: number;
  distress: number; // 0..100
  invert: boolean;
  blur: number; // -100 sharpen .. 100 blur
  hue: number; // -180..180 (applied to background sticker)
  saturation: number; // 0..200
};

export const defaultProcess: ProcessSettings = {
  removeBg: false,
  bgThreshold: 30,
  colors: 0,
  halftone: false,
  halftoneSize: 6,
  threshold: false,
  thresholdLevel: 50,
  distress: 0,
  invert: false,
  blur: 0,
  hue: 0,
  saturation: 100,
};

function corners(d: Uint8ClampedArray, w: number, h: number) {
  const pts = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  let r = 0,
    g = 0,
    b = 0;
  for (const p of pts) {
    r += d[p] ?? 0;
    g += d[p + 1] ?? 0;
    b += d[p + 2] ?? 0;
  }
  return { r: r / 4, g: g / 4, b: b / 4 };
}

export function processImage(source: HTMLImageElement | HTMLCanvasElement, s: ProcessSettings): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (s.blur > 0) ctx.filter = `blur(${(s.blur / 100) * 6}px)`;
  ctx.drawImage(source, 0, 0, w, h);
  ctx.filter = "none";

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  if (s.removeBg) {
    const { r: br, g: bg, b: bb } = corners(d, w, h);
    const tol = (s.bgThreshold / 100) * 441;
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.hypot((d[i] ?? 0) - br, (d[i + 1] ?? 0) - bg, (d[i + 2] ?? 0) - bb);
      if (dist < tol) d[i + 3] = 0;
      else if (dist < tol * 1.25) d[i + 3] = Math.round((d[i + 3] ?? 0) * ((dist - tol) / (tol * 0.25)));
    }
  }

  if (s.invert) {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - (d[i] ?? 0);
      d[i + 1] = 255 - (d[i + 1] ?? 0);
      d[i + 2] = 255 - (d[i + 2] ?? 0);
    }
  }

  if (s.colors >= 2) {
    const step = 255 / (s.colors - 1);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round((d[i] ?? 0) / step) * step;
      d[i + 1] = Math.round((d[i + 1] ?? 0) / step) * step;
      d[i + 2] = Math.round((d[i + 2] ?? 0) / step) * step;
    }
  }

  if (s.threshold) {
    const lvl = (s.thresholdLevel / 100) * 255;
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0);
      const v = l > lvl ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  }

  if (s.distress > 0) {
    const amt = s.distress / 100;
    for (let i = 0; i < d.length; i += 4) {
      const n = Math.random();
      if (n < amt * 0.25) d[i + 3] = 0;
      else {
        const g = (Math.random() - 0.5) * amt * 90;
        d[i] = Math.max(0, Math.min(255, (d[i] ?? 0) + g));
        d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] ?? 0) + g));
        d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] ?? 0) + g));
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  if (s.halftone) {
    const cell = Math.max(2, s.halftoneSize);
    const src = ctx.getImageData(0, 0, w, h).data;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#000";
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        const i = (y * w + x) * 4;
        if ((src[i + 3] ?? 0) < 20) continue;
        const l = (0.299 * (src[i] ?? 0) + 0.587 * (src[i + 1] ?? 0) + 0.114 * (src[i + 2] ?? 0)) / 255;
        const r = ((1 - l) * cell) / 2;
        if (r > 0.25) {
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  if (s.blur < 0) {
    // unsharp-ish: draw sharpened via contrast of difference
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    octx.drawImage(canvas, 0, 0);
    octx.globalCompositeOperation = "overlay";
    octx.globalAlpha = Math.min(1, -s.blur / 100);
    octx.drawImage(canvas, 0, 0);
    octx.globalCompositeOperation = "source-over";
    return out;
  }

  return canvas;
}

/** Composite artwork over a sticker background with hue/sat adjustment. */
export async function compositeOnSticker(
  artwork: HTMLCanvasElement,
  background: HTMLImageElement,
  hue: number,
  saturation: number,
): Promise<HTMLCanvasElement> {
  const w = background.width;
  const h = background.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.filter = `hue-rotate(${hue}deg) saturate(${saturation}%)`;
  ctx.drawImage(background, 0, 0, w, h);
  ctx.filter = "none";
  const pad = 0.16;
  const maxW = w * (1 - pad * 2);
  const maxH = h * (1 - pad * 2);
  const scale = Math.min(maxW / artwork.width, maxH / artwork.height);
  const aw = artwork.width * scale;
  const ah = artwork.height * scale;
  ctx.drawImage(artwork, (w - aw) / 2, (h - ah) / 2, aw, ah);
  return canvas;
}

export function canvasToDataUrl(c: HTMLCanvasElement, maxSize = 700): string {
  if (c.width <= maxSize && c.height <= maxSize) return c.toDataURL("image/png");
  const scale = maxSize / Math.max(c.width, c.height);
  const out = document.createElement("canvas");
  out.width = Math.round(c.width * scale);
  out.height = Math.round(c.height * scale);
  out.getContext("2d")!.drawImage(c, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
