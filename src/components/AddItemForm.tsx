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

type AddItemFormProps = {
  onAdd: (input: NewItemInput) => Promise<boolean>;
  onCapture: (input: CaptureInput) => Promise<boolean>;
  onCancel: () => void;
  state: AddItemFormState;
  formId?: string;
  urlRef?: Ref<HTMLInputElement>;
};

export function AddItemForm({ onAdd, onCapture, onCancel, state, formId, urlRef }: AddItemFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [typeOverride, setTypeOverride] = useState<ItemType | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const submitting = state === "submitting";
  const titleErrorId = `${formId ?? "add-item"}-title-error`;
  const urlErrorId = `${formId ?? "add-item"}-url-error`;

  function resetForm(): void {
    setTitle("");
    setUrl("");
    setTypeOverride(null);
    setTitleError(false);
    setUrlError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state !== "idle") return;

    const trimmedUrl = url.trim();
    const parsedUrl = trimmedUrl.length === 0 ? null : parseItemUrl(trimmedUrl);
    if (trimmedUrl.length > 0 && parsedUrl === null) {
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
    if (parsedUrl !== null) {
      const captureInput: CaptureInput = { url: parsedUrl };
      if (trimmedTitle.length > 0) captureInput.title = trimmedTitle;
      if (typeOverride !== null) captureInput.type = typeOverride;

      const captured = await onCapture(captureInput);
      if (!captured) return;

      resetForm();
      return;
    }

    if (trimmedTitle.length === 0) {
      notify({ message: "Enter a title.", state: "error" });
      setTitleError(true);
      const titleInput = event.currentTarget.elements.namedItem("title");
      if (titleInput instanceof HTMLInputElement) {
        titleInput.focus();
      }
      return;
    }

    const added = await onAdd({
      title: trimmedTitle,
      url: parsedUrl,
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
      className="add-form"
      id={formId}
      noValidate
      onSubmit={(event) => { void handleSubmit(event); }}
      onKeyDown={handleKeyDown}
    >
      <label className="visually-hidden" htmlFor="capture-url">
        Link, optional
      </label>
      <input
        ref={urlRef}
        id="capture-url"
        name="url"
        className="add-url"
        type="url"
        autoComplete="url"
        placeholder="Link (optional)"
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
      <label className="visually-hidden" htmlFor="capture-title">
        Title, optional for links
      </label>
      <input
        id="capture-title"
        name="title"
        className="add-title"
        type="text"
        autoComplete="off"
        placeholder="Title (optional for links)"
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
    </form>
  );
}
