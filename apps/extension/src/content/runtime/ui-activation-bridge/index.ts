import { scheduleDeferredActivation } from './deferred';
import {
  createBridgedMouseEvent,
  isBridgedMouseEvent,
} from '../../platform/trusted-events/synthetic-mouse';
import {
  getEventPath,
  isPrimaryPointerEvent,
  resolveActivationTarget,
  resolveEditableTarget,
} from './targets';
import { isTrustedPointerEvent } from '../../platform/trusted-events';

const BRIDGED_POINTER_WINDOW_MS = 750;
const installedRoots = new WeakSet<EventTarget>();

type BridgedActivation = {
  target: Element;
  timestamp: number;
};

function dispatchSyntheticActivation(target: Element, event: PointerEvent): void {
  target.dispatchEvent(createBridgedMouseEvent('mousedown', event));
  target.dispatchEvent(createBridgedMouseEvent('click', event));
}

function shouldSuppressFollowUpEvent(
  event: Event,
  bridgedActivation: BridgedActivation | null
): boolean {
  if (!bridgedActivation || isBridgedMouseEvent(event)) {
    return false;
  }

  return (
    performance.now() - bridgedActivation.timestamp <= BRIDGED_POINTER_WINDOW_MS &&
    getEventPath(event).includes(bridgedActivation.target)
  );
}

function focusEditablePointerTarget(event: PointerEvent, root: ShadowRoot | HTMLElement): void {
  const editableTarget = resolveEditableTarget(event, root);
  if (!editableTarget || editableTarget.matches(':disabled')) {
    return;
  }

  editableTarget.focus({ preventScroll: true });
}

function handleActivationPointerDown(params: {
  event: PointerEvent;
  recordActivation: (target: Element) => void;
  root: ShadowRoot | HTMLElement;
}): void {
  const { event, recordActivation, root } = params;
  const activationTarget = resolveActivationTarget(event, root);
  if (!activationTarget) {
    return;
  }

  if (activationTarget.mode === 'defer') {
    scheduleDeferredActivation({
      dispatchActivation: dispatchSyntheticActivation,
      event,
      isBridgedEvent: isBridgedMouseEvent,
      root,
      target: activationTarget.element,
      onActivate: recordActivation,
    });
    return;
  }

  recordActivation(activationTarget.element);
  dispatchSyntheticActivation(activationTarget.element, event);
}

function installFollowUpSuppressors(
  root: ShadowRoot | HTMLElement,
  getBridgedActivation: () => BridgedActivation | null
): void {
  for (const eventType of ['mousedown', 'click'] as const) {
    root.addEventListener(
      eventType,
      (event) => {
        if (!shouldSuppressFollowUpEvent(event, getBridgedActivation())) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
      },
      { capture: true }
    );
  }
}

/**
 * Host pages can cancel mousedown/click at window capture before content-owned React handlers run.
 * This bridge converts primary pointerdown on Sniptale-owned controls into local shadow-tree
 * mousedown/click events, while suppressing only the duplicate native follow-up events.
 */
export function installContentUiActivationBridge(root: ShadowRoot | HTMLElement): void {
  if (installedRoots.has(root)) {
    return;
  }
  installedRoots.add(root);

  let bridgedActivation: BridgedActivation | null = null;

  root.addEventListener(
    'pointerdown',
    (event) => {
      if (!isTrustedPointerEvent(event) || !isPrimaryPointerEvent(event)) {
        return;
      }

      focusEditablePointerTarget(event, root);
      handleActivationPointerDown({
        event,
        root,
        recordActivation: (target) => {
          bridgedActivation = {
            target,
            timestamp: performance.now(),
          };
        },
      });
    },
    { capture: true }
  );

  installFollowUpSuppressors(root, () => bridgedActivation);
}
