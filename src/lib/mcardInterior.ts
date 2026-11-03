/** Reference-measured PCB fit in the normalized PS2 shell. */
export const MCARD_PCB = { W: 1.24, H: 1.24 * 1092 / 850, X: 0, Y: 0.10 };

export function memoryCardLabelVisible(variant: string, enabled?: boolean): boolean {
  return enabled ?? variant !== "v2";
}

/** Remove the black plastic skin, retaining coloured and white print. */
export function keyMemoryCardPrint(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = Math.max(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
    const coverage = Math.min(1, Math.max(0, (brightness - 35) / 45));
    pixels[i + 3] = Math.round((pixels[i + 3] ?? 255) * coverage);
  }
}