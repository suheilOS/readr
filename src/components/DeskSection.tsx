import { DESK_CAPACITY, type Item, itemMetaLine } from "../item";

type DeskSectionProps = {
  items: Item[];
};

export function DeskSection({ items }: DeskSectionProps) {
  return (
    <section className="desk" aria-labelledby="desk-heading">
      <div className="section-header">
        <h2 id="desk-heading">On your desk</h2>
        <span className="counter">
          {items.length} / {DESK_CAPACITY}
        </span>
      </div>
      <ul className="desk-list">
        {items.map((item) => (
          <li key={item.id}>
            <article className="desk-card">
              <h3 className="card-title">{item.title}</h3>
              <p className="meta-line">{itemMetaLine(item)}</p>
              {item.url !== null && (
                <button type="button" className="read-button">
                  Read
                </button>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
