import {
  parseItem,
  parseItemListItem,
  type Item,
  type ItemListItem,
  type ItemType,
  type ItemUrl,
} from "../shared/item";
import { isYouTubeCapturedContent, type YouTubeCapturedContent } from "../shared/media";
import {
  parseCaptureResult,
  parseItemMetadata,
  type CaptureInput,
  type CaptureResult,
  type ItemMetadata,
} from "../shared/capture";

export type NewItemInput = {
  title: string;
  url: ItemUrl | null;
  type: ItemType;
};

type ItemResponse = { item: Item };
type ItemsResponse = { items: ItemListItem[] };
type SwapResponse = { item: Item; displacedId: string };

export class ItemApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "ItemApiError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchItems(signal?: AbortSignal): Promise<ItemListItem[]> {
  const response = await request("/api/items", { signal });
  const body = readItemsResponse(response);
  return body.items;
}

export async function createItem(input: NewItemInput): Promise<Item> {
  const response = await request("/api/items", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return readItemResponse(response).item;
}

export async function captureUrl(input: CaptureInput): Promise<CaptureResult> {
  const response = await request("/api/capture", { method: "POST", body: JSON.stringify(input) });
  const result = parseCaptureResult(response.body);
  if (result === null) throw new ItemApiError("The server returned an invalid capture.", 502, "invalid_response");
  return result;
}

export async function fetchItemMetadata(
  id: string,
  signal?: AbortSignal,
): Promise<{ item: Item; metadata: ItemMetadata | null }> {
  const response = await request(`/api/items/${encodeURIComponent(id)}/metadata`, { signal });
  const item = readItemResponse(response).item;
  if (!isRecord(response.body)) throw new ItemApiError("The server returned invalid metadata.", 502, "invalid_response");
  const metadata = parseItemMetadata(response.body.metadata);
  if (response.body.metadata !== null && metadata === null) {
    throw new ItemApiError("The server returned invalid metadata.", 502, "invalid_response");
  }
  return { item, metadata };
}

export async function retryItemEnrichment(id: string): Promise<void> {
  await request(`/api/items/${encodeURIComponent(id)}/enrichment/retry`, { method: "POST" });
}

export async function moveItemToDesk(id: string): Promise<Item> {
  const response = await request(`/api/items/${encodeURIComponent(id)}/move-to-desk`, {
    method: "POST",
  });
  return readItemResponse(response).item;
}

export async function moveItemToInbox(id: string): Promise<Item> {
  const response = await request(`/api/items/${encodeURIComponent(id)}/move-to-inbox`, {
    method: "POST",
  });
  return readItemResponse(response).item;
}

export async function finishItem(id: string): Promise<Item> {
  const response = await request(`/api/items/${encodeURIComponent(id)}/finish`, {
    method: "POST",
  });
  return readItemResponse(response).item;
}

export async function discardItem(id: string): Promise<void> {
  try {
    await request(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error: unknown) {
    // A stale client has already reached the desired deleted state.
    if (!(error instanceof ItemApiError) || error.code !== "not_found") throw error;
  }
}

export async function swapItems(candidateId: string, displacedId: string): Promise<SwapResponse> {
  const response = await request(`/api/items/${encodeURIComponent(candidateId)}/swap`, {
    method: "POST",
    body: JSON.stringify({ displacedId }),
  });
  const body: unknown = response.body;
  const item = isRecord(body) ? parseItem(body.item) : null;
  if (item === null || !isRecord(body) || typeof body.displacedId !== "string") {
    throw new ItemApiError("The server returned an invalid item.", 502, "invalid_response");
  }
  return { item, displacedId: body.displacedId };
}

export async function fetchYouTubeContent(
  itemId: string,
  signal?: AbortSignal,
): Promise<YouTubeCapturedContent | null> {
  const response = await request(`/api/items/${encodeURIComponent(itemId)}/media-content`, { signal });
  if (!isRecord(response.body) || (response.body.content !== null && !isYouTubeCapturedContent(response.body.content))) {
    throw new ItemApiError("The server returned invalid video content.", 502, "invalid_response");
  }
  return response.body.content;
}

export async function attachYouTubeContent(
  itemId: string,
  content: YouTubeCapturedContent,
): Promise<CaptureResult> {
  const response = await request(`/api/items/${encodeURIComponent(itemId)}/media/youtube`, {
    method: "POST",
    body: JSON.stringify(content),
  });
  const result = parseCaptureResult(response.body);
  if (result === null) {
    throw new ItemApiError("The server returned an invalid media response.", 502, "invalid_response");
  }
  return result;
}

async function request(path: string, init: RequestInit = {}): Promise<{ body: unknown }> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch {
    throw new ItemApiError("Readr could not reach the server. Try again.", 0, "network_error");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Keep the HTTP status as the useful error when the server returned no JSON.
  }

  if (!response.ok) {
    throw new ItemApiError(
      readErrorMessage(body) ?? "Readr could not complete that request. Try again.",
      response.status,
      readErrorCode(body) ?? `http_${response.status}`,
    );
  }

  return { body };
}

function readItemsResponse(response: { body: unknown }): ItemsResponse {
  if (!isRecord(response.body) || !Array.isArray(response.body.items)) {
    throw new ItemApiError("The server returned invalid items.", 502, "invalid_response");
  }

  const items: ItemListItem[] = [];
  for (const value of response.body.items) {
    const item = parseItemListItem(value);
    if (item === null) {
      throw new ItemApiError("The server returned invalid items.", 502, "invalid_response");
    }
    items.push(item);
  }
  return { items };
}

function readItemResponse(response: { body: unknown }): ItemResponse {
  const item = isRecord(response.body) ? parseItem(response.body.item) : null;
  if (item === null) {
    throw new ItemApiError("The server returned an invalid item.", 502, "invalid_response");
  }
  return { item };
}

function readErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== "string") {
    return null;
  }
  return value.error.message;
}

function readErrorCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return null;
  }
  return value.error.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
