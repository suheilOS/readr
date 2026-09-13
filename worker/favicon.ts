import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { jsonError } from "./http";
import { normalizePublicUrl } from "./urlSafety";

const FAVICON_BROWSER_TTL_SECONDS = 86_400;
const FAVICON_EDGE_TTL_SECONDS = 604_800;
const FAVICON_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
]);

export async function getFavicon(context: Context<AppEnv>): Promise<Response> {
  const hostname = normalizeHostname(context.req.query("host"));
  if (hostname === null) {
    return jsonError({
      error: {
        code: "invalid_host",
        message: "A valid public hostname is required.",
      },
    }, 400);
  }

  const cacheKey = faviconCacheKey(context.req.raw, hostname);
  const cache = await caches.open("readr-favicons");
  const cached = await cache.match(cacheKey);
  if (cached !== undefined) return cached;

  const providerUrl = new URL("https://www.google.com/s2/favicons");
  providerUrl.searchParams.set("domain_url", `https://${hostname}`);
  providerUrl.searchParams.set("sz", "64");

  let upstream: Response;
  try {
    upstream = await fetch(providerUrl, {
      headers: { Accept: "image/avif,image/webp,image/png,image/*" },
    });
  } catch (error) {
    console.warn(JSON.stringify({
      message: "favicon fetch failed",
      hostname,
      error: error instanceof Error ? error.message : String(error),
    }));
    return faviconUnavailable();
  }

  const contentType = upstream.headers.get("Content-Type")?.split(";", 1)[0].trim();
  if (!upstream.ok || contentType === undefined || !FAVICON_CONTENT_TYPES.has(contentType)) {
    upstream.body?.cancel().catch(() => undefined);
    return faviconUnavailable();
  }

  const response = new Response(upstream.body, {
    headers: {
      "Cache-Control": `public, max-age=${FAVICON_BROWSER_TTL_SECONDS}, s-maxage=${FAVICON_EDGE_TTL_SECONDS}, stale-while-revalidate=86400`,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });

  context.executionCtx.waitUntil(
    cache.put(cacheKey, response.clone()).catch((error: unknown) => {
      console.warn(JSON.stringify({
        message: "favicon cache write failed",
        hostname,
        error: error instanceof Error ? error.message : String(error),
      }));
    }),
  );
  return response;
}

function normalizeHostname(input: string | undefined): string | null {
  if (input === undefined || input.length > 253) return null;
  return normalizePublicUrl(`https://${input}/`)?.hostname ?? null;
}

function faviconCacheKey(request: Request, hostname: string): Request {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("host", hostname);
  return new Request(url, { method: "GET" });
}

function faviconUnavailable(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
