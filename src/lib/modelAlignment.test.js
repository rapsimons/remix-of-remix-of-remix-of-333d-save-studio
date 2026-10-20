import { test, expect } from "bun:test";
import { createDesign } from "./types";
import { alignmentFor, migrateAlignments, updateAlignment } from "./modelAlignment";

test("saving CD v2 alignment leaves CD v1/v3 and both floppies unchanged", () => {
  const d = migrateAlignments(createDesign());
  d.mediaType = "cd";
  d.modelVariant = "v2";
  updateAlignment(d, { rotX: 27, offsetX: 0.3 });
  const restored = JSON.parse(JSON.stringify(d));
  expect(alignmentFor(restored).rotX).toBe(27);
  for (const mediaType of ["cd", "floppy"]) {
    for (const modelVariant of ["v1", "v2", "v3"]) {
      if (mediaType === "cd" && modelVariant === "v2") continue;
      expect(alignmentFor({ ...restored, mediaType, modelVariant }).rotX).toBe(0);
      expect(alignmentFor({ ...restored, mediaType, modelVariant }).offsetX).toBe(0);
    }
  }
  expect(alignmentFor({ ...restored, mediaType: "ps1" }).rotX).toBe(0);
});

test("legacy alignment migrates only to the model it was saved on", () => {
  const d = createDesign();
  d.mediaType = "cd";
  d.modelVariant = "v2";
  d.alignment.rotY = 45;
  const migrated = migrateAlignments(d);
  expect(alignmentFor(migrated).rotY).toBe(45);
  expect(alignmentFor({ ...migrated, mediaType: "floppy", modelVariant: "v1" }).rotY).toBe(0);
});