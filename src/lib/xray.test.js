import { test, expect } from "bun:test";
import { xrayMix, isXrayCore } from "./xray.ts";
test("off is 0", () => expect(xrayMix(1, { mode: "off" })).toBe(0));
test("max hold is always on", () => expect(xrayMix(2.5, { mode: "auto", hold: 1 })).toBe(1));
test("always mode", () => expect(xrayMix(0.3, { mode: "always" })).toBe(1));
test("dense internals get core outlines, plastic gets shell outlines", () => {
  for (const name of ["disc", "shutter", "pcb", "chip", "hub", "gold contact"]) expect(isXrayCore(name)).toBe(true);
  expect(isXrayCore("plastic case", 0)).toBe(false);
});
test("auto fades in then out per half turn", () => {
  const s = { mode: "auto", cycle: "half", hold: 0.3, fade: 0.1 };
  expect(xrayMix(0, s)).toBe(0);
  expect(xrayMix(Math.PI * 0.2, s)).toBe(1);
  expect(xrayMix(Math.PI * 0.9, s)).toBe(0);
});
