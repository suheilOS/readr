import { useState, type FormEvent, type Ref } from "react";
import { TypeSelect } from "./TypeSelect";
import { notify } from "../notifications";
import type { CaptureInput } from "../../shared/capture";
import {
  DEFAULT_ITEM_TYPE,
  parseItemUrl,
  type Item,
  type ItemType,
} from "../../shared/item";

export type NewItemInput = Pick<Item, "title" | "url" | "type">;

export type AddItemFormState = "idle" | "submitting";
type CaptureMode = "quick" | "manual";

type AddItemFormProps = {
  onAdd: (input: NewItemInput) => Promise<boolean>;
  onCapture: (input: CaptureInput) => Promise<boolean>;
  onCancel: () => void;
  state: AddItemFormState;
  formId?: string;
  urlRef?: Ref<HTMLInputElement>;
};

export function AddItemForm({ onAdd, onCapture, onCancel, state, formId, urlRef }: AddItemFormProps) {
  const [mode, setMode] = useState<CaptureMode>("quick");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [typeOverride, setTypeOverride] = useState<ItemType | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const submitting = state === "submitting";
  const manual = mode === "manual";
  const titleErrorId = `${formId ?? "add-item"}-title-error`;
  const urlErrorId = `${formId ?? "add-item"}-url-error`;

  function resetForm(): void {
    setMode("quick");
    setTitle("");
    setUrl("");
    setTypeOverride(null);
    setTitleError(false);
    setUrlError(false);
  }

  function changeMode(nextMode: CaptureMode): void {
    if (submitting) return;
    setMode(nextMode);
    setTitleError(false);
    setUrlError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state !== "idle") return;

    const trimmedUrl = url.trim();
    const parsedUrl = trimmedUrl.length === 0 ? null : parseItemUrl(trimmedUrl);
    if (parsedUrl === null && (!manual || trimmedUrl.length > 0)) {
      notify({
        message: "Enter a complete http or https link without a username or password.",
        state: "error",
      });
      setUrlError(true);
      const urlInput = event.currentTarget.elements.namedItem("url");
      if (urlInput instanceof HTMLInputElement) urlInput.focus();
      return;
    }

    const trimmedTitle = title.trim();
    if (manual && trimmedTitle.length === 0) {
      notify({ message: "Enter a title.", state: "error" });
      setTitleError(true);
      const titleInput = event.currentTarget.elements.namedItem("title");
      if (titleInput instanceof HTMLInputElement) {
        titleInput.focus();
      }
      return;
    }

    if (parsedUrl !== null) {
      const captureInput: CaptureInput = { url: parsedUrl };
      if (manual) {
        captureInput.title = trimmedTitle;
        captureInput.type = typeOverride ?? DEFAULT_ITEM_TYPE;
      }

      const captured = await onCapture(captureInput);
      if (!captured) return;

      resetForm();
      return;
    }

    const added = await onAdd({
      title: trimmedTitle,
      url: null,
      type: typeOverride ?? DEFAULT_ITEM_TYPE,
    });
    if (!added) return;

    resetForm();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && state !== "submitting") {
      onCancel();
    }
  }

  return (
    <form
      className={`add-form add-form--${mode}`}
      id={formId}
      noValidate
      onSubmit={(event) => { void handleSubmit(event); }}
      onKeyDown={handleKeyDown}
    >
      <label className="visually-hidden" htmlFor="capture-url">
        {manual ? "Link, optional" : "Link"}
      </label>
      <input
        ref={urlRef}
        id="capture-url"
        name="url"
        className="add-url"
        type="url"
        autoComplete="url"
        placeholder={manual ? "Link (optional)" : "Paste a link…"}
        aria-describedby={urlError ? urlErrorId : undefined}
        aria-invalid={urlError}
        readOnly={submitting}
        value={url}
        onChange={(event) => {
          setUrlError(false);
          setUrl(event.target.value);
        }}
      />
      {urlError && (
        <p id={urlErrorId} className="form-error" role="alert">
          Enter a complete http or https link without a username or password.
        </p>
      )}
      {manual && (
        <>
          <label className="visually-hidden" htmlFor="capture-title">
            Title
          </label>
          <input
            id="capture-title"
            name="title"
            className="add-title"
            type="text"
            autoComplete="off"
            autoFocus
            placeholder="Title"
            aria-describedby={titleError ? titleErrorId : undefined}
            aria-invalid={titleError}
            readOnly={submitting}
            value={title}
            onChange={(event) => {
              setTitleError(false);
              setTitle(event.target.value);
            }}
          />
          {titleError && (
            <p id={titleErrorId} className="form-error" role="alert">
              Enter a title.
            </p>
          )}
          <TypeSelect
            value={typeOverride ?? DEFAULT_ITEM_TYPE}
            onChange={setTypeOverride}
            disabled={submitting}
          />
        </>
      )}
      <span className="visually-hidden" role="status" aria-atomic="true">
        {submitting ? "Adding to inbox." : ""}
      </span>
      <button
        type="submit"
        className="add-submit"
        disabled={state !== "idle"}
        aria-busy={submitting}
      >
        {submitting && <span className="button-spinner" aria-hidden="true" />}
        <span>{submitting ? "Adding…" : "Add to inbox"}</span>
      </button>
      <button
        type="button"
        className="capture-mode-toggle"
        disabled={submitting}
        onClick={() => changeMode(manual ? "quick" : "manual")}
      >
        {manual ? "Use quick capture" : "No link? Add manually"}
      </button>
    </form>
  );
}
