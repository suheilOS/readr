import { parseItemUrl } from "../../shared/item";

export function validUrl(value: string) {
  const url = parseItemUrl(value);
  if (url === null) throw new Error(`Invalid test URL: ${value}`);
  return url;
}
