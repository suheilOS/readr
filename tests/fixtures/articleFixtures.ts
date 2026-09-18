/// <reference types="vite/client" />

import Defuddle from "defuddle";
import { parseHTML } from "linkedom/worker";
import animatedImageHtml from "./articles/animated-image.html?raw";
import codeHtml from "./articles/code.html?raw";
import figureHtml from "./articles/figure.html?raw";
import hacktronHtml from "./articles/hacktron.html?raw";
import mathHtml from "./articles/math.html?raw";
import newsHtml from "./articles/news.html?raw";
import plainHtml from "./articles/plain.html?raw";
import svgHtml from "./articles/svg.html?raw";
import tableHtml from "./articles/table.html?raw";
import videoHtml from "./articles/video.html?raw";

export const articleFixtures = [
  { name: "plain", html: plainHtml },
  { name: "news", html: newsHtml },
  { name: "figure", html: figureHtml },
  { name: "svg", html: svgHtml },
  { name: "table", html: tableHtml },
  { name: "code", html: codeHtml },
  { name: "math", html: mathHtml },
  { name: "animated-image", html: animatedImageHtml },
  { name: "video", html: videoHtml },
  { name: "hacktron", html: hacktronHtml },
] as const;

export type ArticleFixture = (typeof articleFixtures)[number];

export type DefuddleFixtureResult = {
  content: string;
  title: string;
  author: string;
  wordCount: number;
};

export function extractFixture(
  fixture: ArticleFixture,
  debug = false,
): DefuddleFixtureResult {
  return extractFixtureFromDocument(fixture, parseHTML(fixture.html).document, debug);
}

export function extractFixtureFromDocument(
  fixture: ArticleFixture,
  document: Document,
  debug = false,
): DefuddleFixtureResult {
  const result = new Defuddle(document, {
    debug,
    url: `https://fixtures.example/${fixture.name}`,
    useAsync: false,
  }).parse();

  return {
    content: result.content,
    title: result.title,
    author: result.author,
    wordCount: result.wordCount,
  };
}

export function countTags(html: string, tagName: string): number {
  return parseHTML(html).document.querySelectorAll(tagName).length;
}
