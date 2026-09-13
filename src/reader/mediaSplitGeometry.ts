export const MIN_PLAYER_WIDTH = 360;
export const MIN_TRANSCRIPT_WIDTH = 420;
export const MAX_PLAYER_WIDTH = 720;
export const MAX_PLAYER_RATIO = 0.64;
export const DEFAULT_PLAYER_RATIO = MAX_PLAYER_RATIO;
export const SPLITTER_WIDTH = 24;

export type SplitBounds = {
  availableWidth: number;
  minPlayerWidth: number;
  maxPlayerWidth: number;
};

export function calculateSplitBounds(containerWidth: number): SplitBounds {
  const availableWidth = Math.max(1, containerWidth - SPLITTER_WIDTH);
  const maxPlayerWidth = Math.max(
    MIN_PLAYER_WIDTH,
    Math.min(MAX_PLAYER_WIDTH, availableWidth * MAX_PLAYER_RATIO, availableWidth - MIN_TRANSCRIPT_WIDTH),
  );

  return {
    availableWidth,
    minPlayerWidth: MIN_PLAYER_WIDTH,
    maxPlayerWidth,
  };
}

export function clampPlayerWidth(playerWidth: number, bounds: SplitBounds): number {
  return Math.min(bounds.maxPlayerWidth, Math.max(bounds.minPlayerWidth, playerWidth));
}
