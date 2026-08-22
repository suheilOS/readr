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

  it("removes image requests to local and private-literal hosts", () => {
    const result = sanitizeArticleHtml(
      '<img src="http://127.0.0.1/one"><img src="http://[::1]/two"><img src="http://printer.local/three">',
      "https://example.com/article",
    );

    expect(result).not.toContain("src=");
  });
});
