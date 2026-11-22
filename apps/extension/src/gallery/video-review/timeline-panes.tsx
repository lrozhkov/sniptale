import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { observeReviewRemovalMotion } from './timeline-removal-motion';

type Row = { body: HTMLDivElement; header: HTMLDivElement; ruler: boolean };
type Registry = { register(row: Row): () => void };
const PaneContext = createContext<Registry | null>(null);

/** A track keeps one body and portals only its existing controls into the label pane. */
export function useReviewTrackHeader(visible: boolean, ruler: boolean) {
  const registry = useContext(PaneContext);
  const body = useRef<HTMLDivElement>(null);
  const [header] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    if (!registry || !visible || !body.current) return;
    return registry.register({ body: body.current, header, ruler });
  }, [registry, visible, ruler, header]);
  return { body, header: registry ? header : null };
}

/** Coordinates disposable DOM geometry and native scrollbars; tracks retain all edit state. */
export function ReviewTimelinePanes(props: {
  viewport: RefObject<HTMLDivElement | null>;
  busy: boolean | undefined;
  children: ReactNode;
}) {
  const shell = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const pinnedHeaders = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rows = useRef(new Set<Row>());
  const refresh = useRef(() => {});
  const mirrored = useRef({ labels: null as number | null, time: null as number | null });
  useLayoutEffect(() => {
    const viewport = props.viewport.current;
    if (viewport) return observeReviewRemovalMotion(viewport);
  }, [props.viewport]);
  const sync = useCallback(
    (source: 'labels' | 'time') => {
      const left = labels.current;
      const right = props.viewport.current;
      if (!left || !right) return;
      const origin = source === 'labels' ? left : right;
      const target = source === 'labels' ? right : left;
      const destination = source === 'labels' ? 'time' : 'labels';
      const expected = mirrored.current[source];
      mirrored.current[source] = null;
      if (expected === origin.scrollTop || target.scrollTop === origin.scrollTop) return;
      target.scrollTop = origin.scrollTop;
      mirrored.current[destination] = target.scrollTop;
    },
    [props.viewport]
  );
  const registry = useMemo<Registry>(
    () => ({
      register(row) {
        rows.current.add(row);
        refresh.current();
        return () => {
          rows.current.delete(row);
          row.header.remove();
          refresh.current();
        };
      },
    }),
    []
  );
  useLayoutEffect(() => {
    const root = shell.current;
    const left = labels.current;
    const right = props.viewport.current;
    const list = content.current;
    const fixed = controls.current;
    const pinned = pinnedHeaders.current;
    if (!root || !left || !right || !list || !fixed || !pinned) return;
    const plane = right.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]');
    if (!plane) return;
    const observation = observeReviewPaneLayout(
      { root, left, right, list, fixed, pinned, plane },
      rows.current,
      (value) => {
        mirrored.current = value;
      }
    );
    refresh.current = observation.refresh;
    return () => {
      refresh.current = () => {};
      observation.disconnect();
      mirrored.current = { labels: null, time: null };
    };
  }, [props.viewport]);
  useLayoutEffect(() => {
    const node = props.viewport.current;
    if (!node) return;
    const onScroll = () => sync('time');
    node.addEventListener('scroll', onScroll);
    return () => node.removeEventListener('scroll', onScroll);
  }, [props.viewport, sync]);
  return (
    <PaneContext.Provider value={registry}>
      <div
        ref={shell}
        data-ui="gallery.videoReview.timelinePanes"
        className="grid min-h-0 min-w-0 flex-1
          grid-cols-[var(--review-label-width,192px)_minmax(0,1fr)] overflow-hidden"
      >
        <div
          className={`flex min-h-0 min-w-0 flex-col overflow-hidden border-r
            border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]
            [&_[data-ui="gallery.videoReview.trackHeader"]]:border-r-0`}
          style={{ paddingBottom: 'var(--review-scrollbar-height,0px)' }}
        >
          <div
            ref={labels}
            data-ui="gallery.videoReview.trackListViewport"
            onScroll={() => sync('labels')}
            inert={props.busy}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <div
              ref={controls}
              className="sticky top-0 z-40 overflow-hidden bg-[var(--sniptale-color-surface-panel)]"
            />
            <div
              ref={pinnedHeaders}
              data-review-track-group="pinned"
              className="sticky z-30 bg-[var(--sniptale-color-surface-panel)]"
            />
            <div ref={content} data-review-track-group="scrolling" className="relative isolate" />
          </div>
        </div>
        {props.children}
      </div>
    </PaneContext.Provider>
  );
}

function readPinnedOffsets(rows: readonly Row[]) {
  const offsets = new Map<Row, { top: number; gap: number }>();
  let height = 0;
  for (const row of rows) {
    if (!row.body.hasAttribute('data-review-track-pinned')) continue;
    const gap = Number.parseFloat(getComputedStyle(row.body).marginTop) || 0;
    offsets.set(row, { top: height + gap, gap });
    height += gap + row.body.getBoundingClientRect().height;
  }
  return { offsets, height };
}

function measureHeaderWidth(header: HTMLElement) {
  const label = header.querySelector<HTMLElement>('[data-track-label]');
  const actions = header.querySelector<HTMLElement>('[data-track-controls]');
  const settings = header.querySelectorAll<HTMLElement>(
    '[role="switch"], .review-track-reorder, .review-track-pin'
  );
  return (
    (label?.scrollWidth ?? 0) +
    (actions?.scrollWidth ?? 0) +
    [...settings].reduce((width, control) => width + control.offsetWidth + 4, 0) +
    44
  );
}

