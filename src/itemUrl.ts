declare const itemUrlBrand: unique symbol;

export type ItemUrl = string & { readonly [itemUrlBrand]: true };

export function parseItemUrl(value: unknown): ItemUrl | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }

    return url.toString() as ItemUrl;
  } catch {
    return null;
  }
}
