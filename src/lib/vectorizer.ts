/**
 * Client-side bitmap -> SVG tracer.
 * Thresholds an image into a binary mask, walks the contours with marching
 * squares, simplifies them, and emits a single evenodd path. Used for the
 * deboss / emboss plastic molding feature.
 */

export type TraceSettings = {
  /** 0..1 luminance cut-off */
  threshold: number;
  /** flip which side of the cut-off becomes solid */
  invert: boolean;
  /** 0..4 px tolerance for contour simplification */
  simplify: number;
  /** longest edge of the sampling grid */
  detail: number;
};

export const defaultTrace: TraceSettings = {
  threshold: 0.55,
  invert: false,
  simplify: 1,
  detail: 260,
};

type Pt = { x: number; y: number };

function sampleMask(img: HTMLImageElement, s: TraceSettings) {
  const long = Math.max(img.width, img.height) || 1;
  const k = Math.min(1, s.detail / long);
  const w = Math.max(8, Math.round(img.width * k));
  const h = Math.max(8, Math.round(img.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  // 1px transparent border so shapes touching the edge still close
  const gw = w + 2;
  const gh = h + 2;
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3]! / 255;
      const lum = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255;
      // transparent pixels are never solid; otherwise dark pixels are solid
      const solid = a > 0.35 && (s.invert ? lum > s.threshold : lum < s.threshold);
      grid[(y + 1) * gw + (x + 1)] = solid ? 1 : 0;
    }
  }
  return { grid, gw, gh };
}

const key = (p: Pt) => `${Math.round(p.x * 2)}:${Math.round(p.y * 2)}`;

function marchingSquares(grid: Uint8Array, gw: number, gh: number): Pt[][] {
  const segs: [Pt, Pt][] = [];
  const at = (x: number, y: number) => grid[y * gw + x]!;
  for (let y = 0; y < gh - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      const code = (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1);
      if (code === 0 || code === 15) continue;
      const top = { x: x + 0.5, y };
      const right = { x: x + 1, y: y + 0.5 };
      const bottom = { x: x + 0.5, y: y + 1 };
      const left = { x, y: y + 0.5 };
      switch (code) {
        case 1:
        case 14:
          segs.push([left, bottom]);
          break;
        case 2:
        case 13:
          segs.push([bottom, right]);
          break;
        case 3:
        case 12:
          segs.push([left, right]);
          break;
        case 4:
        case 11:
          segs.push([top, right]);
          break;
        case 6:
        case 9:
          segs.push([top, bottom]);
          break;
        case 7:
        case 8:
          segs.push([left, top]);
          break;
        case 5:
          segs.push([left, top], [bottom, right]);
          break;
        case 10:
          segs.push([top, right], [left, bottom]);
          break;
        default:
          break;
      }
    }
  }

  // chain segments into closed loops
  const buckets = new Map<string, number[]>();
  segs.forEach((seg, i) => {
    for (const p of seg) {
      const k = key(p);
      const list = buckets.get(k);
      if (list) list.push(i);
      else buckets.set(k, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const loops: Pt[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const first = segs[i]![0];
    let end = segs[i]![1];
    const loop: Pt[] = [first, end];
    for (let guard = 0; guard < segs.length + 4; guard++) {
      const cand = buckets.get(key(end));
      if (!cand) break;
      const next = cand.find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next]!;
      const cont = key(a) === key(end) ? b : a;
      loop.push(cont);
      end = cont;
      if (key(cont) === key(first)) break;
    }
    if (loop.length > 6) loops.push(loop);
  }
  return loops;
}

function simplify(points: Pt[], tolerance: number): Pt[] {
  if (tolerance <= 0 || points.length < 4) return points;
  const dist = (p: Pt, a: Pt, b: Pt) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = dist(points[i]!, points[s]!, points[e]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export type TraceResult = { svg: string; dataUrl: string; aspect: number; paths: number };

/** Trace a bitmap into a single-colour SVG silhouette. */
export function traceImage(img: HTMLImageElement, settings: TraceSettings = defaultTrace): TraceResult {
  const { grid, gw, gh } = sampleMask(img, settings);
  const loops = marchingSquares(grid, gw, gh);
  const d = loops
    .map((loop) => {
      const pts = simplify(loop, settings.simplify);
      if (pts.length < 3) return "";
      return (
        `M${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("L")}Z`
      );
    })
    .filter(Boolean)
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gw - 1} ${gh - 1}" width="${gw - 1}" height="${gh - 1}">` +
    `<path d="${d}" fill="#000000" fill-rule="evenodd"/></svg>`;
  return {
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    aspect: (gw - 1) / (gh - 1),
    paths: loops.length,
  };
}
