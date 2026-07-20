import {
  addEventListenerToAllWindowsDynamic,
  resolveIframeEventTarget,
} from '../../../platform/frame';
import { setUIHidden } from '../../../selection/locker';
import { isScenarioEligibleInteractionTarget } from '../../scenario-recorder/runtime';
import type {
  PendingReplayClick,
  ScenarioAutoClickListenerHandlers,
  ScenarioAutoClickRefs,
} from './types';

const SCENARIO_CAPTURE_HIDE_DELAY_MS = 170;

export function registerScenarioAutoClickListeners(args: ScenarioAutoClickListenerHandlers) {
  const cleanups = [
    addEventListenerToAllWindowsDynamic<PointerEvent>('pointerdown', args.pointerDownHandler, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<MouseEvent>('click', args.clickReplayHandler, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<PointerEvent>('pointermove', args.pointerMoveHandler, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<PointerEvent>('pointerup', args.pointerUpHandler, {
      capture: true,
    }),
    addEventListenerToAllWindowsDynamic<KeyboardEvent>('keyup', args.keyboardCaptureHandler, {
      capture: true,
    }),
  ];

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}

export function resolveScenarioKeyboardTarget(event: KeyboardEvent, iframe?: HTMLIFrameElement) {
  const target = resolveIframeEventTarget(event, iframe);
  if (target && isScenarioEligibleInteractionTarget(target)) {
    return target;
  }

  const doc = iframe?.contentDocument ?? document;
  const activeElement = doc.activeElement;
  return activeElement instanceof HTMLElement && isScenarioEligibleInteractionTarget(activeElement)
    ? activeElement
    : null;
}

export function setScenarioAutoClickUiHidden(
  hidden: boolean,
  setIsCompletelyHidden: (hidden: boolean) => void
) {
  setUIHidden(hidden);
  setIsCompletelyHidden(hidden);
}

export function waitForScenarioAutoClickCaptureWindow(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, SCENARIO_CAPTURE_HIDE_DELAY_MS));
}

export function replayScenarioPendingClick(
  pendingReplayClick: PendingReplayClick,
  refs: ScenarioAutoClickRefs
) {
  refs.replayingClickRef.current = true;
  const replayEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: pendingReplayClick.clientPoint.x,
    clientY: pendingReplayClick.clientPoint.y,
    ...pendingReplayClick.modifiers,
  });
  const shouldRunDefaultAction = pendingReplayClick.target.dispatchEvent(replayEvent);
  if (shouldRunDefaultAction) {
    activateDefaultAnchorNavigation(pendingReplayClick.target);
  }
  window.setTimeout(() => {
    refs.replayingClickRef.current = false;
  }, 0);
}

function activateDefaultAnchorNavigation(target: HTMLElement): void {
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  const view = target.ownerDocument.defaultView;
  if (!anchor?.href || !view) {
    return;
  }

  const targetName = anchor.getAttribute('target');
  if (targetName && targetName !== '_self') {
    const features =
      targetName === '_blank' && !anchor.relList.contains('opener') ? 'noopener' : undefined;
    view.open(anchor.href, targetName, features);
    return;
  }

  view.location.assign(anchor.href);
}
