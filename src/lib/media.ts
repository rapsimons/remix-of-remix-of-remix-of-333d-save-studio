import { LABEL_ASPECT } from "./labelCanvas";
import type { Design } from "./types";
import floppyV2 from "@/assets/floppy-v2.glb.asset.json";
import cdV2 from "@/assets/cd-v2.glb.asset.json";
import cdV3 from "@/assets/cd-v3.glb.asset.json";
import mcard from "@/assets/mcard.glb.asset.json";
import mcardPs1 from "@/assets/mcard-ps1.glb.asset.json";

export type MediaType = "floppy" | "cd" | "minidisc" | "ps1";
export type ModelVariant = "v1" | "v2" | "v3";

/** Version choices offered per media type. */
export const VARIANTS: Record<MediaType, ModelVariant[]> = {
  floppy: ["v1", "v2"],
  cd: ["v1", "v2", "v3"],
  minidisc: ["v1", "v2"],
  ps1: ["v1", "v2"],
};

/** Pick the 3D file for the current media + version; falls back to the default. */
export function modelUrlFor(d: Pick<Design, "mediaType" | "modelVariant">, fallback: string) {
  const m = mediaOf(d);
  const v = d.modelVariant ?? "v1";
  if (m === "ps1") return v === "v2" ? mcard.url : mcardPs1.url;
  if (m === "floppy" && v === "v2") return floppyV2.url;
  if (m === "cd" && v === "v2") return cdV2.url;
  if (m === "cd" && v === "v3") return cdV3.url;
  return fallback;
}

/** CD printable ring, as fractions of the disc radius (124 mm disc). */
export const CD_OUTER = 0.985; // thin clear rim, same size as the back data side
export const CD_INNER = 0.24; // clear centre hub

export const mediaOf = (d: Pick<Design, "mediaType">): MediaType => d.mediaType ?? "floppy";
export const isCd = (d: Pick<Design, "mediaType">) => mediaOf(d) === "cd";
export const isMiniDisc = (d: Pick<Design, "mediaType">) => mediaOf(d) === "minidisc";
/** MiniDisc V1: the real cartridge model (rectangular artwork). V2 is the jewel case. */
export const isMiniDiscCart = (d: Pick<Design, "mediaType" | "modelVariant">) =>
  isMiniDisc(d) && (d.modelVariant ?? "v1") === "v1";
/** MiniDisc cartridge outline, 71.8 x 68.2 mm (matches the front drawing). */
export const MD_ASPECT = 1280 / 1209;
/** Round artwork (CD or the disc inside the jewel case). */
export const isRound = (d: Pick<Design, "mediaType" | "modelVariant">) =>
  isCd(d) || (isMiniDisc(d) && !isMiniDiscCart(d));

export function labelAspect(d: Pick<Design, "mediaType" | "modelVariant">) {
  if (isMiniDiscCart(d)) return MD_ASPECT;
  return isRound(d) ? 1 : LABEL_ASPECT;
}

export function labelDonut(d: Pick<Design, "mediaType" | "modelVariant">) {
  return isRound(d) ? { outer: CD_OUTER, inner: CD_INNER } : undefined;
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
