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
