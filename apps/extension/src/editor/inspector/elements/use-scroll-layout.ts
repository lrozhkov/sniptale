import { useLayoutEffect, useRef, useState, type UIEvent } from 'react';
import type { EditorVectorLibrarySnapshot } from '../../application/vector-elements/session';

export function useElementsScrollLayout(
  manage: boolean,
  entryCount: number,
  state: Pick<EditorVectorLibrarySnapshot, 'scrollTop' | 'tab' | 'query' | 'collection'>,
  rememberScroll: (position: number) => void
) {
  const panel = useRef<HTMLDivElement>(null),
    header = useRef<HTMLDivElement>(null),
    results = useRef<HTMLDivElement>(null),
    footer = useRef<HTMLDivElement>(null);
  const [whole, setWhole] = useState(false);
  useLayoutEffect(() => {
    const root = panel.current,
      first = header.current,
      last = footer.current;
    if (manage || !root || !first || !last) return;
    const update = () => {
      const available = root.getBoundingClientRect().height;
      if (available <= 0) return;
      const card = root.querySelector<HTMLElement>('[data-ui="editor.elements.card"]');
      const rowHeight = card?.getBoundingClientRect().height || 64;
      const required =
        first.getBoundingClientRect().height + last.getBoundingClientRect().height + rowHeight;
      setWhole(available < required);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(root);
    observer?.observe(first);
    observer?.observe(last);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [manage, entryCount]);
  const savedScrollTop = useRef(state.scrollTop);
  useLayoutEffect(() => {
    savedScrollTop.current = state.scrollTop;
  }, [state.scrollTop]);
  useLayoutEffect(() => {
    const owner = whole ? panel.current : results.current;
    if (owner) owner.scrollTop = savedScrollTop.current;
  }, [state.tab, state.query, state.collection, manage, whole, results, panel]);
  function onPanelScroll(event: UIEvent<HTMLDivElement>) {
    if (whole && event.target === event.currentTarget)
      rememberScroll(event.currentTarget.scrollTop);
  }
  function onResultsScroll(event: UIEvent<HTMLDivElement>) {
    if (!whole) rememberScroll(event.currentTarget.scrollTop);
  }
  return { panel, header, results, footer, whole, onPanelScroll, onResultsScroll };
}