/** Measures actual row boxes and scrollbar budgets within one mounted pane lifetime. */
function observeReviewPaneLayout(
  {
    root,
    left,
    right,
    list,
    fixed,
    pinned,
    plane,
  }: Record<'root' | 'left' | 'right' | 'list' | 'fixed' | 'pinned' | 'plane', HTMLElement>,
  rows: Set<Row>,
  onClamp: (value: { labels: number; time: number }) => void
) {
  let labelWidth = 0;
  const measure = () => {
    const ordered = [...rows].sort((a, b) =>
      a.body.compareDocumentPosition(b.body) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    const rulerHeight = ordered.find((row) => row.ruler)?.body.getBoundingClientRect().height ?? 0;
    const planeRect = plane.getBoundingClientRect();
    const stack = readPinnedOffsets(ordered);
    const firstScrolling = ordered.find((row) => !row.ruler && !stack.offsets.has(row));
    const available = Math.max(0, right.clientHeight - rulerHeight);
    const reserve = Math.min(
      available / 2,
      firstScrolling?.body.getBoundingClientRect().height ?? 0
    );
    // A tall stack can scroll up under the ruler, leaving room to reach the unpinned lanes.
    const stickyTop = Math.min(rulerHeight, right.clientHeight - reserve - stack.height);
    const positions = new Map<HTMLElement, number>();
    let natural = 120;
    const placements = ordered.map((row) => {
      const offset = stack.offsets.get(row);
      const parent = row.ruler ? fixed : offset ? pinned : list;
      const position = positions.get(parent) ?? 0;
      positions.set(parent, position + 1);
      // Source comments occupy leading clearance above the visible video strip.
      const visibleLane = row.body.querySelector<HTMLElement>(
        '[data-ui="gallery.videoReview.sourceLane"]'
      );
      const rect = (visibleLane ?? row.body).getBoundingClientRect();
      const top = offset
        ? offset.top + rect.top - row.body.getBoundingClientRect().top
        : rect.top - planeRect.top - rulerHeight - stack.height;
      natural = Math.max(natural, measureHeaderWidth(row.header));
      return { row, parent, position, top: row.ruler ? 0 : top, height: rect.height, offset };
    });
    const scrollbarHeight = Math.max(0, right.offsetHeight - right.clientHeight);
    const scrollbar = Math.max(0, left.offsetWidth - left.clientWidth);
    const width = Math.min(
      root.clientWidth * 0.4 || 260,
      Math.max(labelWidth, Math.ceil(natural + scrollbar))
    );
    // Read all row geometry before changing any row or pane layout.
    fixed.style.height = `${rulerHeight}px`;
    pinned.style.height = `${stack.height}px`;
    pinned.style.top = `${stickyTop}px`;
    left.style.scrollPaddingBlockStart = `${Math.max(rulerHeight, stickyTop + stack.height)}px`;
    list.style.height = `${Math.max(0, planeRect.height - rulerHeight - stack.height)}px`;
    root.style.setProperty('--review-scrollbar-height', `${scrollbarHeight}px`);
    const focused = document.activeElement;
    for (const { row, parent, position, top, height, offset } of placements) {
      if (parent.children[position] !== row.header)
        parent.insertBefore(row.header, parent.children[position] ?? null);
      row.header.style.position = 'absolute';
      row.header.style.insetInline = '0';
      row.header.style.top = `${top}px`;
      row.header.style.height = `${height}px`;
      if (offset) {
        row.body.style.setProperty('--review-pinned-track-top', `${stickyTop + offset.top}px`);
        row.body.style.setProperty('--review-pinned-track-gap', `${offset.gap}px`);
      }
    }
    if (
      document.activeElement === document.body &&
      focused instanceof HTMLElement &&
      left.contains(focused)
    )
      focused.focus({ preventScroll: true });
    labelWidth = width;
    root.style.setProperty('--review-label-width', `${width}px`);
    const top = Math.max(
      0,
      Math.min(
        right.scrollTop,
        right.scrollHeight - right.clientHeight,
        left.scrollHeight - left.clientHeight
      )
    );
    left.scrollTop = right.scrollTop = top;
    onClamp({ labels: left.scrollTop, time: right.scrollTop });
  };
  const resize = new ResizeObserver(measure);
  const observe = () => {
    resize.disconnect();
    for (const node of [root, right, plane, ...[...rows].map((row) => row.body)])
      resize.observe(node);
    root
      .querySelectorAll('[data-track-label], [data-track-controls]')
      .forEach((node) => resize.observe(node));
    measure();
  };
  const mutation = new MutationObserver((records) => {
    const geometryChanged = records.some((record) => {
      if (record.type === 'attributes' || left.contains(record.target)) return true;
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          node instanceof Element &&
          [...rows].some((row) => node === row.body || node.contains(row.body))
      );
    });
    // Lane size changes are covered by ResizeObserver; playback text does not move headers.
    if (geometryChanged) observe();
  });
  for (const node of [fixed, pinned, list])
    mutation.observe(node, { childList: true, subtree: true, characterData: true });
  mutation.observe(plane, {
    childList: true,
    subtree: true,
    attributeFilter: ['data-review-track-pinned'],
  });
  observe();
  return {
    refresh: observe,
    disconnect() {
      resize.disconnect();
      mutation.disconnect();
    },
  };
}
