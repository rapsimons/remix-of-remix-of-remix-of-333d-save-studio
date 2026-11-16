/** Pure X-ray timing rules: mix 0..1 from the model's accumulated turn angle. */
export type XraySettings = { mode?: "off" | "auto" | "always" | undefined; cycle?: "half" | "full" | undefined; start?: number | undefined; hold?: number | undefined; fade?: number | undefined };

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

export const XRAY_PALETTE = {
  background: "#020208", shell: "#30216d", shellEdge: "#9291ff",
  core: "#08a6bd", coreEdge: "#54faff", hot: "#d5ffff",
};

/** Name/material classification shared by surface density and feature outlines. */
export function isXrayCore(name: string, metalness = 0, shader = false): boolean {
  return /shutter|hub|disc|disk|pcb|chip|pin|metal|contact|gold|board|cube_material004/i.test(name)
    || metalness >= 0.5 || shader;
}

export function xrayMix(turn: number, s: XraySettings): number {
  const mode = s.mode ?? "off";
  if (mode === "off") return 0;
  const hold = s.hold ?? 0.4;
  if (mode === "always" || hold >= 1) return 1;
  const period = s.cycle === "full" ? Math.PI * 2 : Math.PI;
  const fade = Math.max(0.001, s.fade ?? 0.15);
  let p = (Math.abs(turn) / period - (s.start ?? 0)) % 1;
  if (p < 0) p += 1;
  // window: fade in over [0,fade], hold, fade out over the next `fade`
  const inEnd = fade, outStart = fade + hold * (1 - 2 * fade), outEnd = outStart + fade;
  if (p < inEnd) return smooth(p / fade);
  if (p < outStart) return 1;
  if (p < outEnd) return 1 - smooth((p - outStart) / fade);
  return 0;
}
