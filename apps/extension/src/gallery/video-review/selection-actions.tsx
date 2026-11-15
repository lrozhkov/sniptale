import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  createContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { ReviewSelection } from '../../features/video/review/types';
import { translate } from '../../platform/i18n';
import './selection-actions.css';

type Anchor = { element: HTMLElement; host: HTMLDialogElement; key: string; fraction: number };
type Target = Anchor & {
  disabled: boolean;
  commandHost: HTMLFieldSetElement | null;
  dismiss(): void;
};
export const ReviewSelectionActionsContext = createContext<Target | null>(null);

type MultiSelection = {
  keys: readonly string[];
  clear(): void;
  captureModified(event: ReactPointerEvent): boolean;
  deleteAction: { current: (() => void) | null };
};
export const ReviewTimelineMultiSelectionContext = createContext<MultiSelection | null>(null);

/** DOM keys identify authored items; lane owners still validate selection and mutation. */
function reviewTimelineElementKey(element: HTMLElement): string | undefined {
  return (
    element.dataset['reviewRemovalKey'] ??
    element.dataset['reviewActionKey'] ??
    (element.dataset['cursorFocusKey']
      ? `cursor-focus:${element.dataset['cursorFocusKey']}`
      : undefined)
  );
}

function reviewTimelineSelectionKey(selection: ReviewSelection): string | null {
  switch (selection.kind) {
    case 'edit':
      return `edit:${selection.id}`;
    case 'zoom':
      return `focus:${selection.id}`;
    case 'annotation-effect':
      return `annotation:${selection.id}`;
    case 'text':
      return `text:${selection.id}`;
    case 'audio':
      return `audio:${selection.id}`;
    case 'original-audio':
      return `original-audio:${selection.id}`;
    case 'telemetry':
      return `telemetry:${selection.ref.kind}:${selection.ref.id}`;
    case 'cursor-motion':
      return `cursor-motion:${selection.id}`;
    case 'cursor-focus':
      return `cursor-focus:${selection.id}`;
    case 'zoom-link':
      return `zoom-link:${selection.id}`;
    case 'webcam-position':
      return `webcam-position:${selection.id}`;
    case 'webcam-hidden':
      return `webcam-hidden:${selection.id}`;
    default:
      return null;
  }
}

