import { defaultAlignment, type Alignment, type Design } from "./types";

export function alignmentKey(d: Pick<Design, "mediaType" | "modelVariant" | "modelUrl">) {
  const media = d.mediaType ?? "floppy";
  return `${media}:${media === "ps1" ? "v1" : d.modelVariant ?? "v1"}:${d.modelUrl ?? "builtin"}`;
}

export function alignmentFor(d: Design): Alignment {
  return d.modelAlignments?.[alignmentKey(d)] ?? (d.modelAlignments ? defaultAlignment : d.alignment ?? defaultAlignment);
}

export function migrateAlignments(d: Design): Design {
  const withDisc = d.discFront && d.discBack ? d : { ...d, discFront: d.discFront ?? [], discBack: d.discBack ?? [] };
  if (withDisc.modelAlignments) return withDisc;
  return { ...withDisc, modelAlignments: { [alignmentKey(withDisc)]: { ...defaultAlignment, ...withDisc.alignment } } };
}

export function updateAlignment(d: Design, patch: Partial<Alignment>) {
  const migrated = migrateAlignments(d);
  d.modelAlignments = { ...migrated.modelAlignments, [alignmentKey(d)]: { ...alignmentFor(migrated), ...patch } };
  d.alignment = { ...alignmentFor(d) };
}