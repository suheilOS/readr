export type VerticalBounds = {
  top: number;
  bottom: number;
};

export type TranscriptScrollDirection = "up" | "down" | null;

const SAFE_ZONE_TOP_RATIO = 0.2;
const SAFE_ZONE_BOTTOM_RATIO = 0.8;

export function getTranscriptSafeZone(
  viewportHeight: number,
  readingArea: VerticalBounds,
): VerticalBounds | null {
  if (viewportHeight <= 0) return null;

  const viewportZone: VerticalBounds = {
    top: viewportHeight * SAFE_ZONE_TOP_RATIO,
    bottom: viewportHeight * SAFE_ZONE_BOTTOM_RATIO,
  };
  const clippedZone: VerticalBounds = {
    top: Math.max(viewportZone.top, readingArea.top),
    bottom: Math.min(viewportZone.bottom, readingArea.bottom),
  };

  return clippedZone.bottom > clippedZone.top ? clippedZone : viewportZone;
}

export function transcriptScrollDirection(
  activeSegment: VerticalBounds,
  safeZone: VerticalBounds | null,
): TranscriptScrollDirection {
  if (safeZone === null) return null;
  if (activeSegment.bottom > safeZone.bottom) return "down";
  if (activeSegment.top < safeZone.top) return "up";
  return null;
}

export function transcriptScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}
