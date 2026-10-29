import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { readContentUiScaleCompensation } from '@sniptale/ui/floating-interactions/scale';
import { cssCatalog, filterCatalog, overview, type CatalogColor } from './catalog-model';

/** A failed optional catalog load preserves the local CSS fallback and permits retry. */
export function useNamedCatalog() {
  const [colors, setColors] = useState<readonly CatalogColor[]>(cssCatalog);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void import('./catalog-data')
      .then((module) => {
        if (active) {
          setColors(module.namedCatalog);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return { colors, status, retry: () => setAttempt((value) => value + 1) };
}

/** The replacement consumes the existing palette, plane and hue bounds in every density. */
export function useCatalogPlacement(editor: RefObject<HTMLDivElement | null>, active: boolean) {
  const [placement, setPlacement] = useState({ top: 0, height: 200 });
  useLayoutEffect(() => {
    if (!active || !editor.current) return;
    const element = editor.current;
    const body = element.closest('[data-color-picker-body]') ?? element;
    const hue = element.querySelector('[data-ui="shared.ui.color-selector.hue"]');
    const measure = () => {
      if (!hue) return;
      const origin = element.getBoundingClientRect();
      const start = body.getBoundingClientRect();
      const end = hue.getBoundingClientRect();
      const scale = readContentUiScaleCompensation(element);
      const contentTop = start.top - body.scrollTop * scale;
      const next = {
        top: (contentTop - origin.top) / scale,
        height: (end.bottom - contentTop) / scale,
      };
      setPlacement((previous) =>
        previous.top === next.top && previous.height === next.height ? previous : next
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(body);
    observer?.observe(element);
    return () => observer?.disconnect();
  });
  return placement;
}

/** Disposable browsing state never changes the caller's accepted color. */
export function useCatalogBrowsing(colors: readonly CatalogColor[]) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'css'>('all');
  const [group, setGroup] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<CatalogColor | null>(null);
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(100);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const pool = source === 'css' ? cssCatalog : colors;
  const results = useMemo(() => filterCatalog(pool, query, group), [pool, query, group]);
  const board = useMemo(
    () => (!query && !expanded ? overview(results, group) : results),
    [results, query, expanded, group]
  );
  const startRow = Math.max(0, Math.floor(scrollTop / 26) - 2);
  const start = startRow * 8;
  const end = Math.min(board.length, start + (Math.ceil(height / 26) + 4) * 8);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const measure = () => setHeight(element.clientHeight || 100);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);
  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const button = grid.current?.querySelector<HTMLButtonElement>(`[data-color-index="${index}"]`);
    if (button) {
      pendingFocus.current = null;
      button.focus();
    }
  });
  const reset = () => {
    setActive(0);
    setHover(null);
    setScrollTop(0);
    if (grid.current) grid.current.scrollTop = 0;
  };
  const focus = (index: number) => {
    const next = Math.max(0, Math.min(board.length - 1, index));
    if (!board[next]) return;
    const mounted = grid.current?.querySelector<HTMLButtonElement>(`[data-color-index="${next}"]`);
    pendingFocus.current = mounted ? null : next;
    mounted?.focus({ preventScroll: true });
    setActive(next);
    const row = Math.floor(next / 8) * 26;
    const top =
      row < scrollTop ? row : row + 26 > scrollTop + height ? row + 26 - height : scrollTop;
    if (grid.current) grid.current.scrollTop = top;
    setScrollTop(top);
  };
  return {
    query,
    source,
    group,
    expanded,
    hover,
    setHover,
    active,
    setActive,
    grid,
    pool,
    results,
    board,
    start,
    end,
    setScrollTop,
    focus,
    changeQuery: (value: string) => {
      setQuery(value);
      reset();
    },
    changeSource: (value: 'all' | 'css') => {
      setSource(value);
      reset();
    },
    changeGroup: (value: string) => {
      setGroup(value);
      reset();
    },
    toggleExpanded: () => {
      setExpanded((value) => !value);
      reset();
    },
    clear: () => {
      setQuery('');
      setGroup('all');
      reset();
    },
  };
}
