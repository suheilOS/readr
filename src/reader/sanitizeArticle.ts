import DOMPurify from "dompurify";

const FORBIDDEN_TAGS = [
  "audio",
  "button",
  "canvas",
  "embed",
  "form",
  "iframe",
  "input",
  "math",
  "object",
  "script",
  "select",
  "source",
  "style",
  "svg",
  "template",
  "textarea",
  "track",
  "video",
];

export function sanitizeArticleHtml(html: string, sourceUrl: string): string {
  const normalizedHtml = normalizeContentUrls(html, sourceUrl);

  return DOMPurify.sanitize(normalizedHtml, {
    USE_PROFILES: { html: true },
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_ATTR: ["srcset", "style"],
    FORBID_TAGS: FORBIDDEN_TAGS,
    SANITIZE_NAMED_PROPS: true,
  });
}

function normalizeContentUrls(html: string, sourceUrl: string): string {
  let baseUrl: URL;
  try {
    baseUrl = new URL(sourceUrl);
  } catch {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const element of template.content.querySelectorAll("a[href], img[src]")) {
    const attribute = element.tagName.toLowerCase() === "img" ? "src" : "href";
    const value = element.getAttribute(attribute);
    if (value === null) {
      continue;
    }

    let absoluteUrl: URL;
    try {
      absoluteUrl = new URL(value, baseUrl);
    } catch {
      element.removeAttribute(attribute);
      continue;
    }

    if (absoluteUrl.protocol !== "http:" && absoluteUrl.protocol !== "https:") {
      element.removeAttribute(attribute);
      continue;
    }

    if (attribute === "src" && isPrivateImageHost(absoluteUrl.hostname)) {
      element.removeAttribute(attribute);
      continue;
    }

    element.setAttribute(attribute, absoluteUrl.toString());
    if (attribute === "href") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noreferrer noopener");
    } else {
      element.setAttribute("loading", "lazy");
    }
  }

  return template.innerHTML;
}

function isPrivateImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host === "local" || host.endsWith(".local")
  ) {
    return true;
  }

  const ipv4Parts = host.split(".");
  if (ipv4Parts.length === 4 && ipv4Parts.every((part) => /^\d{1,3}$/.test(part))) {
    const octets = ipv4Parts.map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const first = octets[0] ?? 0;
    const second = octets[1] ?? 0;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0);
  }

  return host === "::" || host === "::1" || host.startsWith("fc") ||
    host.startsWith("fd") || /^fe[89ab]/.test(host) || host.startsWith("ff") ||
    host.startsWith("2001:db8:");
}
