import { DESK_CAPACITY, type Item, itemMetaLine } from "../item";
import { focusAdjacentAction } from "../focusAdjacentAction";

type DeskSectionProps = {
  items: Item[];
  swapActive: boolean;
  onFinish: (item: Item) => void;
  onSelectSwapTarget: (item: Item) => void;
  onCancelSwap: () => void;
};

export function DeskSection({
  items,
  swapActive,
  onFinish,
  onSelectSwapTarget,
  onCancelSwap,
}: DeskSectionProps) {
  return (
    <section className="desk" aria-labelledby="desk-heading">
      <div className="section-header">
        <h2 id="desk-heading" tabIndex={-1}>On your desk</h2>
        <span className="counter">
          {items.length} / {DESK_CAPACITY}
        </span>
      </div>
      {swapActive && (
        <p role="status" className="swap-banner">
          Desk is full. Choose a card to replace, or{" "}
          <button type="button" className="inline-link-button" onClick={onCancelSwap}>
            cancel
          </button>
        </p>
      )}
      <ul className="desk-list">
        {items.map((item) =>
          swapActive ? (
            <li key={item.id}>
              <button
                type="button"
                className="desk-card swappable"
                aria-label={`Replace ${item.title}`}
                onClick={(event) => {
                  focusAdjacentAction(event.currentTarget, "desk-heading");
                  onSelectSwapTarget(item);
                }}
              >
                <span className="card-title">{item.title}</span>
                <span className="meta-line">{itemMetaLine(item)}</span>
              </button>
            </li>
          ) : (
            <li key={item.id}>
              <article className="desk-card">
                <h3 className="card-title">{item.title}</h3>
                <p className="meta-line">{itemMetaLine(item)}</p>
                <div className="card-actions">
                  {item.url !== null && (
                    <a
                      className="pill-button"
                      href={item.url}
                      aria-label={`Read: ${item.title}`}
                    >
                      Read
                    </a>
                  )}
                  <button
                    type="button"
                    className="pill-button"
                    aria-label={`Finish: ${item.title}`}
                    onClick={(event) => {
                      focusAdjacentAction(event.currentTarget, "desk-heading");
                      onFinish(item);
                    }}
                  >
                    Finish
                  </button>
                </div>
              </article>
            </li>
          ),
        )}
      </ul>
      {!swapActive && items.length === 0 && (
        <p className="empty-note">Your desk is empty. Move something in from the inbox.</p>
      )}
    </section>
  );
}
