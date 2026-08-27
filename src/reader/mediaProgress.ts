import { isMediaProgress, type MediaProgress, type SaveMediaProgressInput } from "../../shared/mediaProgress";

export async function loadMediaProgress(itemId: string, signal: AbortSignal): Promise<MediaProgress | null> {
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/media-progress`, { signal });
  const body: unknown = await response.json();
  if (!response.ok || !isRecord(body)) return null;
  return body.progress === null || isMediaProgress(body.progress) ? body.progress : null;
}

export function saveMediaProgress(
  itemId: string,
  input: SaveMediaProgressInput,
  keepalive = false,
): Promise<MediaProgress> {
  return fetch(`/api/items/${encodeURIComponent(itemId)}/media-progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive,
  }).then(async (response) => {
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || !isMediaProgress(body.progress)) {
      throw new Error("Playback progress could not be saved");
    }
    return body.progress;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
