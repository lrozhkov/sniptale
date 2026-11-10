import {
  type ReactNode,
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

function selectionKey(selection: ReviewSelection): string | null {
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
  disabled: boolean
) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [commandHost, setHost] = useState<HTMLFieldSetElement | null>(null);
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
      return;
    }
    const bounds = element.getBoundingClientRect();
    const fraction =
      event.clientX === undefined
        ? 0.5
        : Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)));
    setAnchor({ element, host, key, fraction });
  };
  return {
    capture,
    setHost,
    target:
      visible && anchor && anchor.key === selectionKey(selection)
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
    const update = () => {
      if (frame) view.cancelAnimationFrame(frame);
      frame = 0;
      if (!element.isConnected || !host.isConnected) {
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
    view.addEventListener('pointermove', schedule);
    return () => {
      observer.disconnect();
      contentObserver.disconnect();
      view.cancelAnimationFrame(frame);
      element.ownerDocument.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      view.removeEventListener('pointermove', schedule);
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
  children: ReactNode;
}) {
  const actions = useReviewSelectionActions(props.selection, props.visible, props.disabled);
  return (
    <ReviewSelectionActionsContext value={actions.target}>
      {actions.target ? (
        <ReviewFloatingSelectionActions target={actions.target} onHost={actions.setHost} />
      ) : null}
      <div
        data-ui="gallery.videoReview.workspaceScroll"
        className="h-full min-h-0 overflow-x-auto overflow-y-hidden"
        onPointerDownCapture={actions.capture}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' || event.key === ' ') actions.capture(event);
        }}
      >
        {props.children}
      </div>
    </ReviewSelectionActionsContext>
  );
}
