# Rich article Reader implementation plan

## Goal

Make static rich articles more faithful in Readr without importing arbitrary source-site CSS or JavaScript.

The first milestone supports safe, server-extracted content:

- figures and captions;
- inline SVG illustrations;
- tables, code, and existing semantic HTML;
- simple native media where the Reader can control the element; and
- equations in the format that the current Defuddle version returns.

Use the Hacktron article as the primary regression fixture. The fixture must show whether the exploit-chain graphic survives as an SVG, an image, a styled DOM structure, or another format.

## Scope limits

Do not run source-site JavaScript in Readr.

Do not import source-site stylesheets or inline styles into the Reader.

Do not support arbitrary canvas, WebGL, interactive charts, embeds, or custom site components in this milestone.

Do not replace the article with a full block-based schema before a supported rich element requires ordered React rendering.

## Current pipeline

The current pipeline is:

```text
source HTML
    ↓
Defuddle in the Worker
    ↓
stored article HTML
    ↓
client-side DOMPurify
    ↓
ReaderView in src/components/ReaderView.tsx
```

The Worker does not execute the source page or load its rendered DOM. It can only extract content present in the fetched HTML.

The client sanitizes article content in `src/reader/articleCache.ts` before `ReaderView` renders it with `dangerouslySetInnerHTML`.

## Design decisions

### Define capability flags from Defuddle output

Capabilities describe content present in the post-Defuddle article markup. They do not claim that the content survived sanitization or that the Reader can render it.

Start with this shape:

```ts
type ArticleCapabilities = {
  figures: boolean;
  svg: boolean;
  media: boolean;
  math: boolean;
};
```

Define `media` as native audio or video markup for the first version. Do not infer animated GIF, WebP, or AVIF content from a filename. The browser already handles those formats through `img` when the source URL is safe.

Derive each flag from the Defuddle result, not only from the original source DOM. The fixture audit can add a separate diagnostic for content that existed in the source but disappeared before `result.content`.

### Preserve legacy extraction results

New extractions return a complete `ArticleCapabilities` object. Existing stored rows do not have capability data, so represent their state as unknown rather than as four false values.

Use this contract:

```ts
type ExtractedArticle = {
  sourceUrl: string;
  title: string;
  author: string | null;
  html: string;
  wordCount: number;
  capabilities: ArticleCapabilities | null;
};
```

`null` means that the article was stored before capability tracking. New Worker extractions must return a non-null object.

Keep the response parser compatible with older payloads that omit `capabilities`. Normalize those payloads to `null` at the API boundary.

### Keep sanitization policies separate

Use the existing HTML sanitizer for ordinary article markup. Add a dedicated policy for SVG. Do not remove `svg`, `video`, `math`, or other dangerous tags from `FORBIDDEN_TAGS` without replacing the corresponding security policy.

Sanitize rich nodes through DOM operations. Do not use regular expressions to extract or restore markup.

### Add a rendering boundary only when needed

Inline figures and static SVG can remain inside sanitized article HTML. Introduce ordered rich rendering when a component needs React-owned behavior, such as controlled video or a future diagram component.

A custom element inside `dangerouslySetInnerHTML` does not mount a React component. When the boundary is needed, split the sanitized document into ordered HTML segments and trusted React components, or use an equivalent DOM traversal. Preserve the source order.

## Phase 1: Audit extraction fixtures

Create checked-in fixtures in a shared test directory such as:

```text
tests/fixtures/articles/
```

Include at least:

```text
plain.html
news.html
figure.html
svg.html
table.html
code.html
math.html
animated-image.html
video.html
hacktron.html
```

For each fixture, record and test:

```text
source fixture
    ↓
Defuddle result.content
    ↓
sanitary Reader HTML
```

The Worker tests already run Defuddle in `tests/worker/extract.test.ts`. The browser tests already run DOMPurify in `tests/browser/sanitizeArticle.test.ts`. Share the fixture content between those suites without depending on live websites.

For the Hacktron fixture, compare normal Defuddle output with debug-preserving output during the audit. Use debug output to identify lost structure only. Do not render debug output in production.

