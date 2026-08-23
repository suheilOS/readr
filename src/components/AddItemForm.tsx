import { playError } from "../soundCues";
import { useRef, useState, type FormEvent, type Ref } from "react";
import { TypeSelect } from "./TypeSelect";
import type { Item, ItemType } from "../item";
import { parseItemUrl } from "../itemUrl";

export type NewItemInput = Pick<Item, "title" | "url" | "type">;

type AddItemFormProps = {
  onAdd: (input: NewItemInput) => boolean | Promise<boolean>;
  onCancel: () => void;
  formId?: string;
  titleRef?: Ref<HTMLInputElement>;
  busy?: boolean;
};

export function AddItemForm({ onAdd, onCancel, formId, titleRef, busy = false }: AddItemFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ItemType>("article");
  const [titleError, setTitleError] = useState(false);
  const [titleErrorAttempt, setTitleErrorAttempt] = useState(0);
  const [urlError, setUrlError] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const titleErrorId = `${formId ?? "add-item"}-title-error`;
  const urlErrorId = `${formId ?? "add-item"}-url-error`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy || submittingRef.current) return;
    setSubmitError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      playError();
      setTitleError(true);
      setTitleErrorAttempt((current) => current + 1);
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

    submittingRef.current = true;
    setSubmitting(true);
    try {
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
    } catch {
      setSubmitError("The item could not be added. Try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && !submitting) {
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
        className={`add-title${titleError ? ` add-title-wiggle-${titleErrorAttempt % 2}` : ""}`}
        type="text"
        autoComplete="off"
        placeholder="Title"
        aria-describedby={titleError ? titleErrorId : undefined}
        aria-invalid={titleError}
        required
        disabled={submitting}
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
        disabled={submitting}
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
      {submitError !== null && <p className="form-error" role="alert">{submitError}</p>}
      <span className="visually-hidden" role="status" aria-atomic="true">
        {submitting ? "Adding to inbox." : ""}
      </span>
      <button
        type="submit"
        className="add-submit"
        disabled={busy || submitting}
        aria-busy={submitting}
      >
        {submitting && <span className="button-spinner" aria-hidden="true" />}
        <span>{submitting ? "Adding…" : "Add to inbox"}</span>
      </button>
    </form>
  );
}
