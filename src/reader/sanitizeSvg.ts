import DOMPurify from "dompurify";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_SVG_CHARACTERS = 100_000;
const MAX_SVG_ELEMENTS = 1_000;
const MAX_PATH_DATA_CHARACTERS = 32_000;
const MAX_SVG_DIMENSION = 100_000;
const MAX_SVG_ASPECT_RATIO = 20;
const DEFAULT_SVG_WIDTH = 300;
const DEFAULT_SVG_HEIGHT = 150;

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
const SVG_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const SVG_LENGTH = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:px|pt|pc|mm|cm|in|em|ex|ch|rem|vw|vh|vmin|vmax|%)?$/i;
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
  if (!isSafeIntrinsicSize(root)) {
    return false;
  }

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

      if (name === "viewbox" && !isSafeViewBox(attribute.value)) {
        return false;
      }

      if ((name === "width" || name === "height") && parseSvgLength(attribute.value) === null) {
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

function isSafeIntrinsicSize(root: Element): boolean {
  const viewBox = root.getAttribute("viewBox");
  const parsedViewBox = viewBox === null ? null : parseSvgViewBox(viewBox);
  if (viewBox !== null && parsedViewBox === null) {
    return false;
  }

  const width = parseSvgLength(root.getAttribute("width"));
  const height = parseSvgLength(root.getAttribute("height"));
  const ratios: Array<[number, number]> = [];

  if (parsedViewBox !== null) {
    const viewBoxWidth = parsedViewBox[2];
    const viewBoxHeight = parsedViewBox[3];
    if (viewBoxWidth <= 0 || viewBoxHeight <= 0) {
      return false;
    }

    ratios.push([viewBoxWidth, viewBoxHeight]);
  }

  ratios.push([
    width ?? DEFAULT_SVG_WIDTH,
    height ?? DEFAULT_SVG_HEIGHT,
  ]);

  return ratios.every(([intrinsicWidth, intrinsicHeight]) => isSafeAspectRatio(intrinsicWidth, intrinsicHeight));
}

function isSafeViewBox(value: string): boolean {
  const parsed = parseSvgViewBox(value);
  return parsed !== null && parsed[2] > 0 && parsed[3] > 0;
}

function parseSvgViewBox(value: string): [number, number, number, number] | null {
  const values = value.trim().split(/[,\s]+/).map(parseSvgNumber);
  if (values.length !== 4) {
    return null;
  }

  const minX = values[0];
  const minY = values[1];
  const width = values[2];
  const height = values[3];
  if (minX === undefined || minX === null || minY === undefined || minY === null ||
      width === undefined || width === null || height === undefined || height === null) {
    return null;
  }

  return [minX, minY, width, height];
}

function parseSvgNumber(value: string): number | null {
  return SVG_NUMBER.test(value) ? Number(value) : null;
}

function parseSvgLength(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const match = SVG_LENGTH.exec(value.trim());
  if (match === null) {
    return null;
  }

  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 && number <= MAX_SVG_DIMENSION ? number : null;
}

function isSafeAspectRatio(width: number, height: number): boolean {
  const ratio = width / height;
  return Number.isFinite(ratio) && ratio > 0 && ratio <= MAX_SVG_ASPECT_RATIO && ratio >= 1 / MAX_SVG_ASPECT_RATIO;
}
