import type { ScenarioRuntimeCapturePayload } from '../../../../contracts/messaging/contracts/types';
import type {
  ScenarioCaptureMetadata,
  ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { getScrollPosition } from './metadata';
import {
  replayScenarioPendingClick,
  resolveScenarioKeyboardTarget,
  setScenarioAutoClickUiHidden,
  waitForScenarioAutoClickCaptureWindow,
} from './dom-driver';
import { captureVisibleScenarioInteraction } from '../runtime/transport/capture';
import { isTrustedMouseEvent } from '../../../platform/trusted-events';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';
import type {
  PendingReplayClick,
  ScenarioAutoClickCaptureTransport,
  ScenarioAutoClickRefs,
} from './types';

export type {
  BuildScenarioCapturePayload,
  ScenarioAutoClickCaptureTransport,
  ScenarioAutoClickListenerRegistry,
  ScenarioAutoClickRefs,
} from './types';

export const defaultScenarioAutoClickCaptureTransport: ScenarioAutoClickCaptureTransport =
  captureVisibleScenarioInteraction;

export function canCaptureScenarioInteraction(
  refs: ScenarioAutoClickRefs,
  trigger: 'keyboard' | 'pointer'
) {
  const currentSession = refs.sessionRef.current;
  if (refs.blockedRef.current || refs.replayingClickRef.current) {
    return false;
  }

  if (currentSession.captureMode !== 'by-click' || currentSession.pendingProjectSelection) {
    return false;
  }

  return trigger === 'keyboard' || currentSession.enabled;
}

export function storePendingReplayClick(
  event: PointerEvent,
  target: HTMLElement,
  clientPoint: ScenarioPoint
): PendingReplayClick {
  return {
    clientPoint,
    modifiers: {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      button: event.button,
      detail: event.detail,
    },
    target,
  };
}

export async function captureAutoClick(
  payload: ScenarioRuntimeCapturePayload,
  refs: ScenarioAutoClickRefs,
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
) {
  setScenarioAutoClickUiHidden(true, refs.setIsCompletelyHiddenRef.current);
  await waitForScenarioAutoClickCaptureWindow();

  const captureResponse = await refs.captureTransportRef.current(payload, {
    contentIntentSource,
  });
  if (captureResponse?.success) {
    await refs.refreshSessionRef.current();
    return true;
  }

  return false;
}

export function clearPendingPointerCapture(refs: ScenarioAutoClickRefs) {
  refs.pendingPointerCaptureRef.current = null;
}

export function resolveKeyboardTarget(event: KeyboardEvent, iframe?: HTMLIFrameElement) {
  return resolveScenarioKeyboardTarget(event, iframe);
}

export function replayPendingClick(
  pendingReplayClick: PendingReplayClick,
  refs: ScenarioAutoClickRefs
) {
  replayScenarioPendingClick(pendingReplayClick, refs);
}

export function shouldIgnoreReplayClick(event: MouseEvent, refs: ScenarioAutoClickRefs) {
  const currentSession = refs.sessionRef.current;
  if (
    refs.replayingClickRef.current ||
    !isTrustedMouseEvent(event) ||
    !refs.pendingReplayClickRef.current
  ) {
    return true;
  }

  return (
    refs.blockedRef.current ||
    currentSession.captureMode !== 'by-click' ||
    currentSession.pendingProjectSelection
  );
}

export function buildKeyboardCaptureMetadata(iframe?: HTMLIFrameElement): ScenarioCaptureMetadata {
  const scrollPosition = getScrollPosition(iframe);
  return {
    pointerRange: null,
    scroll: {
      startX: scrollPosition.x,
      startY: scrollPosition.y,
      endX: scrollPosition.x,
      endY: scrollPosition.y,
      deltaX: 0,
      deltaY: 0,
    },
    trigger: 'keyboard-enter',
  };
}
