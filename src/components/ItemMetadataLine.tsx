import type { ItemListItem } from "../../shared/item";
import { itemSourceFor } from "../itemPresentation";

type ItemMetadataLineProps = {
  item: ItemListItem;
  className: "desk-card-meta" | "library-item-meta";
};

export function ItemMetadataLine({ item, className }: ItemMetadataLineProps) {
  const source = itemSourceFor(item);

  if (source === null) return null;

  return <span className={className}>{source}</span>;
}
