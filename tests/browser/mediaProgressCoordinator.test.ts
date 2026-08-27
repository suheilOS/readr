import { describe, expect, it, vi } from "vitest";
import type { MediaProgress, SaveMediaProgressInput } from "../../shared/mediaProgress";
import { MediaProgressCoordinator } from "../../src/reader/mediaProgressCoordinator";

describe("MediaProgressCoordinator", () => {
  it("serializes periodic writes and assigns increasing revisions", async () => {
    const first = deferred<MediaProgress>();
    const writes: SaveMediaProgressInput[] = [];
    const coordinator = new MediaProgressCoordinator((input) => {
      writes.push(input);
      return writes.length === 1
        ? first.promise
        : Promise.resolve(progressFor(input));
    });

    coordinator.recordDuration(300);
    coordinator.recordPlaying(true);
    coordinator.recordTime(20);
    coordinator.recordTime(40);
    await Promise.resolve();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ positionSeconds: 20, durationSeconds: 300 });

    first.resolve(progressFor(writes[0]));
    await vi.waitFor(() => {
      expect(writes).toHaveLength(2);
    });
    expect(writes[1]).toMatchObject({ positionSeconds: 40, durationSeconds: 300 });
    expect(writes[1].revision > writes[0].revision).toBe(true);
  });

  it("continues revisions from loaded progress and restarts completed media", () => {
    const writes: SaveMediaProgressInput[] = [];
    const coordinator = new MediaProgressCoordinator((input) => {
      writes.push(input);
      return Promise.resolve(progressFor(input));
    });
    const initialPosition = coordinator.hydrate({
      positionSeconds: 295,
      durationSeconds: 300,
      revision: "1756339200000-00000000000000000000000000000001-0000000007",
      updatedAt: "2026-08-28T00:00:00.000Z",
    });

    expect(initialPosition).toBe(0);
    coordinator.recordTime(10);
    coordinator.flush();
    expect(writes[0]).toMatchObject({ positionSeconds: 10, durationSeconds: 300 });
    expect(writes[0].revision > "1756339200000-00000000000000000000000000000001-0000000007").toBe(true);
  });

  it("jumps past a far-future persisted revision in constant time", () => {
    const writes: SaveMediaProgressInput[] = [];
    const coordinator = coordinatorRecording(writes);
    const futureRevision = "9999999999998-ffffffffffffffffffffffffffffffff-9999999999";
    coordinator.hydrate({
      positionSeconds: 10,
      durationSeconds: 300,
      revision: futureRevision,
      updatedAt: "2026-08-28T00:00:00.000Z",
    });

    coordinator.recordTime(30);
    coordinator.flush();

    expect(writes).toHaveLength(1);
    expect(writes[0].revision.startsWith("9999999999999-")).toBe(true);
    expect(writes[0].revision > futureRevision).toBe(true);
  });

  it("deduplicates lifecycle flushes and produces unique revisions across coordinators", () => {
    const firstWrites: SaveMediaProgressInput[] = [];
    const secondWrites: SaveMediaProgressInput[] = [];
    const first = coordinatorRecording(firstWrites);
    const second = coordinatorRecording(secondWrites);

    for (const coordinator of [first, second]) {
      coordinator.recordDuration(300);
      coordinator.recordTime(45);
      coordinator.flush();
      coordinator.flush();
    }

    expect(firstWrites).toHaveLength(1);
    expect(secondWrites).toHaveLength(1);
    expect(firstWrites[0].revision).not.toBe(secondWrites[0].revision);
    expect([firstWrites[0].revision, secondWrites[0].revision].sort()).toHaveLength(2);
  });

  it("makes a superseded local snapshot dirty so it can retry", async () => {
    const writes: SaveMediaProgressInput[] = [];
    const winningRevision = "9999999999998-ffffffffffffffffffffffffffffffff-9999999999";
    const coordinator = new MediaProgressCoordinator((input) => {
      writes.push(input);
      return Promise.resolve(writes.length === 1
        ? {
            positionSeconds: 90,
            durationSeconds: 300,
            revision: winningRevision,
            updatedAt: "2026-08-28T00:00:00.000Z",
          }
        : progressFor(input));
    });
    coordinator.recordDuration(300);
    coordinator.recordTime(45);
    coordinator.flush();
    await vi.waitFor(() => expect(writes).toHaveLength(1));

    coordinator.flush();

    await vi.waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ positionSeconds: 45, durationSeconds: 300 });
    expect(writes[1].revision > winningRevision).toBe(true);
  });
});

function coordinatorRecording(writes: SaveMediaProgressInput[]): MediaProgressCoordinator {
  return new MediaProgressCoordinator((input) => {
    writes.push(input);
    return Promise.resolve(progressFor(input));
  });
}

function progressFor(input: SaveMediaProgressInput): MediaProgress {
  return { ...input, updatedAt: "2026-08-28T00:00:00.000Z" };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}
