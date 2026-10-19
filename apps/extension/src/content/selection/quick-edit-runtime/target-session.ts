import type { EditableElement } from '../../../features/highlighter/contracts';
import {
  addWindowEventListenerToAllWindowsDynamic,
  mountStyleInAccessibleDocuments,
} from '../../platform/frame';
import {
  isTrustedKeyboardEvent,
  isTrustedMouseEvent,
  isTrustedPointerEvent,
} from '../../platform/trusted-events';
import { setNavigationInputShieldSuspended } from '../locker';
import { createQuickEditEditingActions } from './editing';
import { isQuickEditTextElement } from './elements';
import { handleQuickEditKeyDown } from './keydown';
import { createQuickEditOverlayState } from './overlay.state';
import { createQuickEditOverlayActions } from './overlays';

/** Uses the existing Content Editing target policy without switching preparation modes. */
export function canEditQuickEditTarget(target: Element): boolean {
  const ElementConstructor = target.ownerDocument.defaultView?.HTMLElement ?? HTMLElement;
  return (
    (target instanceof HTMLElement || target instanceof ElementConstructor) &&
    target.isConnected &&
    isQuickEditTextElement(target)
  );
}

/** Owns one inline text interaction and commits on each supported completion gesture. */
export function createQuickEditTargetSession(args: {
  target: HTMLElement;
  onFinish: () => void;
  onError: (error: unknown) => void;
}): { finish: () => void; dispose: () => void } {
  if (!canEditQuickEditTarget(args.target)) throw new Error('Text target is not editable');
  const target = args.target;
  const editingElements = new Map<string, EditableElement>();
  const overlayState = createQuickEditOverlayState();
  const overlayActions = createQuickEditOverlayActions(overlayState);
  const actions = createQuickEditEditingActions({
    editingElements,
    overlayActions,
    setInputShieldSuspended: setNavigationInputShieldSuspended,
    updateBlockingOverlayShape: overlayActions.updateBlockingOverlayShape,
  });
  let settled = false;
  const cleanups: Array<() => void> = [];
  function cleanup(): void {
    cleanups.splice(0).forEach((dispose) => dispose());
    overlayActions.disconnectResizeObserver();
    overlayActions.removeBlockingOverlay();
  }
  function finish(): void {
    if (settled) return;
    settled = true;
    try {
      actions.finishEditing(target);
    } catch (error) {
      args.onError(error);
    } finally {
      cleanup();
      args.onFinish();
    }
  }
  try {
    cleanups.push(
      mountStyleInAccessibleDocuments({
        styleId: 'sniptale-quick-edit-target-style',
        textContent: `
          .sniptale-editing,
          .sniptale-editing:focus {
            outline: none !important;
            box-shadow: none !important;
            cursor: text !important;
          }
        `,
      })
    );
    overlayActions.createBlockingOverlay();
    actions.makeElementEditable(target);
    cleanups.push(
      addWindowEventListenerToAllWindowsDynamic<KeyboardEvent>(
        'keydown',
        (event) => {
          if (
            settled ||
            !isTrustedKeyboardEvent(event) ||
            event.isComposing ||
            event.keyCode === 229
          )
            return;
          handleQuickEditKeyDown(event, {
            isEnabled: () => !settled,
            isDocumentModeEnabled: () => false,
            editingElementsSize: () => editingElements.size,
            hideHoverOverlay: () => {},
            showHoverOverlay: () => {},
            makeElementEditable: () => {},
            finishEditing: finish,
            cancelEditing: finish,
            disableDocumentMode: () => {},
            disableRequested: finish,
          });
        },
        { capture: true }
      )
    );
    cleanups.push(
      addWindowEventListenerToAllWindowsDynamic<PointerEvent>(
        'pointerdown',
        (event) => {
          if (settled || !isTrustedPointerEvent(event) || event.composedPath().includes(target))
            return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        },
        { capture: true }
      )
    );
    cleanups.push(
      addWindowEventListenerToAllWindowsDynamic<MouseEvent>(
        'click',
        (event) => {
          if (settled || !isTrustedMouseEvent(event) || event.composedPath().includes(target))
            return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          finish();
        },
        { capture: true }
      )
    );
    const Observer = target.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer(() => {
      if (!target.isConnected) finish();
    });
    observer.observe(target.ownerDocument, { childList: true, subtree: true });
    cleanups.push(() => observer.disconnect());
  } catch (error) {
    cleanup();
    if (editingElements.size > 0) actions.cancelEditing(target);
    throw error;
  }
  return { finish, dispose: finish };
}
