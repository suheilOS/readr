import type { Context } from "hono";
import { Hono } from "hono";
import { extractFromRequest, ExtractionError } from "./extract";
import { requireAuth, type AppEnv } from "./auth";
import { itemRoutes } from "./items";
import { requireSameOrigin } from "./csrf";
import { jsonError } from "./http";
import { handleSignOut } from "./sign-out";

export const app = new Hono<AppEnv>();

app.get("/health", (context) => context.json({ status: "ok" }));

app.post("/api/auth/sign-out", requireSameOrigin, handleSignOut);
app.all("/api/auth/sign-out", () => jsonError({
  error: {
    code: "method_not_allowed",
    message: "Use POST to sign out.",
  },
}, 405, { Allow: "POST" }));

app.route("/api", itemRoutes);

app.post("/api/extract", requireAuth, requireSameOrigin, handleExtraction);
app.all("/api/extract", () => jsonError({
  error: {
    code: "method_not_allowed",
    message: "Use POST for extraction.",
  },
}, 405, { Allow: "POST" }));

app.all("/api/*", () => jsonError({
  error: {
    code: "not_found",
    message: "The requested API route does not exist.",
  },
}, 404));

app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

app.onError((error, context) => {
  console.error(
    JSON.stringify({
      message: "Readr Worker request failed",
      path: new URL(context.req.raw.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  return jsonError({
    error: {
      code: "internal_error",
      message: "The request could not be completed.",
    },
  }, 500);
});

export default app;

async function handleExtraction(context: Context<AppEnv>): Promise<Response> {
  const clientKey = context.req.header("CF-Connecting-IP") ?? "unidentified";
  const rateLimit = await context.env.EXTRACT_RATE_LIMITER.limit({ key: `extract:${clientKey}` });
  if (!rateLimit.success) {
    console.warn(JSON.stringify({ message: "extract request rate limited" }));
    return jsonError({
      error: {
        code: "rate_limited",
        message: "Too many articles were opened recently. Try again in a minute.",
      },
    }, 429, { "Retry-After": "60" });
  }

  try {
    const article = await extractFromRequest(context.req.raw);
    return Response.json(article, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
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
}
