import { test, expect } from "bun:test";
import { MCARD_PCB, memoryCardLabelVisible, keyMemoryCardPrint } from "./mcardInterior";

test("reference PCB clears the bottom and sides of the normalized memory card", () => {
  expect(MCARD_PCB.W).toBe(1.24);
  expect(MCARD_PCB.Y).toBe(0.10);
  expect(MCARD_PCB.Y - MCARD_PCB.H / 2).toBeGreaterThan(-0.71);
  expect(MCARD_PCB.W / 2).toBeLessThan(0.75);
});

test("V2 paper label defaults hidden but explicit choices are preserved", () => {
  expect(memoryCardLabelVisible("v2")).toBe(false);
  expect(memoryCardLabelVisible("v2", true)).toBe(true);
  expect(memoryCardLabelVisible("v1")).toBe(true);
});

test("branding removes the black skin without removing coloured or white print", () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 80, 200, 255, 255, 255, 255, 255]);
  keyMemoryCardPrint(pixels);
  expect(pixels[3]).toBe(0);
  expect(pixels[7]).toBe(255);
  expect(pixels[11]).toBe(255);
});