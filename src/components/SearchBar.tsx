import { useEffect, useRef, useState } from "react";
import { SearchIcon, XIcon } from "./icons";

type SearchBarProps = {
  query: string;
  onQueryChange: (query: string) => void;
};

export function SearchBar({ query, onQueryChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [compactPlaceholder, setCompactPlaceholder] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(max-width: 540px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 540px)");
    if (media === undefined) return;

    function updatePlaceholder(event: MediaQueryListEvent) {
      setCompactPlaceholder(event.matches);
    }

    setCompactPlaceholder(media.matches);
    media.addEventListener("change", updatePlaceholder);
    return () => media.removeEventListener("change", updatePlaceholder);
  }, []);

  function clearSearch() {
    onQueryChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="search-bar">
      <SearchIcon className="search-icon" />
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        name="search"
        placeholder={compactPlaceholder ? "Search…" : "Search titles and links…"}
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
