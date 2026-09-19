# Rich Reader fixture audit

This audit records where the current Readr pipeline loses rich article content.

The pipeline under test is:

```text
checked-in HTML fixture
    ↓
Defuddle 0.19.2
    ↓
DOMPurify in `sanitizeArticleHtml`
```

The audit uses Defuddle's normal output for the Reader path. It uses `debug: true` only to inspect structure that normal extraction removes. Debug output is not a production rendering input.

## Findings

| Fixture | Source form | Defuddle output | Sanitizer output | Reader decision |
| --- | --- | --- | --- | --- |
| `plain` | Article prose | Keeps the article paragraphs | Keeps the paragraphs | Preserve the current path |
| `news` | Article with header, navigation, aside, and footer | Removes page chrome and keeps the article body | Keeps the article body | Preserve the current path |
| `figure` | `<figure>` with `<img>` and `<figcaption>` | Keeps the figure, image, and caption | Keeps the figure, image, and caption | Preserve the semantic figure |
| `svg` | Inline static SVG inside a figure | Keeps the SVG, geometry, title, and description | Preserves the SVG through the dedicated static SVG policy | Render the safe SVG with Reader-controlled sizing |
| `table` | Semantic table with caption and headers | Keeps the table structure | Keeps the table structure | Preserve the current path |
| `code` | `<pre><code>` with a language class | Keeps the code block and `language-ts` class | Keeps the code block and class | Preserve the current path |
| `math` | Block and inline MathML | Keeps both `<math>` elements | Removes both elements because `math` is forbidden | Add a dedicated MathML policy after the contract |
| `animated-image` | Image URL with a WebP filename inside a figure | Keeps the image, figure, and caption | Keeps the image, figure, and caption | Treat it as a normal validated image |
| `video` | Native `<video>` with `<source>` | Keeps the video and source | Removes both elements because `video` and `source` are forbidden | Add controlled media rendering later |
| `hacktron` | Positioned DOM nodes with classes, inline layout, and arrow spans | Flattens the nodes into paragraphs and removes the layout metadata and arrows | Preserves only the flattened labels and caption | Use an explicit text fallback; defer visual capture or normalization |

## Hacktron result

The repository does not contain the source HTML or a URL for the original Hacktron page. The checked-in `hacktron.html` fixture reproduces the reported failure mode: a figure contains positioned `div` nodes, class names, inline layout, and arrows marked `aria-hidden`.

Normal Defuddle output contains the labels as separate paragraphs:

```html
<figure>
  <p><strong>libheif</strong> Image decoder</p>
  <p><strong>Debian</strong> Missing security backport</p>
  <p><strong>ImageMagick</strong> Uses libheif</p>
  <figcaption>...</figcaption>
</figure>
```

Debug output keeps the node structure and class names, but it still does not keep the source stylesheet. The arrows are removed by Defuddle's hidden-element handling because the fixture marks them `aria-hidden`.

The server-only Reader cannot recover the relationships from normal output. It must not import the source stylesheet or run the source page's JavaScript. Phase 1 therefore records the decision as a readable fallback. A later browser-capture path can provide a visual fallback from the rendered page, or a future normalizer can handle a known diagram structure.

## Loss locations

- Figures, tables, code, animated-image markup, and ordinary prose survive both extraction stages.
- SVG survives Defuddle and the dedicated static SVG sanitizer.
- MathML survives Defuddle and is lost by the client sanitizer.
- Native video and its source survive Defuddle and are lost by the client sanitizer.
- The Hacktron layout is lost during normal Defuddle extraction. The sanitizer receives only the flattened labels.

The audit is implemented by:

- `tests/fixtures/articles/`, which contains the checked-in source pages;
- `tests/fixtures/articleFixtures.ts`, which runs Defuddle against each fixture; and
- `tests/worker/articleFixtures.test.ts` and `tests/browser/articleFixtureAudit.test.ts`, which check extraction and sanitizer output.
