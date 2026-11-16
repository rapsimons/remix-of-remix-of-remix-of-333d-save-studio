/** Pure X-ray timing rules: mix 0..1 from the model's accumulated turn angle. */
export type XraySettings = { mode?: "off" | "auto" | "always"; cycle?: "half" | "full"; start?: number; hold?: number; fade?: number };

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

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
