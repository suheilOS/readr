import type { ItemListItem } from "../../shared/item";
import { itemSourcePresentationFor } from "../itemPresentation";
import { SiteFavicon } from "./SiteFavicon";

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
