import type { MediaProgress, SaveMediaProgressInput } from "../../shared/mediaProgress";

type ProgressWriter = (
  input: SaveMediaProgressInput,
  keepalive: boolean,
) => Promise<MediaProgress>;

export class MediaProgressCoordinator {
  private currentTime = 0;
  private duration = 0;
  private playing = false;
  private lastQueuedSnapshot: ProgressSnapshot | null = null;
  private lastQueuedInput: SaveMediaProgressInput | null = null;
  private lastCommittedSnapshot: ProgressSnapshot | null = null;
  private lastKeepaliveRevision: string | null = null;
  private readonly revisionClock = new ProgressRevisionClock();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly write: ProgressWriter;

  constructor(write: ProgressWriter) {
    this.write = write;
  }

  hydrate(progress: MediaProgress | null): number {
    if (progress === null) return 0;
    this.revisionClock.observe(progress.revision);
    this.currentTime = progress.positionSeconds;
    this.duration = progress.durationSeconds;
    this.lastQueuedSnapshot = snapshotFor(progress.positionSeconds, progress.durationSeconds);
    this.lastCommittedSnapshot = this.lastQueuedSnapshot;
    return progress.durationSeconds - progress.positionSeconds > 10
      ? progress.positionSeconds
      : 0;
  }

  recordTime(seconds: number): void {
    this.currentTime = Math.max(0, seconds);
    if (
      this.playing &&
      Math.abs(this.currentTime - (this.lastQueuedSnapshot?.positionSeconds ?? 0)) >= 20
    ) {
      this.persist(false);
    }
  }

  recordDuration(seconds: number): void {
    this.duration = Math.max(0, seconds);
  }

  recordPlaying(playing: boolean): void {
    const paused = this.playing && !playing;
    this.playing = playing;
    if (paused) this.persist(false);
  }

  flush(): void {
    this.persist(true);
  }

  private persist(keepalive: boolean): void {
    if (this.duration <= 0) return;
    const positionSeconds = Math.min(this.currentTime, this.duration);
    const snapshot = snapshotFor(positionSeconds, this.duration);

    if (keepalive) {
      if (sameSnapshot(snapshot, this.lastCommittedSnapshot) && this.lastQueuedInput === null) {
        return;
      }
      const input = sameSnapshot(snapshot, this.lastQueuedSnapshot) && this.lastQueuedInput !== null
        ? this.lastQueuedInput
        : this.queueSnapshot(snapshot);
      if (this.lastKeepaliveRevision === input.revision) return;
      this.lastKeepaliveRevision = input.revision;
      void this.write(input, true)
        .then((progress) => this.accept(progress, input, snapshot))
        .catch(() => this.restoreDirtySnapshot(snapshot, input.revision));
      return;
    }

    if (sameSnapshot(snapshot, this.lastQueuedSnapshot)) return;
    const input = this.queueSnapshot(snapshot);

    this.writeQueue = this.writeQueue
      .then(() => this.write(input, false))
      .then((progress) => this.accept(progress, input, snapshot))
      .catch(() => this.restoreDirtySnapshot(snapshot, input.revision));
  }

  private queueSnapshot(snapshot: ProgressSnapshot): SaveMediaProgressInput {
    this.lastQueuedSnapshot = snapshot;
    const input: SaveMediaProgressInput = {
      ...snapshot,
      revision: this.revisionClock.next(),
    };
    this.lastQueuedInput = input;
    return input;
  }

  private accept(
    progress: MediaProgress,
    attempted: SaveMediaProgressInput,
    snapshot: ProgressSnapshot,
  ): void {
    this.revisionClock.observe(progress.revision);
    const committed = progress.revision === attempted.revision &&
      sameSnapshot(progress, snapshot);
    if (committed) {
      this.lastCommittedSnapshot = snapshot;
      if (this.lastQueuedInput?.revision === attempted.revision) {
        this.lastQueuedInput = null;
        this.lastQueuedSnapshot = snapshot;
      }
      if (this.lastKeepaliveRevision === attempted.revision) {
        this.lastKeepaliveRevision = null;
      }
    } else {
      this.restoreDirtySnapshot(snapshot, attempted.revision);
    }
  }

  private restoreDirtySnapshot(failedSnapshot: ProgressSnapshot, failedRevision: string): void {
    if (
      sameSnapshot(this.lastQueuedSnapshot, failedSnapshot) &&
      this.lastQueuedInput?.revision === failedRevision
    ) {
      this.lastQueuedSnapshot = null;
      this.lastQueuedInput = null;
    }
    if (this.lastKeepaliveRevision === failedRevision) {
      this.lastKeepaliveRevision = null;
    }
  }
}

type ProgressSnapshot = Pick<SaveMediaProgressInput, "positionSeconds" | "durationSeconds">;

function snapshotFor(positionSeconds: number, durationSeconds: number): ProgressSnapshot {
  return { positionSeconds, durationSeconds };
}

function sameSnapshot(left: ProgressSnapshot | null, right: ProgressSnapshot | null): boolean {
  return left?.positionSeconds === right?.positionSeconds &&
    left?.durationSeconds === right?.durationSeconds;
}

class ProgressRevisionClock {
  private lastRevision = "";
  private sequence = 0;
  private readonly writerId = crypto.randomUUID().replaceAll("-", "");

  observe(revision: string): void {
    if (revision > this.lastRevision) this.lastRevision = revision;
  }

  next(): string {
    const observedTimestamp = Number(this.lastRevision.slice(0, 13)) || 0;
    let timestamp = Math.max(Date.now(), observedTimestamp);
    this.sequence += 1;
    let revision = formatRevision(timestamp, this.writerId, this.sequence);
    if (revision <= this.lastRevision) {
      timestamp = observedTimestamp + 1;
      this.sequence = 1;
      revision = formatRevision(timestamp, this.writerId, this.sequence);
    }
    this.lastRevision = revision;
    return revision;
  }
}

function formatRevision(timestamp: number, writerId: string, sequence: number): string {
  return `${String(timestamp).padStart(13, "0")}-${writerId}-${String(sequence).padStart(10, "0")}`;
}
