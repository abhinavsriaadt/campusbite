import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../api/client";

export function useMediaQuery(query) {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const useIsMobile = () => useMediaQuery("(max-width: 639px)");

/**
 * Server-paginated list. `fetchPage(page)` must resolve to the API's `{items, total, page, pages}`.
 * Desktop: numbered pages (each page replaces the list). Mobile: "Load more" appends the next page.
 * The list resets to page 1 whenever `deps` change.
 */
export function usePaged(fetchPage, deps = []) {
  const isMobile = useIsMobile();
  const key = JSON.stringify(deps);
  const [req, setReq] = useState({ key, page: 1, append: false, nonce: 0 });
  const effective = req.key === key ? req : { key, page: 1, append: false, nonce: req.nonce };
  const [state, setState] = useState({ items: [], total: 0, pages: 1, page: 1, loading: true, error: null, loaded: false });
  const runId = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  useEffect(() => {
    const id = ++runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchRef.current(effective.page)
      .then((data) => {
        if (id !== runId.current) return;
        setState((s) => ({
          items: effective.append ? [...s.items, ...data.items.filter((n) => !s.items.some((o) => o.id === n.id))] : data.items,
          total: data.total, pages: data.pages, page: data.page, loading: false, error: null, loaded: true,
        }));
      })
      .catch((err) => id === runId.current && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective.key, effective.page, effective.append, effective.nonce]);

  const goTo = useCallback((page) => {
    setReq((r) => ({ key, page, append: false, nonce: r.nonce + 1 }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [key]);
  const loadMore = useCallback(() => setReq((r) => ({ key, page: state.page + 1, append: true, nonce: r.nonce + 1 })), [key, state.page]);
  /** Re-fetch from the current desktop page (or from page 1 when the list was built with "Load more"). */
  const reload = useCallback(() => setReq((r) => ({ key, page: r.append ? 1 : (r.key === key ? r.page : 1), append: false, nonce: r.nonce + 1 })), [key]);
  /** Local update for optimistic UI (e.g. replace one row after an action). */
  const setItems = useCallback((fn) => setState((s) => ({ ...s, items: fn(s.items) })), []);

  return { ...state, isMobile, goTo, loadMore, reload, setItems, hasMore: state.page < state.pages };
}
