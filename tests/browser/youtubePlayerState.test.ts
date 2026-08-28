import { describe, expect, it } from "vitest";
import { playingStateForYouTubePlayerState } from "../../src/reader/youtubePlayerState";

describe("YouTube player state mapping", () => {
  it("changes playback state only for playing, paused, and ended events", () => {
    expect(playingStateForYouTubePlayerState(1)).toBe(true);
    expect(playingStateForYouTubePlayerState(2)).toBe(false);
    expect(playingStateForYouTubePlayerState(0)).toBe(false);
    expect(playingStateForYouTubePlayerState(3)).toBeNull();
    expect(playingStateForYouTubePlayerState(5)).toBeNull();
    expect(playingStateForYouTubePlayerState(-1)).toBeNull();
  });
});
