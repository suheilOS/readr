import DOMPurify from "dompurify";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_SVG_CHARACTERS = 100_000;
const MAX_SVG_ELEMENTS = 1_000;
const MAX_PATH_DATA_CHARACTERS = 32_000;

const SVG_TAGS = [
  "#text",
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "title",
  "desc",
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
];

const SVG_ATTRIBUTES = [
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "x2",
  "y1",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "fill-opacity",
  "stroke-opacity",
  "stop-color",
  "stop-opacity",
  "transform",
  "opacity",
  "text-anchor",
  "offset",
  "clip-path",
  "mask",
  "preserveAspectRatio",
  "id",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "aria-hidden",
];

const ALLOWED_TAG_NAMES = new Set(SVG_TAGS.map((tagName) => tagName.toLowerCase()));
const ALLOWED_ATTRIBUTE_NAMES = new Set(SVG_ATTRIBUTES.map((attributeName) => attributeName.toLowerCase()));
const LOCAL_REFERENCE_ATTRIBUTES = new Set(["fill", "stroke", "clip-path", "mask"]);
const SVG_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const LOCAL_REFERENCE = /^url\(\s*#([A-Za-z_][A-Za-z0-9_.:-]*)\s*\)$/i;
const ARIA_REFERENCE_ATTRIBUTES = new Set(["aria-labelledby", "aria-describedby"]);

export function sanitizeSvgElement(element: Element, namespace: number): Element | null {
  try {
    if (!isSupportedSvgElement(element) || exceedsSvgLimits(element) || !isValidSvgTree(element)) {
      return null;
    }

    const sanitized = element.cloneNode(true) as Element;
    namespaceSvgIdentifiers(sanitized, namespace);
    DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: SVG_TAGS,
      ALLOWED_ATTR: SVG_ATTRIBUTES,
      ALLOWED_NAMESPACES: [SVG_NAMESPACE],
      FORBID_ATTR: ["style"],
      IN_PLACE: true,
      KEEP_CONTENT: false,
      NAMESPACE: SVG_NAMESPACE,
    });

    return isSafeSvgTree(sanitized) ? sanitized : null;
  } catch {
    return null;
  }
}

function isSupportedSvgElement(element: Element): boolean {
  return element.localName.toLowerCase() === "svg" && element.namespaceURI === SVG_NAMESPACE;
}

function exceedsSvgLimits(element: Element): boolean {
  if (element.outerHTML.length > MAX_SVG_CHARACTERS) {
    return true;
  }

  if (element.querySelectorAll("*").length + 1 > MAX_SVG_ELEMENTS) {
    return true;
  }

  for (const path of element.querySelectorAll("path")) {
    if ((path.getAttribute("d")?.length ?? 0) > MAX_PATH_DATA_CHARACTERS) {
      return true;
    }
  }

  return false;
}

function namespaceSvgIdentifiers(root: Element, namespace: number): void {
  const prefix = `user-content-svg-${namespace}-`;
  const identifiers = new Map<string, string>();
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];

  for (const current of elements) {
    const identifier = current.getAttribute("id");
    if (identifier !== null) {
      identifiers.set(identifier, `${prefix}${identifier}`);
    }
  }

  for (const current of elements) {
    const identifier = current.getAttribute("id");
    if (identifier !== null) {
      current.setAttribute("id", identifiers.get(identifier) ?? identifier);
    }

    for (const attributeName of ARIA_REFERENCE_ATTRIBUTES) {
      const value = current.getAttribute(attributeName);
      if (value !== null) {
        current.setAttribute(
          attributeName,
          value.split(/\s+/).map((reference) => identifiers.get(reference) ?? reference).join(" "),
        );
      }
    }

    for (const attributeName of LOCAL_REFERENCE_ATTRIBUTES) {
      const value = current.getAttribute(attributeName);
      const match = value === null ? null : LOCAL_REFERENCE.exec(value);
      if (match === null) {
        continue;
      }

      const identifier = identifiers.get(match[1]);
      if (identifier !== undefined) {
        current.setAttribute(attributeName, `url(#${identifier})`);
      }
    }
  }
}

function isSafeSvgTree(root: Node): root is Element {
  return root instanceof Element && isSupportedSvgElement(root) && isValidSvgTree(root);
}

function isValidSvgTree(root: Element): boolean {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  const identifiers = new Set(
    elements
      .map((current) => current.getAttribute("id"))
      .filter((identifier): identifier is string => identifier !== null),
  );

  for (const current of elements) {
    if (current.namespaceURI !== SVG_NAMESPACE || !ALLOWED_TAG_NAMES.has(current.localName.toLowerCase())) {
      return false;
    }

    for (const attribute of Array.from(current.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTE_NAMES.has(name) || name.startsWith("on") || name === "style") {
        return false;
      }

      if (name === "xmlns" && attribute.value !== SVG_NAMESPACE) {
        return false;
      }

      if (name === "id" && !SVG_IDENTIFIER.test(attribute.value)) {
        return false;
      }

      if (LOCAL_REFERENCE_ATTRIBUTES.has(name) && /\\/.test(attribute.value)) {
        return false;
      }

      if (LOCAL_REFERENCE_ATTRIBUTES.has(name) && /url\(/i.test(attribute.value)) {
        const reference = LOCAL_REFERENCE.exec(attribute.value);
        if (reference === null || !identifiers.has(reference[1])) {
          return false;
        }
      }
    }
  }

  return true;
}
