import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth";

export const requireSameOrigin = createMiddleware<AppEnv>(async (context, next) => {
  if (context.req.method === "GET" || context.req.method === "HEAD" || context.req.method === "OPTIONS") {
    await next();
    return;
  }

  const origin = context.req.header("Origin");
  const allowedOrigins = new Set([
    new URL(context.req.url).origin,
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ]);
  if (origin !== undefined && allowedOrigins.has(origin)) {
    await next();
    return;
  }

  return context.json({
    error: {
      code: "csrf_rejected",
      message: "The request origin is not allowed.",
    },
  }, 403);
});
