import { describe, expect, it } from "vitest";
import {
  articleFixtures,
  countTags,
  extractFixtureFromDocument,
} from "../fixtures/articleFixtures";
import { sanitizeArticleHtml } from "../../src/reader/sanitizeArticle";

describe("sanitized Defuddle article fixtures", () => {
  it.each(articleFixtures)("records the Reader output for $name", (fixture) => {
    const defuddle = extractFixtureFromDocument(
      fixture,
      new DOMParser().parseFromString(fixture.html, "text/html"),
    );
    const sanitized = sanitizeArticleHtml(
      defuddle.content,
      `https://fixtures.example/${fixture.name}`,
    );

    expect(sanitized.trim()).not.toBe("");

    if (fixture.name === "svg") {
      expect(countTags(defuddle.content, "svg")).toBe(1);
      expect(countTags(sanitized, "svg")).toBe(0);
      return;
    }

    if (fixture.name === "math") {
      expect(countTags(defuddle.content, "math")).toBe(2);
      expect(countTags(sanitized, "math")).toBe(0);
      return;
    }

    if (fixture.name === "video") {
      expect(countTags(defuddle.content, "video")).toBe(1);
      expect(countTags(defuddle.content, "source")).toBe(1);
      expect(countTags(sanitized, "video")).toBe(0);
      expect(countTags(sanitized, "source")).toBe(0);
      return;
    }

    if (fixture.name === "hacktron") {
      expect(countTags(defuddle.content, "div")).toBe(0);
      expect(countTags(sanitized, "div")).toBe(0);
      expect(sanitized).toContain("libheif");
      expect(sanitized).toContain("The exploit chain links the decoder");
      return;
    }

    expect(countTags(sanitized, "figure")).toBe(
      fixture.name === "figure" || fixture.name === "animated-image" ? 1 : countTags(defuddle.content, "figure"),
    );
  });

  it("keeps the semantic figure structure in the Reader output", () => {
    const fixture = articleFixtures.find((candidate) => candidate.name === "figure");
    if (fixture === undefined) throw new Error("Missing figure fixture");

    const sanitized = sanitizeArticleHtml(
      extractFixtureFromDocument(
        fixture,
        new DOMParser().parseFromString(fixture.html, "text/html"),
      ).content,
      "https://fixtures.example/figure",
    );

    expect(countTags(sanitized, "figure")).toBe(1);
    expect(countTags(sanitized, "img")).toBe(1);
    expect(countTags(sanitized, "figcaption")).toBe(1);
    expect(sanitized).toContain("The review loop keeps each release small");
  });
});
