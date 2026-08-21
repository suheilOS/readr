import type { ExtractErrorBody } from "../shared/extraction";
import { extractFromRequest, ExtractionError } from "./extract";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/extract") {
      return env.ASSETS.fetch(request);
    }

    if (request.method !== "POST") {
      return jsonError({
        error: {
          code: "method_not_allowed",
          message: "Use POST for extraction.",
        },
      }, 405, { Allow: "POST" });
    }

    try {
      const article = await extractFromRequest(request);
      return Response.json(article, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      if (error instanceof ExtractionError) {
        return jsonError(
          {
            error: {
              code: error.code,
              message: error.message,
            },
          },
          error.status,
        );
      }

      console.error(
        JSON.stringify({
          message: "article extraction failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );

      return jsonError({
        error: {
          code: "internal_error",
          message: "The page could not be opened.",
        },
      }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

function jsonError(
  body: ExtractErrorBody,
  status: number,
  extraHeaders: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...extraHeaders,
      "Cache-Control": "no-store",
    },
  });
}
