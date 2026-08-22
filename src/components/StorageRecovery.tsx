import { useEffect, useRef, useState } from "react";
import type { Item } from "../item";
import type { LoadItemsResult } from "../itemStorage";

type RecoveryState = Extract<LoadItemsResult, { kind: "corrupt" | "unsupported" }>;

type StorageRecoveryProps = {
  recovery: RecoveryState;
  error: string | null;
  onAccept: (items: Item[]) => boolean;
};

export function StorageRecovery({ recovery, error, onAccept }: StorageRecoveryProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const raw = recovery.raw;
  const recoveredItems = recovery.kind === "corrupt" ? recovery.recoveredItems : [];

  useEffect(() => headingRef.current?.focus(), []);

  function downloadBackup() {
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `readr-library-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }

  return (
    <main className="app recovery-page">
      <section className="recovery-panel" aria-labelledby="recovery-title">
        <p className="section-kicker">Storage recovery</p>
        <h1 ref={headingRef} id="recovery-title" tabIndex={-1}>
          Your saved library needs attention
        </h1>
        <p role="alert">
          {recovery.kind === "unsupported"
            ? `This library uses newer storage version ${recovery.version}. readr will not overwrite it.`
            : "Some saved data could not be read. The original value has not been changed."}
        </p>
        {recovery.kind === "corrupt" && (
          <p>
            {recoveredItems.length} item{recoveredItems.length === 1 ? "" : "s"} can be recovered.
            {recovery.rejectedCount > 0 && ` ${recovery.rejectedCount} invalid record${recovery.rejectedCount === 1 ? " was" : "s were"} omitted.`}
            {recovery.deskOverflowCount > 0 && ` ${recovery.deskOverflowCount} extra desk item${recovery.deskOverflowCount === 1 ? " will" : "s will"} return to the inbox.`}
          </p>
        )}
        {error !== null && <p className="form-error" role="alert">{error}</p>}
        <div className="recovery-actions">
          <button type="button" onClick={downloadBackup}>Download original data</button>
          {recoveredItems.length > 0 && (
            <button type="button" onClick={() => onAccept(recoveredItems)}>
              Use recovered items
            </button>
          )}
          {!confirmReset ? (
            <button type="button" onClick={() => setConfirmReset(true)}>Start empty</button>
          ) : (
            <span className="recovery-confirm">
              <span>This replaces the saved library.</span>
              <button type="button" onClick={() => onAccept([])}>Confirm start empty</button>
              <button type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
            </span>
          )}
        </div>
      </section>
    </main>
  );
}
