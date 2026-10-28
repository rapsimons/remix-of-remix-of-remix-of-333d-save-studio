import { test, expect } from "bun:test";
import JSZip from "jszip";
import { generate3dArchive } from "./export3d";

test("3D ZIP stores model and texture bytes without recompressing them", async () => {
  const zip = new JSZip();
  const model = new Uint8Array([103, 108, 84, 70, 2, 0, 0, 0]);
  const texture = new Uint8Array([137, 80, 78, 71]);
  zip.file("model.glb", model);
  zip.file("textures/label_front.png", texture);
  zip.file("design_metadata.json", JSON.stringify({ design: { name: "Test disc" } }));
  const blob = await generate3dArchive(zip);
  const bytes = await blob.arrayBuffer();
  // The first local ZIP header's compression method must be STORE (0).
  expect(new DataView(bytes).getUint16(8, true)).toBe(0);
  const archive = await JSZip.loadAsync(bytes);
  expect(await archive.file("model.glb").async("uint8array")).toEqual(model);
  expect(await archive.file("textures/label_front.png").async("uint8array")).toEqual(texture);
  expect(JSON.parse(await archive.file("design_metadata.json").async("string")).design.name).toBe("Test disc");
});