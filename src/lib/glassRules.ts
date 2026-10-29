// Shared by the GLSL shader and small, deterministic rule checks.
export const GLASS_EDGE_START = 0.28;
export const GLASS_EDGE_END = 0.72;

export function glassEdgeWeight(cosView: number) {
  const grazing = 1 - Math.min(1, Math.max(0, Math.abs(cosView)));
  const t = Math.min(1, Math.max(0, (grazing - GLASS_EDGE_START) / (GLASS_EDGE_END - GLASS_EDGE_START)));
  return t * t * (3 - 2 * t);
}

export function preserveSolidSample(depth: number) {
  return depth < 0.999999;
}