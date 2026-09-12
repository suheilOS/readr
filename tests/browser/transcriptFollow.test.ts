import { describe, expect, it } from "vitest";
import {
  getTranscriptSafeZone,
  transcriptScrollBehavior,
  transcriptScrollDirection,
} from "../../src/reader/transcriptFollow";

describe("transcript auto-follow geometry", () => {
  const safeZone = getTranscriptSafeZone(800, { top: 0, bottom: 1_200 });

  it("does not scroll an active segment inside the safe zone", () => {
    expect(transcriptScrollDirection({ top: 300, bottom: 360 }, safeZone)).toBeNull();
  });

  it("scrolls down when the active segment is below the safe zone", () => {
    expect(transcriptScrollDirection({ top: 650, bottom: 710 }, safeZone)).toBe("down");
  });

  it("scrolls up when the active segment is above the safe zone", () => {
    expect(transcriptScrollDirection({ top: 40, bottom: 100 }, safeZone)).toBe("up");
  });

  it("uses the viewport zone while the transcript area is temporarily offscreen", () => {
    expect(getTranscriptSafeZone(800, { top: 900, bottom: 1_400 })).toEqual({ top: 160, bottom: 640 });
  });

  it("disables animation when reduced motion is preferred", () => {
    expect(transcriptScrollBehavior(true)).toBe("auto");
    expect(transcriptScrollBehavior(false)).toBe("smooth");
  });
});