Record the result for every fixture in [`docs/rich-reader-fixture-audit.md`](rich-reader-fixture-audit.md):

| Fixture | Source form | Defuddle output | Sanitizer output | Reader decision |
| --- | --- | --- | --- | --- |
| Hacktron | positioned, class-based DOM diagram | flattens nodes into paragraphs and removes layout metadata | preserves only the flattened labels and caption | readable fallback; defer visual capture or normalization |
| Figure | `figure` markup | preserves the figure, image, and caption | preserves the figure, image, and caption | preserve semantics |
| SVG | inline SVG | preserves the SVG and geometry | removes the SVG because `svg` is forbidden | dedicated SVG policy |
| Math | MathML | preserves both `<math>` elements | removes MathML because `math` is forbidden | dedicated MathML policy |
| Table | semantic table | preserves the table structure | preserves the table structure | preserve the current path |
| Code | `pre` and `code` | preserves the code block and language class | preserves the code block and language class | preserve the current path |
| Animated image | image inside a figure | preserves the image, figure, and caption | preserves the image, figure, and caption | treat it as a normal validated image |
| Native video | `video` with `source` | preserves the video and source | removes both elements because `video` and `source` are forbidden | controlled media rendering later |

### Phase 1 gate

Do not add rich rendering based on assumptions about Defuddle. Complete the fixture table first.

The audit must answer whether each loss occurs:

- in the source-to-Defuddle step; or
- in the client sanitizer.

## Phase 2: Add the extraction contract

Update `shared/extraction.ts` with `ArticleCapabilities` and the legacy-compatible `ExtractedArticle` shape.

Update `worker/extract.ts` to inspect the Defuddle content and return capability flags. Keep extraction failure behavior unchanged.

Add a normalization helper for response validation. The helper must accept a missing capability field from older stored or mocked responses and normalize it to `null`.

Add an additive migration such as:

```text
migrations/0010_article_capabilities.sql
```

Store the new capability object in a nullable `capabilities_json` column. Existing rows remain `NULL`. New rows store validated JSON produced by the Worker.

Update `worker/articleContent.ts` to:

- select `capabilities_json` for stored rows;
- serialize capabilities when saving an extraction; and
- return `capabilities: null` for legacy rows.

Update tests that construct `ExtractedArticle` objects, including:

```text
tests/browser/articleCache.test.ts
tests/browser/fetchArticleContent.test.ts
tests/worker/capture.test.ts
tests/e2e/reader.spec.ts
```

### Phase 2 acceptance criteria

- A new extraction returns all four capability flags.
- A stored new extraction returns the same flags after a second read.
- A legacy row without capability data remains readable.
- A response that omits capabilities remains backward-compatible at the parser boundary.
- Article rendering does not change in this phase.

## Phase 3: Preserve figures and captions

Keep the semantic structure of:

```html
<figure>
  <img>
  <figcaption>
</figure>
```

Add intentional styles in `src/reader/reader.css` for:

```text
figure
figcaption
picture
```

Override the generic image margin inside a figure so the figure does not receive double vertical spacing. Keep figures inside the Reader column and make their contents scale on narrow screens.

Preserve plain image behavior. Do not change image URL policy as part of the CSS work.

If the audit shows that `picture` sources matter, add a URL policy for `source[src]`, `srcset`, and `sizes` before preserving them. The current sanitizer removes `source` and `srcset`. Do not keep those attributes without validating every candidate URL.

Add browser sanitizer tests for:

- figure and caption preservation;
- nested image behavior;
- plain image behavior; and
- unsafe picture source URLs.

### Phase 3 acceptance criteria

- Figures remain grouped with their captions.
- Captions use subordinate typography rather than paragraph typography.
- Wide figures remain inside the Reader column.
- Figures scale on mobile.
- Existing plain images retain their current behavior.

## Phase 4: Add safe static SVG support

Add `src/reader/sanitizeSvg.ts` with an explicit policy for static inline SVG.

Allow only the elements required by the audited fixtures. The initial list may include:

```text
svg
g
path
rect
circle
ellipse
line
polyline
polygon
text
tspan
title
desc
defs
clipPath
mask
linearGradient
radialGradient
stop
```

