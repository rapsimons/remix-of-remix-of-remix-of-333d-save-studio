import { test, expect } from "bun:test";
import { glassEdgeWeight, preserveSolidSample } from "./glassRules";

test("case iridescence is absent on flat faces and strongest at grazing edges", () => {
  expect(glassEdgeWeight(1)).toBe(0);
  expect(glassEdgeWeight(0.8)).toBe(0);
  expect(glassEdgeWeight(0)).toBe(1);
});

test("solid internal parts use the sharp sample, only empty background pixels warp", () => {
  expect(preserveSolidSample(0.95)).toBe(true);
  expect(preserveSolidSample(1)).toBe(false);
});