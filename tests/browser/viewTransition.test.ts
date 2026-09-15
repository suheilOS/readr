import { afterEach, describe, expect, it, vi } from "vitest";
import { commitWithViewTransition } from "../../src/viewTransition";

function installTransition(start: (update: () => void) => Pick<ViewTransition, "updateCallbackDone">) {
  const mock = vi.fn(start);
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: mock });
  return mock;
}

function setReducedMotion(matches: boolean) {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches })));
}

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  vi.unstubAllGlobals();
});

describe("commitWithViewTransition", () => {
  it("commits immediately when view transitions are unavailable", async () => {
    const update = vi.fn();
    await commitWithViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("commits inside a supported view transition", async () => {
    setReducedMotion(false);
    const update = vi.fn();
    const start = installTransition((callback) => ({ updateCallbackDone: Promise.resolve().then(callback) }));
    await commitWithViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("waits for the native update promise, not the animation duration", async () => {
    setReducedMotion(false);
    let commit!: () => void;
    installTransition((callback) => ({
      updateCallbackDone: new Promise<void>((resolve) => { commit = () => { callback(); resolve(); }; }),
    }));
    const update = vi.fn();
    const done = vi.fn();
    const result = commitWithViewTransition(update).then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    commit();
    await result;
    expect(update).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledOnce();
  });

  it("falls back exactly once if the snapshot fails before its callback", async () => {
    setReducedMotion(false);
    let commit!: () => void;
    installTransition((callback) => {
      commit = callback;
      return { updateCallbackDone: Promise.reject(new Error("Snapshot failed")) };
    });
    const update = vi.fn();
    await commitWithViewTransition(update);
    commit();
    expect(update).toHaveBeenCalledOnce();
  });

  it("falls back if starting the transition throws", async () => {
    setReducedMotion(false);
    installTransition(() => { throw new Error("Unsupported state"); });
    const update = vi.fn();
    await commitWithViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("propagates update errors without replaying a partial commit", async () => {
    setReducedMotion(false);
    installTransition((callback) => ({ updateCallbackDone: Promise.resolve().then(callback) }));
    const update = vi.fn(() => { throw new Error("Update failed"); });
    await expect(commitWithViewTransition(update)).rejects.toThrow("Update failed");
    expect(update).toHaveBeenCalledOnce();
  });

  it("commits immediately when reduced motion is preferred", async () => {
    setReducedMotion(true);
    const update = vi.fn();
    const start = installTransition(() => ({ updateCallbackDone: Promise.resolve() }));
    await commitWithViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});
