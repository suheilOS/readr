import type { Context } from "hono";
import type { AppEnv } from "./auth";
import { jsonError } from "./http";

export async function handleSignOut(context: Context<AppEnv>): Promise<Response> {
  try {
    return await context.env.AUTH_SERVICE.signOut(
      context.req.header("Cookie") ?? "",
    );
  } catch (error) {
    console.error(JSON.stringify({
      message: "auth service sign-out failed",
      error: error instanceof Error ? error.message : String(error),
    }));

    return jsonError({
      error: {
        code: "auth_unavailable",
        message: "We could not sign you out. Try again.",
      },
    }, 503);
  }
}
