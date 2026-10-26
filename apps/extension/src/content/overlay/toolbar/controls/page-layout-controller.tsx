import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type PointerEvent,
} from 'react';
import type { PageToolbarLayoutItem, PageToolbarMode } from '../../../../contracts/settings';
import { useContentUiScale } from '../../../platform/dom-host';
import { movePageToolbarItem } from '../state/page-layout';
import { PageToolbarControlsContext } from '../state/page-controls';

type Drop = {
  mode: PageToolbarMode;
  layout: PageToolbarLayoutItem[];
  source: PageToolbarLayoutItem;
  target: PageToolbarLayoutItem | null;
  before: boolean;
};
type Gesture = Drop & {
  original: PageToolbarLayoutItem[];
  pointerId: number;
  x: number;
  y: number;
  active: boolean;
};
export const PageToolbarLayoutContext = createContext<{
  drop: Drop | null;
  preview: PageToolbarLayoutItem[] | null;
  items: PageToolbarLayoutItem[];
  begin: (item: PageToolbarLayoutItem, event: PointerEvent<HTMLButtonElement>) => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  finish: (event: PointerEvent<HTMLButtonElement>) => void;
  cancel: () => void;
  consumeClick: (item: PageToolbarLayoutItem) => boolean;
} | null>(null);

