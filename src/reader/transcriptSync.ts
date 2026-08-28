type TimedEntry = { startSeconds: number };

export function activeTimedEntryIndex(entries: readonly TimedEntry[], timeSeconds: number): number {
  if (entries.length === 0 || timeSeconds < entries[0].startSeconds) return -1;

  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].startSeconds <= timeSeconds) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return high;
}

export function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
