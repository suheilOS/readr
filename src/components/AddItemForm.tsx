import { playError } from "../soundCues";
import { useState, type FormEvent, type Ref } from "react";
import { TypeSelect } from "./TypeSelect";
import type { Item, ItemType } from "../item";
import { parseItemUrl } from "../itemUrl";

export type NewItemInput = Pick<Item, "title" | "url" | "type">;

export type AddItemFormState = "idle" | "blocked" | "submitting";

type AddItemFormProps = {
  onAdd: (input: NewItemInput) => Promise<boolean>;
  onCancel: () => void;
  state: AddItemFormState;
  formId?: string;
  titleRef?: Ref<HTMLInputElement>;
};

export function AddItemForm({ onAdd, onCancel, state, formId, titleRef }: AddItemFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ItemType>("article");
  const [titleError, setTitleError] = useState(false);
  const [urlError, setUrlError] = useState(false);
  const submitting = state === "submitting";
  const titleErrorId = `${formId ?? "add-item"}-title-error`;
  const urlErrorId = `${formId ?? "add-item"}-url-error`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state !== "idle") return;

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      playError();
      setTitleError(true);
      const titleInput = event.currentTarget.elements.namedItem("title");
      if (titleInput instanceof HTMLInputElement) {
        titleInput.focus();
      }
      return;
    }

    const parsedUrl = url.trim().length === 0 ? null : parseItemUrl(url);
    if (url.trim().length > 0 && parsedUrl === null) {
      playError();
      setUrlError(true);
      const urlInput = event.currentTarget.elements.namedItem("url");
      if (urlInput instanceof HTMLInputElement) urlInput.focus();
      return;
    }

    const added = await onAdd({
      title: trimmedTitle,
      url: parsedUrl,
      type,
    });
    if (!added) return;

    setTitle("");
    setUrl("");
    setTitleError(false);
    setUrlError(false);
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
      <label className="visually-hidden" htmlFor="capture-title">
        Title
      </label>
      <input
        ref={titleRef}
        id="capture-title"
        name="title"
        className="add-title"
        type="text"
        autoComplete="off"
        placeholder="Title"
        aria-describedby={titleError ? titleErrorId : undefined}
        aria-invalid={titleError}
        required
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
      <label className="visually-hidden" htmlFor="capture-url">
        Link, optional
      </label>
      <input
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
      <TypeSelect value={type} onChange={setType} disabled={submitting} />
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
