const PLAYER_STATE_ENDED = 0;
const PLAYER_STATE_PLAYING = 1;
const PLAYER_STATE_PAUSED = 2;

export function playingStateForYouTubePlayerState(state: number): boolean | null {
  if (state === PLAYER_STATE_PLAYING) return true;
  if (state === PLAYER_STATE_PAUSED || state === PLAYER_STATE_ENDED) return false;
  return null;
}
