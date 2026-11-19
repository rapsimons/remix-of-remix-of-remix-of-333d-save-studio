import { test, expect } from "bun:test";
import { CD_V4_DIAMETER, CD_V4_THICKNESS, createSawbladeRimGeometry } from "./cdV4Contour";

test("CD V4 has the 1.2 mm thickness of a 120 mm CD", () => {
  expect(CD_V4_THICKNESS / CD_V4_DIAMETER * 120).toBeCloseTo(1.2, 8);
  const rim = createSawbladeRimGeometry();
  rim.computeBoundingBox();
  expect(rim.boundingBox.max.z - rim.boundingBox.min.z).toBeCloseTo(0.0192, 7);
  expect(rim.getAttribute("position").count).toBe(2116);
  rim.dispose();
});