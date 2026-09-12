import { afterEach, describe, expect, it, vi } from "vitest";
import { commitWithViewTransition } from "../../src/viewTransition";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

const viewTransitionDocument = document as ViewTransitionDocument;

function setReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches })));
}

afterEach(() => {
  delete viewTransitionDocument.startViewTransition;
  vi.unstubAllGlobals();
});

describe("commitWithViewTransition", () => {
  it("commits immediately when view transitions are unavailable", () => {
    const update = vi.fn();

    commitWithViewTransition(update);

    expect(update).toHaveBeenCalledOnce();
  });

  it("commits inside a supported view transition", () => {
    setReducedMotion(false);
    const update = vi.fn();
    const startViewTransition = vi.fn((callback: () => void) => callback());
    viewTransitionDocument.startViewTransition = startViewTransition;

    commitWithViewTransition(update);

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("commits immediately when reduced motion is preferred", () => {
    setReducedMotion(true);
    const update = vi.fn();
    const startViewTransition = vi.fn();
    viewTransitionDocument.startViewTransition = startViewTransition;

    commitWithViewTransition(update);

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
