import { useState } from "react";
import type { ItemListItem } from "../../shared/item";
import { itemSourcePresentationFor } from "../itemPresentation";

export function ItemSourceLine({ item }: { item: ItemListItem }) {
  const source = itemSourcePresentationFor(item);

  if (source === null) return null;

  return (
    <span className="item-source-line">
      {source.href !== null ? (
        <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
      ) : (
        <span>{source.label}</span>
      )}
      {source.hostname !== null && (
        <SiteFavicon key={source.hostname} hostname={source.hostname} />
      )}
    </span>
  );
}

function SiteFavicon({ hostname }: { hostname: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      className="site-favicon"
      src={`/api/favicon?host=${encodeURIComponent(hostname)}`}
      alt=""
      width="16"
      height="16"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
