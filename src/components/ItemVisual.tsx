import { useState } from "react";
import type { ItemType, ItemVisualSummary } from "../../shared/item";
import { ItemTypeIcon } from "./ItemTypeIcon";

type ItemVisualProps = {
  visual: ItemVisualSummary;
  showPlay?: boolean;
  itemType: ItemType;
};

export function ItemVisual({ visual, showPlay = false, itemType }: ItemVisualProps) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`item-visual item-visual--${visual.imageKind}`}
      data-image-state={failed ? "broken" : undefined}
      aria-hidden="true"
    >
      {!failed && (
        <img
          src={visual.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
      <span className="item-visual-type">
        <ItemTypeIcon type={itemType} className="item-visual-type-icon" />
      </span>
      {showPlay && !failed && <span className="item-visual-play" aria-hidden="true" />}
    </span>
  );
}
