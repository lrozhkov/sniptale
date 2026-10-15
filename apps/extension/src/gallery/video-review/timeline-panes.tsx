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
  const labels = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rows = useRef(new Set<Row>());
  const refresh = useRef(() => {});
  const mirrored = useRef({ labels: null as number | null, time: null as number | null });
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
    if (!root || !left || !right || !list || !fixed) return;
    const plane = right.querySelector<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]');
    if (!plane) return;
    const observation = observeReviewPaneLayout(
      { root, left, right, list, fixed, plane },
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
          <div ref={controls} className="relative shrink-0 overflow-hidden" />
          <div
            ref={labels}
            data-ui="gallery.videoReview.trackListViewport"
            onScroll={() => sync('labels')}
            inert={props.busy}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
            style={{ scrollbarWidth: 'auto', scrollbarGutter: 'stable' }}
          >
            <div ref={content} className="relative" />
          </div>
        </div>
        {props.children}
      </div>
    </PaneContext.Provider>
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
    plane,
  }: Record<'root' | 'left' | 'right' | 'list' | 'fixed' | 'plane', HTMLElement>,
  rows: Set<Row>,
  onClamp: (value: { labels: number; time: number }) => void
) {
  const measure = () => {
    const ordered = [...rows].sort((a, b) =>
      a.body.compareDocumentPosition(b.body) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    );
    const rulerHeight = ordered.find((row) => row.ruler)?.body.getBoundingClientRect().height ?? 0;
    const planeRect = plane.getBoundingClientRect();
    fixed.style.height = `${rulerHeight}px`;
    list.style.height = `${Math.max(0, planeRect.height - rulerHeight)}px`;
    root.style.setProperty(
      '--review-scrollbar-height',
      `${Math.max(0, right.offsetHeight - right.clientHeight)}px`
    );
    let index = 0;
    let natural = 120;
    for (const row of ordered) {
      const parent = row.ruler ? fixed : list;
      const position = row.ruler ? 0 : index++;
      if (parent.children[position] !== row.header)
        parent.insertBefore(row.header, parent.children[position] ?? null);
      const rect = row.body.getBoundingClientRect();
      row.header.style.position = 'absolute';
      row.header.style.insetInline = '0';
      row.header.style.top = `${row.ruler ? 0 : rect.top - planeRect.top - rulerHeight}px`;
      row.header.style.height = `${rect.height}px`;
      const label = row.header.querySelector<HTMLElement>('[data-track-label]');
      const actions = row.header.querySelector<HTMLElement>('[data-track-controls]');
      natural = Math.max(natural, (label?.scrollWidth ?? 0) + (actions?.scrollWidth ?? 0) + 44);
    }
    const scrollbar = Math.max(0, left.offsetWidth - left.clientWidth);
    const width = Math.min(root.clientWidth * 0.4 || 260, Math.ceil(natural + scrollbar));
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
  const mutation = new MutationObserver(observe);
  for (const node of [fixed, list])
    mutation.observe(node, { childList: true, subtree: true, characterData: true });
  observe();
  return {
    refresh: observe,
    disconnect() {
      resize.disconnect();
      mutation.disconnect();
    },
  };
}
