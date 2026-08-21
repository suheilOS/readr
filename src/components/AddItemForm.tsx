import { useState, type FormEvent, type Ref } from "react";
import { TypeSelect } from "./TypeSelect";
import type { ItemType } from "../item";

export type NewItemInput = {
  title: string;
  url: string | null;
  type: ItemType;
};

type AddItemFormProps = {
  onAdd: (input: NewItemInput) => void;
  onCancel: () => void;
  formId?: string;
  titleRef?: Ref<HTMLInputElement>;
};

export function AddItemForm({ onAdd, onCancel, formId, titleRef }: AddItemFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ItemType>("article");
  const [titleError, setTitleError] = useState(false);
  const titleErrorId = `${formId ?? "add-item"}-title-error`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setTitleError(true);
      const titleInput = event.currentTarget.elements.namedItem("title");
      if (titleInput instanceof HTMLInputElement) {
        titleInput.focus();
      }
      return;
    }

    onAdd({
      title: trimmedTitle,
      url: url.trim() || null,
      type,
    });

    setTitle("");
    setUrl("");
    setTitleError(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      onCancel();
    }
  }

  return (
    <form className="add-form" id={formId} onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
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
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <TypeSelect value={type} onChange={setType} />
      <button type="submit" className="add-submit">
        Add to inbox
      </button>
    </form>
  );
}
