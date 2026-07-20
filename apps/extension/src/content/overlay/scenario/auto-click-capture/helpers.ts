import { getContentEventTargetElement, queryContentUiElement } from '../../../platform/dom-host';
import { resolveIframeEventTarget } from '../../../platform/frame';
import { setUIHidden } from '../../../selection/locker';
import { isScenarioEligibleInteractionTarget } from '../../scenario-recorder/runtime';
import { isTrustedKeyboardEvent, isTrustedPointerEvent } from '../../../platform/trusted-events';
import { createTrustedContentActionIntentSource } from '../../../application/privileged-action-intent';
import {
  buildInteractionPoint,
  buildKeyboardInteractionPoint,
  buildPointerCaptureMetadata,
  getScrollPosition,
  updatePendingPointerRange,
} from './metadata';
import {
  buildKeyboardCaptureMetadata,
  canCaptureScenarioInteraction,
  captureAutoClick,
  clearPendingPointerCapture,
  replayPendingClick,
  resolveKeyboardTarget,
  type ScenarioAutoClickRefs,
  shouldIgnoreReplayClick,
  storePendingReplayClick,
} from './shared';

function isScenarioPreviewOverlayOpen() {
  return Boolean(queryContentUiElement('[data-ui="content.scenario.sidebar.floating-preview"]'));
}

function shouldIgnoreContentOwnedInteraction(event: Event) {
  const target = getContentEventTargetElement(event);
  return Boolean(target && !isScenarioEligibleInteractionTarget(target));
}

function withOptionalIframe(
  clientX: number,
  clientY: number,
  iframe?: HTMLIFrameElement
): { clientX: number; clientY: number; iframe?: HTMLIFrameElement } {
  return iframe === undefined ? { clientX, clientY } : { clientX, clientY, iframe };
}

export function createScenarioPointerDownHandler(refs: ScenarioAutoClickRefs) {
  return (event: PointerEvent, iframe?: HTMLIFrameElement) => {
    if (
      !isTrustedPointerEvent(event) ||
      event.button !== 0 ||
      !canCaptureScenarioInteraction(refs, 'pointer')
    ) {
      clearPendingPointerCapture(refs);
      return;
    }

    if (isScenarioPreviewOverlayOpen() || shouldIgnoreContentOwnedInteraction(event)) {
      clearPendingPointerCapture(refs);
      return;
    }

    const target = resolveIframeEventTarget(event, iframe);
    if (!isScenarioEligibleInteractionTarget(target)) {
      clearPendingPointerCapture(refs);
      return;
    }

    const startPoint = buildInteractionPoint(
      withOptionalIframe(event.clientX, event.clientY, iframe)
    );
    const scrollPosition = getScrollPosition(iframe);

    refs.pendingPointerCaptureRef.current = {
      endPoint: startPoint,
      maxX: startPoint.x,
      maxY: startPoint.y,
      minX: startPoint.x,
      minY: startPoint.y,
      scrollStartX: scrollPosition.x,
      scrollStartY: scrollPosition.y,
      startPoint,
      startedAt: Date.now(),
      target,
      ...(iframe === undefined ? {} : { iframe }),
    };
  };
}

export function createScenarioPointerMoveHandler(refs: ScenarioAutoClickRefs) {
  return (event: PointerEvent, iframe?: HTMLIFrameElement) => {
    const pendingPointerCapture = refs.pendingPointerCaptureRef.current;
    if (!pendingPointerCapture || !isTrustedPointerEvent(event)) {
      return;
    }

    updatePendingPointerRange(
      pendingPointerCapture,
      buildInteractionPoint(
        withOptionalIframe(event.clientX, event.clientY, pendingPointerCapture.iframe ?? iframe)
      )
    );
  };
}

export function createScenarioPointerUpHandler(refs: ScenarioAutoClickRefs) {
  return (event: PointerEvent, iframe?: HTMLIFrameElement) => {
    const pendingPointerCapture = refs.pendingPointerCaptureRef.current;
    clearPendingPointerCapture(refs);
    if (
      !pendingPointerCapture ||
      !isTrustedPointerEvent(event) ||
      !canCaptureScenarioInteraction(refs, 'pointer')
    ) {
      return;
    }

    if (isScenarioPreviewOverlayOpen() || shouldIgnoreContentOwnedInteraction(event)) {
      return;
    }

    const interactionPoint = buildInteractionPoint(
      withOptionalIframe(event.clientX, event.clientY, pendingPointerCapture.iframe ?? iframe)
    );
    updatePendingPointerRange(pendingPointerCapture, interactionPoint);

    const payload = refs.buildCapturePayloadRef.current(
      'visible',
      'auto-click',
      pendingPointerCapture.target,
      interactionPoint,
      interactionPoint,
      buildPointerCaptureMetadata(pendingPointerCapture)
    );
    if (!payload) {
      return;
    }

    refs.pendingReplayClickRef.current = storePendingReplayClick(
      event,
      pendingPointerCapture.target,
      interactionPoint
    );
    const contentIntentSource = createTrustedContentActionIntentSource(event);
    refs.clickCapturePromiseRef.current = captureAutoClick(
      payload,
      refs,
      contentIntentSource ?? undefined
    ).finally(() => {
      setUIHidden(false);
      refs.setIsCompletelyHiddenRef.current(false);
    });
  };
}

export function createScenarioKeyboardCaptureHandler(refs: ScenarioAutoClickRefs) {
  return (event: KeyboardEvent, iframe?: HTMLIFrameElement) => {
    if (
      !isTrustedKeyboardEvent(event) ||
      event.key !== 'Enter' ||
      !canCaptureScenarioInteraction(refs, 'keyboard')
    ) {
      return;
    }

    if (isScenarioPreviewOverlayOpen() || shouldIgnoreContentOwnedInteraction(event)) {
      return;
    }

    const target = resolveKeyboardTarget(event, iframe);
    if (!target) {
      return;
    }

    const interactionPoint = buildKeyboardInteractionPoint(target, iframe);
    const payload = refs.buildCapturePayloadRef.current(
      'visible',
      'auto-click',
      target,
      interactionPoint,
      interactionPoint,
      buildKeyboardCaptureMetadata(iframe)
    );
    if (!payload) {
      return;
    }

    const contentIntentSource = createTrustedContentActionIntentSource(event);
    refs.clickCapturePromiseRef.current = captureAutoClick(
      payload,
      refs,
      contentIntentSource ?? undefined
    ).finally(() => {
      setUIHidden(false);
      refs.setIsCompletelyHiddenRef.current(false);
    });
  };
}

export function createScenarioClickReplayHandler(refs: ScenarioAutoClickRefs) {
  return (event: MouseEvent) => {
    if (shouldIgnoreReplayClick(event, refs)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const pendingReplayClick = refs.pendingReplayClickRef.current;
    refs.pendingReplayClickRef.current = null;
    const capturePromise = refs.clickCapturePromiseRef.current ?? Promise.resolve(false);
    refs.clickCapturePromiseRef.current = null;
    if (!pendingReplayClick) {
      return;
    }

    void capturePromise.then((captureSucceeded) => {
      if (captureSucceeded) {
        replayPendingClick(pendingReplayClick, refs);
      }
    });
  };
}
