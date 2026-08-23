import {
  parseItem,
  type Item,
  type ItemType,
  type ItemUrl,
} from "../shared/item";

export type NewItemInput = {
  title: string;
  url: ItemUrl | null;
  type: ItemType;
};

type ItemResponse = { item: Item };
type ItemsResponse = { items: Item[] };
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

export async function fetchItems(signal?: AbortSignal): Promise<Item[]> {
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
  await request(`/api/items/${encodeURIComponent(id)}`, { method: "DELETE" });
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

  const items: Item[] = [];
  for (const value of response.body.items) {
    const item = parseItem(value);
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