/** Retains only a transient click anchor; selected-object authority stays in the editor session. */
export function useReviewSelectionActions(
  selection: ReviewSelection,
  visible: boolean,
  disabled: boolean,
  onSelectKey?: ((key: string | null) => void) | undefined
) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [commandHost, setHost] = useState<HTMLFieldSetElement | null>(null);
  const [keys, setKeys] = useState<readonly string[]>([]);
  const previous = useRef<string | null>(null);
  const deleteAction = useRef<(() => void) | null>(null);
  const multi = keys.length > 1;
  useLayoutEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-review-multi-selected]');
    for (const node of nodes) delete node.dataset['reviewMultiSelected'];
    if (!multi) return;
    for (const node of document.querySelectorAll<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    ))
      if (keys.includes(reviewTimelineElementKey(node) ?? ''))
        node.dataset['reviewMultiSelected'] = 'true';
    return () => {
      for (const node of document.querySelectorAll<HTMLElement>('[data-review-multi-selected]'))
        delete node.dataset['reviewMultiSelected'];
    };
  }, [keys, multi, selection]);
  const clear = () => setKeys([]);
  const captureModified = (event: ReactPointerEvent): boolean => {
    if (
      disabled ||
      event.button !== 0 ||
      !(event.ctrlKey || event.metaKey || event.shiftKey) ||
      !(event.target instanceof Element)
    )
      return false;
    const element = event.target.closest<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    );
    const timeline = element?.closest('[data-ui="gallery.videoReview.timeline"]');
    const key = element && reviewTimelineElementKey(element);
    if (!element || !timeline || !key) return false;
    const items = [
      ...timeline.querySelectorAll<HTMLElement>(
        '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
      ),
    ].filter((item) => item.getClientRects().length > 0);
    const lanes = [...timeline.querySelectorAll<HTMLElement>('[data-review-track]')];
    items.sort((a, b) => {
      const laneA = a.closest<HTMLElement>('[data-review-track]');
      const laneB = b.closest<HTMLElement>('[data-review-track]');
      return (
        (laneA && laneB ? lanes.indexOf(laneA) - lanes.indexOf(laneB) : 0) ||
        a.getBoundingClientRect().left - b.getBoundingClientRect().left
      );
    });
    const ordered = [
      ...new Set(items.map(reviewTimelineElementKey).filter((value): value is string => !!value)),
    ];
    const initial = keys.length
      ? keys.filter((key) => ordered.includes(key))
      : [reviewTimelineSelectionKey(selection)].filter(
          (value): value is string => !!value && ordered.includes(value)
        );
    const from = previous.current ? ordered.indexOf(previous.current) : -1;
    const to = ordered.indexOf(key);
    const range =
      event.shiftKey && from >= 0 && to >= 0
        ? ordered.slice(Math.min(from, to), Math.max(from, to) + 1)
        : [key];
    const next = event.shiftKey
      ? event.ctrlKey || event.metaKey
        ? [...new Set([...initial, ...range])]
        : range
      : initial.includes(key)
        ? initial.filter((item) => item !== key)
        : [...initial, key];
    setKeys(next);
    if (!event.shiftKey) previous.current = key;
    const activeKey = next.includes(key) ? key : (next.at(-1) ?? null);
    const activeElement = items.find((item) => reviewTimelineElementKey(item) === activeKey);
    const host = activeElement?.closest('dialog');
    setAnchor(
      activeElement && host && activeKey
        ? { element: activeElement, host, key: activeKey, fraction: 0.5 }
        : null
    );
    onSelectKey?.(activeKey);
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const capture = (event: { target: EventTarget; clientX?: number; button?: number }) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-ui="gallery.videoReview.timeline"]')
    )
      return;
    const element = event.target.closest<HTMLElement>(
      '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
    );
    const host = element?.closest('dialog');
    const key =
      element?.dataset['reviewRemovalKey'] ??
      element?.dataset['reviewActionKey'] ??
      (element?.dataset['cursorFocusKey']
        ? `cursor-focus:${element.dataset['cursorFocusKey']}`
        : undefined);
    if (!element || !host || !key) {
      setAnchor(null);
      clear();
      previous.current = null;
      return;
    }
    const bounds = element.getBoundingClientRect();
    const fraction =
      event.clientX === undefined
        ? 0.5
        : Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    // Modified gestures are admitted after the lane owner updates track focus.
    if (
      !(
        'ctrlKey' in event &&
        (event.ctrlKey ||
          ('metaKey' in event && event.metaKey) ||
          ('shiftKey' in event && event.shiftKey))
      )
    ) {
      clear();
      previous.current = key;
    }
    setAnchor({ element, host, key, fraction });
  };
  return {
    capture,
    multiSelection: { keys, clear, captureModified, deleteAction },
    setHost,
    target:
      visible && anchor && (multi || anchor.key === reviewTimelineSelectionKey(selection))
        ? { ...anchor, disabled, commandHost, dismiss: () => setAnchor(null) }
        : null,
  };
}

