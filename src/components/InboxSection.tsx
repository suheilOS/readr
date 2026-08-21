import type { Item } from "../item";
import { itemMetaLine } from "../item";

type InboxSectionProps = {
  items: Item[];
};

export function InboxSection({ items }: InboxSectionProps) {
  return (
    <section className="inbox" aria-labelledby="inbox-heading">
      <div className="section-header">
        <h2 id="inbox-heading">Inbox</h2>
        <span className="counter">{items.length}</span>
      </div>
      <ul className="row-list">
        {items.map((item) => (
          <li key={item.id} className="row">
            <div className="row-text">
              <span className="row-title">{item.title}</span>
              <span className="meta-line">{itemMetaLine(item)}</span>
            </div>
            <div className="row-actions">
              <button type="button" className="quiet-button">
                To desk
              </button>
              <button type="button" className="quiet-button discard">
                Discard
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
