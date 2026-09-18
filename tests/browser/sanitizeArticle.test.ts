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

  it("preserves the existing plain image behavior", () => {
    const result = sanitizeArticleHtml(
      '<img src="/cover.jpg" alt="Cover image">',
      "https://example.com/articles/one",
    );

    expect(result).toContain('src="https://example.com/cover.jpg"');
    expect(result).toContain('loading="lazy"');
    expect(result).toContain('alt="Cover image"');
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
