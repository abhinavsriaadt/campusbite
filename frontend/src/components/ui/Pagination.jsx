import Button from "./Button";
import Icon from "./Icon";

/**
 * Numbered pages on desktop; "Load more" on mobile (DESIGN.md §3).
 * Pass a `usePaged()` result as `list`, or plain `page/pages/onChange` for page-only lists.
 */
export default function Pagination({ list, page, pages, onChange }) {
  if (list) {
    if (list.isMobile) {
      if (!list.hasMore) return list.pages > 1 ? <p className="pager__more text-sm muted">You've reached the end</p> : null;
      return (
        <div className="pager__more">
          <Button variant="secondary" block loading={list.loading} onClick={list.loadMore}>Load more</Button>
          <span className="text-xs muted">Showing {list.items.length} of {list.total}</span>
        </div>
      );
    }
    ({ page, pages } = list);
    onChange = list.goTo;
  }
  if (!pages || pages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = [];
  for (let i = start; i <= Math.min(pages, start + 4); i++) nums.push(i);
  return (
    <nav className="pager" aria-label="Pagination">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><Icon name="chevronLeft" /></button>
      {nums.map((n) => (
        <button type="button" key={n} onClick={() => onChange(n)} aria-current={n === page ? "page" : undefined}>{n}</button>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><Icon name="chevronRight" /></button>
    </nav>
  );
}