/** Uses the same short layout continuity as Settings collections, without persisting the preview. */
function usePageToolbarLayoutMotion(
  toolbarRef: RefObject<HTMLDivElement | null>,
  order: readonly PageToolbarLayoutItem[] | undefined,
  editing: boolean | undefined,
  mode: PageToolbarMode | undefined
) {
  const previous = useRef(new Map<string, { x: number; y: number }>());
  const uiScale = useContentUiScale();
  useLayoutEffect(() => {
    const animations: Animation[] = [];
    const next = new Map<string, { x: number; y: number }>();
    const toolbar = toolbarRef.current;
    const bounds = toolbar?.getBoundingClientRect();
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    toolbar?.querySelectorAll<HTMLElement>('[data-page-toolbar-item]').forEach((slot) => {
      const id = `${mode}:${slot.dataset['pageToolbarItem']!}`;
      const rect = slot.getBoundingClientRect();
      const position = {
        x: (rect.x - (bounds?.x ?? 0)) / uiScale,
        y: (rect.y - (bounds?.y ?? 0)) / uiScale,
      };
      next.set(id, position);
      const prior = previous.current.get(id);
      if (!editing || reduced || !prior || (prior.x === position.x && prior.y === position.y))
        return;
      const animation = slot.animate?.(
        [
          { translate: `${prior.x - position.x}px ${prior.y - position.y}px` },
          { translate: '0px 0px' },
        ],
        { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
      if (animation) animations.push(animation);
    });
    previous.current = next;
    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [toolbarRef, order, editing, mode, uiScale]);
}

/** Tracks currently rendered slots independently of a pointer gesture. */
function usePresentPageToolbarItems(
  toolbarRef: RefObject<HTMLDivElement | null>,
  layout: PageToolbarLayoutItem[] | undefined,
  active: boolean | undefined
) {
  const [present, setPresent] = useState<PageToolbarLayoutItem[]>([]);
  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    const refresh = () => {
      const next =
        active && layout && toolbar
          ? [...toolbar.querySelectorAll<HTMLElement>('[data-page-toolbar-item]')]
              .filter(
                (element) =>
                  element.parentElement === toolbar &&
                  !element.dataset['pageToolbarItem']?.startsWith('separator:') &&
                  element.querySelector('button')
              )
              .flatMap((element) =>
                layout.filter((item) => item === element.dataset['pageToolbarItem'])
              )
          : [];
      setPresent((current) =>
        current.length === next.length && current.every((item, index) => item === next[index])
          ? current
          : next
      );
    };
    refresh();
    const observer = new MutationObserver(refresh);
    if (toolbar) observer.observe(toolbar, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, layout, toolbarRef]);
  return present;
}

/** Resolves a native hit and updates only the active gesture's temporary order. */
function movePageToolbarGesture(
  current: Gesture,
  event: PointerEvent<HTMLButtonElement>,
  toolbar: HTMLElement | null,
  items: readonly PageToolbarLayoutItem[]
): Drop | null {
  if (current.pointerId !== event.pointerId) return null;
  if (!current.active && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6)
    return null;
  current.active = true;
  const root = event.currentTarget.getRootNode();
  const hit =
    root instanceof ShadowRoot
      ? root.elementFromPoint(event.clientX, event.clientY)
      : event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  const slot = hit?.closest<HTMLElement>('[data-page-toolbar-item]');
  const target =
    slot && toolbar?.contains(slot)
      ? (items.find(
          (item) => item === slot.dataset['pageToolbarItem'] && item !== current.source
        ) ?? null)
      : null;
  if (slot && target) {
    current.target = target;
    const box = slot.getBoundingClientRect();
    current.before =
      toolbar?.dataset['displayMode'] === 'vertical'
        ? event.clientY < box.y + box.height / 2
        : event.clientX < box.x + box.width / 2;
  }
  if (!slot || !target) return null;
  const next = movePageToolbarItem(current.layout, current.source, target, current.before);
  if (next.every((item, index) => item === current.layout[index])) return null;
  current.layout = next;
  return {
    mode: current.mode,
    layout: next,
    source: current.source,
    target,
    before: current.before,
  };
}

/** Owns one disposable pointer gesture and observes the currently rendered page slots. */
export function PageToolbarLayoutProvider(props: {
  children: ReactNode;
  toolbarRef: RefObject<HTMLDivElement | null>;
}) {
  const preferences = useContext(PageToolbarControlsContext);
  const present = usePresentPageToolbarItems(
    props.toolbarRef,
    preferences?.layout,
    preferences?.layoutActive
  );
  const [pendingDrop, setDrop] = useState<Drop | null>(null);
  const drop = pendingDrop?.mode === preferences?.mode ? pendingDrop : null;
  const gesture = useRef<Gesture | null>(null);
  const suppressedClick = useRef<PageToolbarLayoutItem | null>(null);
  usePageToolbarLayoutMotion(
    props.toolbarRef,
    drop?.layout ?? preferences?.layout,
    preferences?.editing,
    preferences?.mode
  );

  const cancel = useCallback(() => {
    if (!gesture.current) return;
    suppressedClick.current = gesture.current.source;
    gesture.current = null;
    props.toolbarRef.current?.removeAttribute('data-page-reordering');
    setDrop(null);
  }, [props.toolbarRef]);
  useEffect(() => {
    const current = gesture.current;
    if (current && !current.source.startsWith('separator:') && !present.includes(current.source))
      cancel();
  }, [present, cancel]);
  useEffect(() => {
    if (
      !preferences?.layoutActive ||
      !preferences.editing ||
      (gesture.current && gesture.current.original !== preferences.layout)
    )
      cancel();
  }, [preferences?.layoutActive, preferences?.editing, preferences?.layout, cancel]);
  useEffect(
    () => () => props.toolbarRef.current?.removeAttribute('data-page-reordering'),
    [props.toolbarRef]
  );
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [cancel]);
  const items =
    (drop?.layout ?? preferences?.layout)?.filter(
      (item) => present.includes(item) || item.startsWith('separator:')
    ) ?? [];
  return (
    <PageToolbarLayoutContext
      value={{
        drop,
        preview: drop?.layout ?? null,
        items,
        begin: (source, event) => {
          if (event.button !== 0 || !preferences?.editing || preferences.pending) return;
          suppressedClick.current = null;
          props.toolbarRef.current?.setAttribute('data-page-reordering', 'true');
          gesture.current = {
            mode: preferences.mode,
            original: preferences.layout,
            layout: [...preferences.layout],
            source,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            active: false,
            target: null,
            before: true,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.stopPropagation();
        },
        move: (event) => {
          const current = gesture.current;
          if (!current) return;
          const next = movePageToolbarGesture(current, event, props.toolbarRef.current, items);
          if (next) setDrop(next);
        },
        finish: (event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          gesture.current = null;
          props.toolbarRef.current?.removeAttribute('data-page-reordering');
          if (!current.active) {
            setDrop(null);
            return;
          }
          suppressedClick.current = current.source;
          if (current.target && preferences)
            void preferences
              .moveItem(current.source, current.target, current.before)
              .finally(() => setDrop(null));
          else setDrop(null);
        },
        cancel,
        consumeClick: (item) => {
          if (suppressedClick.current !== item) return false;
          suppressedClick.current = null;
          return true;
        },
      }}
    >
      {props.children}
    </PageToolbarLayoutContext>
  );
}
