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
import { movePageToolbarItem, isPageToolbarDividerPositionValid } from '../state/page-layout';
import { PageToolbarControlsContext } from '../state/page-controls';

type ClickSource = PageToolbarLayoutItem | 'add-divider';
type Drop = {
  mode: PageToolbarMode;
  layout: PageToolbarLayoutItem[];
  source: PageToolbarLayoutItem;
  target: PageToolbarLayoutItem | null;
  before: boolean;
  creating: boolean;
  valid: boolean;
};
type Gesture = Drop & {
  clickSource: ClickSource;
  original: PageToolbarLayoutItem[];
  pointerId: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  active: boolean;
};
export const PageToolbarLayoutContext = createContext<{
  drop: Drop | null;
  preview: PageToolbarLayoutItem[] | null;
  items: PageToolbarLayoutItem[];
  begin: (item: PageToolbarLayoutItem, event: PointerEvent<HTMLButtonElement>) => void;
  beginNewSeparator: (event: PointerEvent<HTMLButtonElement>) => void;
  addSeparator: () => void;
  move: (event: PointerEvent<HTMLButtonElement>) => void;
  finish: (event: PointerEvent<HTMLButtonElement>) => void;
  cancel: () => void;
  consumeClick: (item: ClickSource) => boolean;
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
  current.lastX = event.clientX;
  current.lastY = event.clientY;
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
  if (slot?.dataset['pageToolbarItem'] === current.source) {
    if (!current.source.startsWith('separator:')) return null;
    current.valid =
      current.target !== null &&
      isPageToolbarDividerPositionValid(
        current.layout.filter((item) => items.includes(item) || item === current.source),
        current.source
      );
  } else if (slot && target) {
    current.target = target;
    const box = slot.getBoundingClientRect();
    current.before =
      toolbar?.dataset['displayMode'] === 'vertical'
        ? event.clientY < box.y + box.height / 2
        : event.clientX < box.x + box.width / 2;
    const base = current.layout.includes(current.source)
      ? current.layout
      : [...current.layout, current.source];
    current.layout = movePageToolbarItem(base, current.source, target, current.before);
    current.valid = isPageToolbarDividerPositionValid(
      current.layout.filter((item) => items.includes(item) || item === current.source),
      current.source
    );
  } else {
    if (!current.source.startsWith('separator:')) return null;
    current.valid = false;
  }
  return {
    mode: current.mode,
    layout: current.layout,
    source: current.source,
    target: current.target,
    before: current.before,
    creating: current.creating,
    valid: current.valid,
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
  const suppressedClick = useRef<ClickSource | null>(null);
  const committing = useRef(false);
  usePageToolbarLayoutMotion(
    props.toolbarRef,
    drop?.layout ?? preferences?.layout,
    preferences?.editing,
    preferences?.mode
  );

  const clearPresentation = useCallback(() => {
    props.toolbarRef.current?.removeAttribute('data-page-reordering');
    props.toolbarRef.current?.removeAttribute('data-page-drop-invalid');
  }, [props.toolbarRef]);
  const cancel = useCallback(() => {
    if (!gesture.current) return;
    suppressedClick.current = gesture.current.clickSource;
    gesture.current = null;
    clearPresentation();
    setDrop(null);
  }, [clearPresentation]);
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
  useEffect(() => clearPresentation, [clearPresentation]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancel();
    };
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
    };
  }, [cancel]);
  const items =
    (drop?.layout ?? preferences?.layout)?.filter(
      (item) => present.includes(item) || item.startsWith('separator:')
    ) ?? [];
  const begin = (
    source: PageToolbarLayoutItem,
    event: PointerEvent<HTMLButtonElement>,
    creating = false
  ) => {
    if (
      event.button !== 0 ||
      !preferences?.editing ||
      preferences.pending ||
      gesture.current ||
      committing.current
    )
      return;
    suppressedClick.current = null;
    props.toolbarRef.current?.setAttribute('data-page-reordering', 'true');
    gesture.current = {
      mode: preferences.mode,
      original: preferences.layout,
      layout: [...preferences.layout],
      source,
      clickSource: creating ? 'add-divider' : source,
      creating,
      valid: false,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      active: false,
      target: null,
      before: true,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  };
  return (
    <PageToolbarLayoutContext
      value={{
        drop,
        preview: drop?.layout ?? null,
        items,
        begin,
        beginNewSeparator: (event) => {
          if (preferences?.canAddSeparator) begin(`separator:${crypto.randomUUID()}`, event, true);
        },
        addSeparator: () => {
          if (
            !preferences?.canAddSeparator ||
            preferences.pending ||
            committing.current ||
            gesture.current
          )
            return;
          let target = items.find(
            (item, index) =>
              index > 0 &&
              !item.startsWith('separator:') &&
              !items[index - 1]?.startsWith('separator:')
          );
          let before = true;
          if (!target) {
            target = items[0];
            if (target?.startsWith('separator:')) {
              target = items.at(-1);
              before = false;
            }
          }
          if (target && !target.startsWith('separator:'))
            void preferences.addSeparator({
              id: `separator:${crypto.randomUUID()}`,
              target,
              before,
            });
        },
        move: (event) => {
          const current = gesture.current;
          if (!current) return;
          const next = movePageToolbarGesture(current, event, props.toolbarRef.current, items);
          if (next) {
            props.toolbarRef.current?.setAttribute('data-page-drop-invalid', String(!next.valid));
            setDrop(next);
          }
        },
        finish: (event) => {
          const current = gesture.current;
          if (!current || current.pointerId !== event.pointerId) return;
          // Motion beneath a stationary pointer must not change the shown drop on release.
          const final =
            current.lastX === event.clientX && current.lastY === event.clientY
              ? null
              : movePageToolbarGesture(current, event, props.toolbarRef.current, items);
          gesture.current = null;
          clearPresentation();
          if (!current.active) {
            setDrop(null);
            return;
          }
          suppressedClick.current = current.clickSource;
          if (
            !current.valid ||
            !current.target ||
            !preferences ||
            current.mode !== preferences.mode ||
            current.original !== preferences.layout
          ) {
            setDrop(null);
            return;
          }
          if (final) setDrop(final);
          committing.current = true;
          const save = current.creating
            ? preferences.addSeparator({
                id: current.source,
                target: current.target,
                before: current.before,
              })
            : preferences.moveItem(current.source, current.target, current.before);
          void save.finally(() => {
            committing.current = false;
            setDrop(null);
          });
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
