import { useEffect, useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { Item } from "../../shared/item";

type DiscardConfirmationDialogProps = {
  item: Item | null;
  onCancel: () => void;
  onConfirm: (item: Item) => Promise<boolean>;
};

export function DiscardConfirmationDialog({
  item,
  onCancel,
  onConfirm,
}: DiscardConfirmationDialogProps) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPending(false);
    setFailed(false);
  }, [item?.id]);

  async function confirmDiscard() {
    if (item === null || pending) return;

    setPending(true);
    setFailed(false);
    try {
      if (await onConfirm(item)) onCancel();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog.Root
      open={item !== null}
      onOpenChange={(open, eventDetails) => {
        if (!open && pending) {
          eventDetails.cancel();
          return;
        }

        if (!open) onCancel();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="discard-dialog-backdrop" />
        <AlertDialog.Popup className="discard-dialog">
          {item !== null && (
            <>
              <div className="discard-dialog__intro">
                <AlertDialog.Title className="discard-dialog__title">
                  Discard "{item.title}"?
                </AlertDialog.Title>
                <AlertDialog.Description className="discard-dialog__description">
                  {failed
                    ? "Unable to discard this item. Try again."
                    : "This permanently removes the item. This action cannot be undone."}
                </AlertDialog.Description>
              </div>
              <div className="discard-dialog__actions">
                <AlertDialog.Close
                  type="button"
                  className="quiet-button"
                  disabled={pending}
                >
                  Cancel
                </AlertDialog.Close>
                <button
                  type="button"
                  className="quiet-button discard discard-dialog__confirm"
                  data-variant="destructive"
                  disabled={pending}
                  aria-busy={pending}
                  onClick={() => void confirmDiscard()}
                >
                  {pending ? (
                    <>
                      <span className="button-spinner" aria-hidden="true" />
                      <span>Discarding…</span>
                    </>
                  ) : (
                    "Discard"
                  )}
                </button>
              </div>
            </>
          )}
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