Allow only validated presentation and geometry attributes, such as:

```text
xmlns
viewBox
width
height
x
y
cx
cy
rx
ry
d
points
fill
stroke
stroke-width
transform
opacity
role
aria-label
aria-hidden
```

Add attributes only when a fixture requires them. Reject these constructs:

```text
script
foreignObject
style attributes
style elements
event handlers
href and xlink:href
external URL references
javascript: URLs
data URLs
embedded HTML
```

Permit local fragment references such as `url(#gradient)` only after validating that the reference stays inside the same SVG. Do not allow external `url(...)` values.

Add limits for the number of SVG elements, the serialized SVG size, and unusually large path attributes. Malformed SVG must fail closed without preventing the rest of the article from opening.

Integrate SVG handling into `sanitizeArticle.ts` without passing safe SVG through an HTML-only policy that removes it again. Traverse the parsed DOM and preserve document order. Do not restore SVG through string replacement.

Add Reader styles for inline SVG sizing and overflow.

Add tests for:

```text
benign paths and shapes
SVG titles and descriptions
script elements
foreignObject
onclick and other event handlers
javascript URLs
external href values
external url(...) references
data URLs
malformed SVG
large SVG input
```

Add an end-to-end fixture that verifies the SVG appears in the Reader and that the existing CSP reports no errors.

### Phase 4 acceptance criteria

- Audited benign diagrams render in the Reader.
- SVG scripts, event handlers, embedded HTML, and external references do not survive.
- Invalid SVG does not break the article.
- SVG does not create unexpected network requests.
- SVG remains readable on narrow screens.
- Static SVG support does not weaken the policy for ordinary article HTML.

## Phase 5: Resolve the Hacktron diagram

Use the Phase 1 audit to choose one result. Do not implement a generic styled-DOM detector before this decision.

### If the diagram is an image or SVG

Preserve it through the existing image or SVG path. Add the Hacktron fixture to the regression suite.

### If the diagram is a simple structured diagram

Define a small Readr-owned representation only for the structures present in the fixture. Render the nodes and connections with Readr-controlled HTML or SVG.

Do not import the source stylesheet. Do not copy source classes into the Reader.

### If the diagram depends on styled HTML, canvas, or JavaScript

Keep the readable text and any source caption or alternative text. Record the visual as unsupported in the fixture decision. Do not claim that the flattened text preserves the diagram’s relationships.

Defer a visual capture or browser-rendered representation to the extension phase. The server cannot create a faithful screenshot of a page that it does not render.

### Phase 5 acceptance criteria

The Hacktron fixture has one documented result:

```text
native image or SVG
Readr-normalized diagram
or explicit fallback
```

The test suite proves that the result is intentional. No source CSS or JavaScript enters the Reader.

## Phase 6: Add an ordered rich-rendering boundary

Start this phase only if controlled React components are required after the SVG and Hacktron work.

Keep sanitized HTML as the default representation. Add an ordered representation for recognized nodes, for example:

```text
HTML segment
Rich SVG or media component
HTML segment
```

The implementation may use DOM traversal and ordered segments. It does not need a general article AST.

Keep the boundary after sanitization. Rich components must receive validated props, not arbitrary source attributes.

Update the actual Reader path in:

```text
src/components/ReaderView.tsx
src/reader/articleCache.ts
```

Add tests that prove rich nodes remain in their original position relative to paragraphs, headings, and captions.

### Phase 6 acceptance criteria

- React-owned rich components render in document order.
- Unknown nodes remain sanitized HTML or are removed safely.
- A rich node cannot inject a component prop from an arbitrary HTML attribute.
- Articles without rich nodes use the existing rendering path.

## Phase 7: Add controlled native media

Support animated images through the existing safe image path. Do not add special rendering for GIF, WebP, or AVIF unless the fixture audit identifies a Reader-specific problem.

For video, add a controlled Reader component only after the ordered rendering boundary exists. Extract and validate only:

```text
src
poster
width
height
controls
loop
muted
playsInline
```

Set these properties in the component rather than copying arbitrary source attributes:

```text
controls
preload="metadata"
```

