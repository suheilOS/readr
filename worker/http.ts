export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function jsonError(
  body: ErrorBody,
  status: number,
  extraHeaders: HeadersInit = {},
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");

  return Response.json(body, { status, headers });
}
