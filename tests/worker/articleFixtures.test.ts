import { describe, expect, it } from "vitest";
import {
  articleFixtures,
  countTags,
  extractFixture,
} from "../fixtures/articleFixtures";

describe("Defuddle article fixtures", () => {
  it.each(articleFixtures)("extracts readable content from $name", (fixture) => {
    const result = extractFixture(fixture);

    expect(result.content.trim()).not.toBe("");
    expect(result.title.trim()).not.toBe("");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("preserves semantic rich elements in the normal output", () => {
    expect(countTags(extractFixture(findFixture("figure")).content, "figure")).toBe(1);
    expect(countTags(extractFixture(findFixture("figure")).content, "figcaption")).toBe(1);
    expect(countTags(extractFixture(findFixture("svg")).content, "svg")).toBe(1);
    expect(countTags(extractFixture(findFixture("table")).content, "table")).toBe(1);
    expect(countTags(extractFixture(findFixture("code")).content, "pre")).toBe(1);
    expect(countTags(extractFixture(findFixture("code")).content, "code")).toBe(1);
    expect(countTags(extractFixture(findFixture("math")).content, "math")).toBe(2);
    expect(countTags(extractFixture(findFixture("animated-image")).content, "img")).toBe(1);
    expect(countTags(extractFixture(findFixture("video")).content, "video")).toBe(1);
    expect(countTags(extractFixture(findFixture("video")).content, "source")).toBe(1);
  });

  it("removes news-page chrome while preserving the article body", () => {
    const result = extractFixture(findFixture("news"));

    expect(result.content).toContain("The city council approved a new public library");
    expect(result.content).not.toContain("Most read stories");
    expect(result.content).not.toContain("Copyright Example News");
    expect(result.content).not.toContain("Latest");
  });

  it("shows the Hacktron diagram loss between normal and debug output", () => {
    const fixture = findFixture("hacktron");
    const normal = extractFixture(fixture);
    const debug = extractFixture(fixture, true);

    expect(fixture.html).toContain("class=\"exploit-chain\"");
    expect(fixture.html).toContain("class=\"chain-arrow arrow-one\"");
    expect(normal.content).toContain("<figure>");
    expect(normal.content).toContain("<strong>libheif</strong>");
    expect(normal.content).not.toContain("exploit-chain");
    expect(normal.content).not.toContain("chain-arrow");
    expect(debug.content).toContain("class=\"exploit-chain\"");
    expect(debug.content).toContain("class=\"exploit-node node-libheif\"");
    expect(debug.content).toContain("class=\"exploit-node node-debian\"");
    expect(debug.content).toContain("class=\"exploit-node node-magick\"");
  });
});

function findFixture(name: string) {
  const fixture = articleFixtures.find((candidate) => candidate.name === name);
  if (fixture === undefined) {
    throw new Error(`Missing article fixture: ${name}`);
  }
  return fixture;
}
