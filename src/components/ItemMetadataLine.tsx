import { itemTypeLabel, type ItemListItem } from "../../shared/item";
import { itemSourceFor } from "../itemPresentation";

type ItemMetadataLineProps = {
  item: ItemListItem;
  className: "desk-card-meta" | "library-item-meta";
};

export function ItemMetadataLine({ item, className }: ItemMetadataLineProps) {
  const source = itemSourceFor(item);

  return (
    <span className={className}>
      <span>{itemTypeLabel(item.type)}</span>
      {source !== null && (
        <>
          <span className="item-metadata-separator" aria-hidden="true">·</span>
          <span>{source}</span>
        </>
      )}
    </span>
  );
}