/** Moves existing commands inside the active modal; geometry follows the selected timeline item. */
export function ReviewFloatingSelectionActions({
  target,
  onHost,
}: {
  target: Target;
  onHost(node: HTMLFieldSetElement | null): void;
}) {
  const panel = useRef<HTMLFieldSetElement>(null);
  const setPanel = useCallback(
    (node: HTMLFieldSetElement | null) => {
      panel.current = node;
      onHost(node);
    },
    [onHost]
  );
  const { element, host, fraction } = target;
  useLayoutEffect(() => {
    const node = panel.current;
    const view = element.ownerDocument.defaultView;
    if (!node || !view) return;
    const fallback = element.closest<HTMLElement>('[data-ui="gallery.videoReview.timePlane"]');
    let frame = 0;
    let dragging = false;
    const update = () => {
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      if (dragging || !element.isConnected || !host.isConnected) {
        node.hidden = true;
        return;
      }
      const bounds = element.getBoundingClientRect();
      const limits = host.getBoundingClientRect();
      let left = limits.left,
        right = limits.right,
        top = limits.top,
        bottom = limits.bottom;
      for (
        let parent = element.parentElement;
        parent && parent !== host;
        parent = parent.parentElement
      ) {
        const style = view.getComputedStyle(parent);
        const box = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
          left = Math.max(left, box.left);
          right = Math.min(right, box.right);
        }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
          top = Math.max(top, box.top);
          bottom = Math.min(bottom, box.bottom);
        }
      }
      if (
        bounds.right <= left ||
        bounds.left >= right ||
        bounds.bottom <= top ||
        bounds.top >= bottom
      ) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      if (!node.childElementCount) {
        node.style.visibility = 'hidden';
        return;
      }
      node.style.maxWidth = `${Math.max(0, limits.width - 16)}px`;
      const size = node.getBoundingClientRect();
      const anchorX = Math.max(left, Math.min(right, bounds.left + bounds.width * fraction));
      const panelLeft = Math.max(
        limits.left + 8,
        Math.min(limits.right - size.width - 8, anchorX - size.width / 2)
      );
      const above = bounds.top - size.height - 10 >= limits.top + 8;
      const panelTop = above ? bounds.top - size.height - 10 : bounds.bottom + 10;
      node.style.left = `${panelLeft}px`;
      node.style.top = `${Math.max(limits.top + 8, Math.min(limits.bottom - size.height - 8, panelTop))}px`;
      node.style.setProperty(
        '--review-actions-tail-x',
        `${Math.max(12, Math.min(size.width - 12, anchorX - panelLeft))}px`
      );
      node.dataset['tailSide'] = above ? 'bottom' : 'top';
      node.style.visibility = 'visible';
    };
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(update);
    };
    const move = (event: PointerEvent) => {
      if (
        (event.buttons & 1) !== 0 &&
        event.target instanceof Element &&
        event.target.closest('[data-ui="gallery.videoReview.timeline"]') &&
        event.target.closest(
          '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
        )
      ) {
        dragging = true;
        node.hidden = true;
        return;
      }
      if (event.buttons === 0) dragging = false;
      schedule();
    };
    const finish = () => {
      dragging = false;
      schedule();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(node);
    observer.observe(host);
    // Portal commands arrive after the host ref. Measure them before their first paint.
    const contentObserver = new MutationObserver(update);
    contentObserver.observe(node, { childList: true, subtree: true });
    element.ownerDocument.addEventListener('scroll', schedule, true);
    view.addEventListener('resize', schedule);
    view.addEventListener('pointermove', move, true);
    view.addEventListener('pointerup', finish, true);
    view.addEventListener('pointercancel', finish, true);
    view.addEventListener('blur', finish);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      view.cancelAnimationFrame(frame);
      element.ownerDocument.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      view.removeEventListener('pointermove', move, true);
      view.removeEventListener('pointerup', finish, true);
      view.removeEventListener('pointercancel', finish, true);
      view.removeEventListener('blur', finish);
      if (node.contains(element.ownerDocument.activeElement)) {
        const destination = element.isConnected ? element : fallback?.isConnected ? fallback : null;
        destination?.focus({ preventScroll: true });
      }
    };
  }, [element, host, fraction]);
  return createPortal(
    <fieldset
      ref={setPanel}
      role="toolbar"
      aria-label={translate('gallery.videoReview.actionActions')}
      data-ui="gallery.videoReview.selectionActions"
      className="review-floating-selection-actions"
      disabled={target.disabled}
      style={{ position: 'fixed', visibility: 'hidden' }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Tab') {
          const workspace = target.host.querySelector<HTMLElement>(
            '[data-ui="gallery.videoReview.workspaceScroll"]'
          );
          if (workspace) delete workspace.dataset['reviewPointerSelection'];
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          target.dismiss();
        }
      }}
    />,
    target.host
  );
}

/** Keeps click anchoring and the modal command host in one transient interaction owner. */
export function ReviewSelectionActionsSurface(props: {
  selection: ReviewSelection;
  visible: boolean;
  disabled: boolean;
  onSelectKey?: ((key: string | null) => void) | undefined;
  children: ReactNode;
}) {
  const actions = useReviewSelectionActions(
    props.selection,
    props.visible,
    props.disabled,
    props.onSelectKey
  );
  return (
    <ReviewTimelineMultiSelectionContext value={actions.multiSelection}>
      <ReviewSelectionActionsContext value={actions.target}>
        {actions.target ? (
          <ReviewFloatingSelectionActions target={actions.target} onHost={actions.setHost} />
        ) : null}
        <div
          data-ui="gallery.videoReview.workspaceScroll"
          className="h-full min-h-0 overflow-x-auto overflow-y-hidden"
          onPointerDownCapture={(event) => {
            event.currentTarget.dataset['reviewPointerSelection'] = 'true';
            actions.capture(event);
          }}
          onClickCapture={(event) => {
            if (
              (event.ctrlKey || event.metaKey || event.shiftKey) &&
              event.target instanceof Element &&
              event.target.closest(
                '[data-review-removal-key],[data-review-action-key],[data-cursor-focus-key]'
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onKeyDownCapture={(event) => {
            if (
              ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                event.key
              )
            )
              delete event.currentTarget.dataset['reviewPointerSelection'];
            if (
              actions.multiSelection.keys.length > 1 &&
              (event.key === 'Delete' || event.key === 'Backspace') &&
              event.target instanceof Element &&
              !event.target.closest('input,textarea,[contenteditable="true"]')
            ) {
              event.preventDefault();
              event.stopPropagation();
              actions.multiSelection.deleteAction.current?.();
              return;
            }
            if (event.key === 'Escape' && actions.multiSelection.keys.length > 1) {
              event.preventDefault();
              event.stopPropagation();
              actions.multiSelection.clear();
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') actions.capture(event);
          }}
        >
          {props.children}
        </div>
      </ReviewSelectionActionsContext>
    </ReviewTimelineMultiSelectionContext>
  );
}
