import { useState } from "react";
import type { ItemVisualSummary } from "../../shared/item";

type ItemVisualProps = {
  visual: ItemVisualSummary;
  showPlay?: boolean;
};

export function ItemVisual({ visual, showPlay = false }: ItemVisualProps) {
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
      {showPlay && !failed && <span className="item-visual-play" aria-hidden="true" />}
    </span>
  );
}
