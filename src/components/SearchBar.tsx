import { useRef } from "react";
import { XIcon } from "./icons";

type SearchBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function clearSearch() {
    onQueryChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        name="search"
        placeholder="Search titles and links…"
        aria-label="Search titles and links"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {query.length > 0 && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={clearSearch}>
          <XIcon />
        </button>
      )}
    </div>
  );
}