Do not preserve autoplay, inline event handlers, tracking callbacks, arbitrary `source` nodes, or custom JavaScript controls.

Validate `src` and `poster` with the same HTTP(S) and private-host policy used for article images. Decide separately whether to support captions through a controlled `track` representation.

Respect reduced motion by avoiding autoplay and by keeping playback user-controlled. Do not claim that CSS can pause a native animated GIF. A static GIF fallback requires a separate asset-processing path.

Add tests for:

- animated image URLs;
- controlled video attributes;
- rejected media URLs;
- broken media; and
- reduced-motion behavior that the implementation actually supports.

### Phase 7 acceptance criteria

- Animated images load through the existing image policy.
- Native video renders only through the controlled component.
- Video does not autoplay.
- Broken media does not prevent the article from opening.
- Unsupported media remains absent or has an explicit fallback.

## Phase 8: Add math support

Use the fixture audit to identify the representation returned by Defuddle `0.19.2`.

Prefer sanitized MathML when the supported browsers render it correctly. If Defuddle returns KaTeX HTML, define a separate allowlist for that output instead. Do not remove `math` from `FORBIDDEN_TAGS` without a dedicated policy.

Reject executable or embedded HTML constructs inside mathematical markup. Add a rendering dependency only if the fixtures prove that the current output cannot render acceptably.

Add tests for:

- the audited equation format;
- malicious MathML or embedded HTML;
- malformed equations; and
- an article that contains both equations and ordinary prose.

### Phase 8 acceptance criteria

Technical articles retain equations in the audited format. Invalid mathematical markup fails closed without breaking the article.

## Phase 9: Enrich captures from the browser extension

Treat extension enrichment as a later milestone. The current extension captures URLs and has a separate YouTube enrichment path. It does not yet capture general article HTML or rendered diagrams.

When article capture begins, send structured content rather than arbitrary page HTML:

```ts
{
  articleHtml: string;
  richBlocks: Array<RichBlock>;
}
```

Version the payload and apply limits before storage. Validate and sanitize the payload in the Worker. Keep the Worker authoritative for ownership, size limits, URL policy, and stored content.

Use browser capture for content that does not exist in the server response, including JavaScript-rendered diagrams and visual elements that require layout. Do not execute the captured page inside Readr.

## Test matrix

Maintain a fixture-driven matrix for the complete Reader path:

| Fixture | Expected result |
| --- | --- |
| Plain article | Existing output remains unchanged |
| Article with images | Existing image behavior remains unchanged |
| Figure and caption | Semantic grouping and caption styling survive |
| Benign SVG | SVG renders through the dedicated policy |
| Malicious SVG | Active content and external references are removed |
| Table | Existing table behavior remains unchanged |
| Code | Existing code behavior remains unchanged |
| Math | The audited math representation survives safely |
| Animated image | The image remains a normal validated image |
| Native video | The controlled media component renders |
| Styled DOM diagram | The Hacktron decision is explicit and tested |
| Malformed rich content | The article still opens |

Keep explicit security cases for:

```text
script
onclick and other event handlers
javascript:
foreignObject
external SVG href
external SVG url(...)
data URLs
remote styles
iframe
object
embed
```

Run the focused suites after each phase:

```text
bunx vitest run --config vitest.config.ts
bunx vitest run --config vitest.dom.config.ts
bunx playwright test tests/e2e/reader.spec.ts
```

Run the full project validation before merging:

```text
bun run test
bun run build
bun run lint
```

## Implementation order

Use this order:

```text
1. Audit the fixtures and classify the Hacktron diagram.
2. Add the capability contract and legacy persistence path.
3. Preserve figures and captions.
4. Add safe static SVG support.
5. Complete the Hacktron decision and regression test.
6. Add the ordered rich-rendering boundary if a component requires it.
7. Add controlled native video and other supported media.
8. Add math support based on the audited Defuddle output.
9. Add browser-extension enrichment for rendered content.
```

The first milestone ends after the Hacktron decision and the static SVG, figure, and caption work. Do not move into arbitrary interactive content until those tests pass and the Reader keeps its existing security boundary.
