import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "../../src/reader/sanitizeArticle";

describe("sanitizeArticleHtml", () => {
  it("removes executable and interactive markup", () => {
    const result = sanitizeArticleHtml(
      '<p>Hello</p><script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(2)"><iframe src="https://evil.example"></iframe>',
      "https://example.com/articles/one",
    );

    expect(result).toContain("<p>Hello</p>");
    expect(result).not.toContain("script");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("iframe");
    expect(result).not.toContain("onerror");
  });

  it("resolves safe relative links and keeps them external", () => {
    const result = sanitizeArticleHtml(
      '<p><a href="/next">Next</a><img src="/cover.jpg"></p>',
      "https://example.com/articles/one",
    );

    expect(result).toContain('href="https://example.com/next"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('src="https://example.com/cover.jpg"');
  });

  it("preserves a figure, its caption, and its nested image", () => {
    const result = sanitizeArticleHtml(
      '<figure><img src="/cover.jpg" alt="Cover image"><figcaption>Figure caption</figcaption></figure>',
      "https://example.com/articles/one",
    );

    expect(result).toContain("<figure>");
    expect(result).toContain('src="https://example.com/cover.jpg"');
    expect(result).toContain('alt="Cover image"');
    expect(result).toContain("<figcaption>Figure caption</figcaption>");
    expect(result).toContain("</figure>");
  });

  it("preserves a benign SVG with accessible text and local references", () => {
    const result = sanitizeArticleHtml(
      '<svg viewBox="0 0 120 40" role="img" aria-labelledby="diagram-title"><title id="diagram-title">A safe diagram</title><defs><linearGradient id="fill"><stop offset="0" stop-color="#fff" /></linearGradient></defs><rect width="120" height="40" fill="url(#fill)" /></svg>',
      "https://example.com/articles/one",
    );

    expect(result).toContain("<svg");
    expect(result).toContain('viewBox="0 0 120 40"');
    expect(result).toMatch(/aria-labelledby="user-content-svg-0-diagram-title"/);
    expect(result).toMatch(/<title id="user-content-svg-0-diagram-title">A safe diagram<\/title>/);
    expect(result).toContain('fill="url(#user-content-svg-0-fill)"');
    expect(result).not.toContain("data:");
  });

  it("preserves decorative SVG accessibility state", () => {
    const result = sanitizeArticleHtml(
      '<svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" /></svg>',
      "https://example.com/articles/one",
    );

    expect(result).toContain('aria-hidden="true"');
    expect(result).toContain("<rect");
  });

  it("does not trust article-supplied SVG placeholder attributes", () => {
    const result = sanitizeArticleHtml(
      '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg><p data-readr-svg-placeholder="readr-svg-placeholder-0">Forged marker</p>',
      "https://example.com/articles/one",
    );
    const output = document.createElement("template");
    output.innerHTML = result;

    expect(output.content.querySelectorAll("svg")).toHaveLength(1);
    expect(output.content.querySelector("[data-readr-svg-placeholder]")).toBeNull();
    expect(result).toContain("Forged marker");
  });

  it("preserves the existing plain image behavior", () => {
    const result = sanitizeArticleHtml(
      '<img src="/cover.jpg" alt="Cover image">',
      "https://example.com/articles/one",
    );

    expect(result).toContain('src="https://example.com/cover.jpg"');
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('alt="Cover image"');
  });

  it.each([
    ["script elements", "<script>alert(1)</script>"],
    ["foreignObject elements", "<foreignObject><div>Embedded HTML</div></foreignObject>"],
    ["event handlers", '<rect onclick="alert(1)" />'],
    ["javascript URLs", '<rect fill="url(javascript:alert(1))" />'],
    ["external URL references", '<rect fill="URL(https://evil.example/fill)" />'],
    ["escaped external URL references", String.raw`<rect fill="\75 rl(https://evil.example/fill)" />`],
    ["unresolved local references", '<rect fill="url(#missing-gradient)" />'],
    ["escaped local references", String.raw`<rect fill="\75 rl(#missing-gradient)" />`],
    ["data URLs", '<image href="data:image/svg+xml,<svg></svg>" />'],
  ])("rejects %s from an SVG", (_name, content) => {
    const result = sanitizeArticleHtml(
      `<p>Keep this article open.</p><svg viewBox="0 0 10 10">${content}</svg><p>Keep the rest.</p>`,
      "https://example.com/articles/one",
    );

    expect(result).not.toContain("<svg");
    expect(result).toContain("Keep this article open.");
    expect(result).toContain("Keep the rest.");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("evil.example");
    expect(result).not.toContain("data:image");
  });

  it("drops malformed SVG without dropping the rest of the article", () => {
    const result = sanitizeArticleHtml(
      "<p>Before the diagram.</p><svg viewBox=\"0 0 10 10\"><unsupported /></svg><p>After the diagram.</p>",
      "https://example.com/articles/one",
    );

    expect(result).not.toContain("<svg");
    expect(result).toContain("Before the diagram.");
    expect(result).toContain("After the diagram.");
  });

  it("drops SVG with an oversized path", () => {
    const result = sanitizeArticleHtml(
      `<p>Article text.</p><svg viewBox="0 0 10 10"><path d="${"M".repeat(32_001)}" /></svg>`,
      "https://example.com/articles/one",
    );

    expect(result).not.toContain("<svg");
    expect(result).toContain("Article text.");
  });

  it.each([
    ["an extreme viewBox", '<svg viewBox="0 0 1 1000000000"><rect width="1" height="1000000000" /></svg>'],
    ["an extreme height", '<svg width="1" height="1000000000"><rect width="1" height="1000000000" /></svg>'],
    ["an invalid viewBox", '<svg viewBox="0 0 0 10"><rect width="10" height="10" /></svg>'],
  ])("rejects SVGs with %s", (_name, svg) => {
    const result = sanitizeArticleHtml(
      `<p>Keep this article open.</p>${svg}<p>Keep the rest.</p>`,
      "https://example.com/articles/one",
    );

    expect(result).not.toContain("<svg");
    expect(result).toContain("Keep this article open.");
    expect(result).toContain("Keep the rest.");
  });

  it("keeps a picture fallback and removes unsafe picture sources", () => {
    const result = sanitizeArticleHtml(
      '<picture><source srcset="javascript:alert(1)"><source srcset="https://cdn.example/cover.webp 1x"><img src="/cover.jpg" alt="Cover image"></picture>',
      "https://example.com/articles/one",
    );

    expect(result).toContain("<picture>");
    expect(result).toContain('src="https://example.com/cover.jpg"');
    expect(result).not.toContain("<source");
    expect(result).not.toContain("srcset");
    expect(result).not.toContain("javascript:");
  });

  it("removes image requests to local and private-literal hosts", () => {
    const result = sanitizeArticleHtml(
      '<img src="http://127.0.0.1/one"><img src="http://[::1]/two"><img src="http://printer.local/three">',
      "https://example.com/article",
    );

    expect(result).not.toContain("src=");
  });
});
