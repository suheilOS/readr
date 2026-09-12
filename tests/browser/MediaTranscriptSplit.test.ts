import { describe, expect, it } from "vitest";
import {
  calculateSplitBounds,
  clampPlayerWidth,
} from "../../src/reader/mediaSplitGeometry";

describe("media transcript split geometry", () => {
  it("reserves the separator and both pane minimums near the split breakpoint", () => {
    expect(calculateSplitBounds(840)).toEqual({
      availableWidth: 816,
      minPlayerWidth: 360,
      maxPlayerWidth: 396,
    });
  });

  it("caps the player at its absolute maximum on wide layouts", () => {
    expect(calculateSplitBounds(1180)).toEqual({
      availableWidth: 1156,
      minPlayerWidth: 360,
      maxPlayerWidth: 720,
    });
  });

  it("collapses impossible bounds to the player minimum", () => {
    expect(calculateSplitBounds(800)).toEqual({
      availableWidth: 776,
      minPlayerWidth: 360,
      maxPlayerWidth: 360,
    });
  });

  it("clamps requested widths to the calculated range", () => {
    const bounds = calculateSplitBounds(1180);

    expect(clampPlayerWidth(200, bounds)).toBe(360);
    expect(clampPlayerWidth(540, bounds)).toBe(540);
    expect(clampPlayerWidth(900, bounds)).toBe(720);
  });
});
