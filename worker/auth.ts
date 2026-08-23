import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

export type SessionLookup = {
  userId: string;
  sessionId: string;
  expiresAt: string;
};

export type AuthServiceBinding = {
  getSession: (cookie: string) => Promise<SessionLookup | null>;
  signOut: (cookie: string) => Promise<Response>;
};

type AppBindings = Omit<Env, "AUTH_SERVICE"> & {
  AUTH_SERVICE: AuthServiceBinding;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    session: SessionLookup;
    userId: string;
  };
};

export const requireAuth = createMiddleware<AppEnv>(async (context, next) => {
  const cookie = context.req.header("Cookie");
  if (cookie === undefined || cookie.length === 0) {
    return unauthorized(context);
  }

  let session: SessionLookup | null;
  try {
    session = await context.env.AUTH_SERVICE.getSession(cookie);
  } catch (error) {
    console.error(JSON.stringify({
      message: "auth service lookup failed",
      error: error instanceof Error ? error.message : String(error),
    }));

    return context.json({
      error: {
        code: "auth_unavailable",
        message: "Authentication is temporarily unavailable. Try again.",
      },
    }, 503);
  }

  if (session === null || session.userId.length === 0) {
    return unauthorized(context);
  }

  context.set("session", session);
  context.set("userId", session.userId);
  await next();
});

function unauthorized(context: Context<AppEnv>): Response {
  return context.json({
    error: {
      code: "unauthorized",
      message: "Sign in to use Readr.",
    },
  }, 401);
}
