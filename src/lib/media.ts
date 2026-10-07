import { LABEL_ASPECT } from "./labelCanvas";
import type { Design } from "./types";

export type MediaType = "floppy" | "cd";

/** CD printable ring, as fractions of the disc radius (124 mm disc). */
export const CD_OUTER = 0.952; // ~1 mm clear rim
export const CD_INNER = 0.24; // clear centre hub

export const mediaOf = (d: Pick<Design, "mediaType">): MediaType => d.mediaType ?? "floppy";
export const isCd = (d: Pick<Design, "mediaType">) => mediaOf(d) === "cd";

export function labelAspect(d: Pick<Design, "mediaType">) {
  return isCd(d) ? 1 : LABEL_ASPECT;
}

export function labelDonut(d: Pick<Design, "mediaType">) {
  return isCd(d) ? { outer: CD_OUTER, inner: CD_INNER } : undefined;
}

export const CD_BACKS = {
  silver: { label: "Silver", color: "#ffffff", tex: "silver" as const },
  black: { label: "Black", color: "#3a3a3a", tex: "black" as const },
  gold: { label: "Gold", color: "#f2c24e", tex: "silver" as const },
  custom: { label: "Color", color: "#ff4b82", tex: "silver" as const },
};
export type CdBackStyle = keyof typeof CD_BACKS;

export function cdBackColor(d: Pick<Design, "cdBackStyle" | "cdBackColor">) {
  const s = d.cdBackStyle ?? "silver";
  return s === "custom" ? d.cdBackColor ?? CD_BACKS.custom.color : CD_BACKS[s].color;
}
