import { isTrustedPointerEvent } from '../../platform/trusted-events';
import { getEventPath } from './targets';

const DEFERRED_ACTIVATION_FALLBACK_MS = 1000;

type DeferredActivationListeners = {
  handlePointerCancel: () => void;
  handlePointerUp: () => void;
  markNativeClick: (event: Event) => void;
  root: ShadowRoot | HTMLElement;
  target: Element;
};

type DeferredActivationParams = {
  dispatchActivation: (target: Element, event: PointerEvent) => void;
  event: PointerEvent;
  isBridgedEvent: (event: Event) => boolean;
  onActivate: (target: Element) => void;
  root: ShadowRoot | HTMLElement;
  target: Element;
};

type DeferredActivationState = {
  activated: boolean;
  cleanupListeners: () => void;
  fallbackTimer: number | null;
  nativeClickReached: boolean;
};

function addDeferredActivationListeners(params: DeferredActivationListeners): () => void {
  const { handlePointerCancel, handlePointerUp, markNativeClick, root, target } = params;

  target.addEventListener('click', markNativeClick, { capture: true, once: true });
  root.addEventListener('pointerup', handlePointerUp, { capture: true, once: true });
  window.addEventListener('pointerup', handlePointerUp, { capture: true, once: true });
  root.addEventListener('pointercancel', handlePointerCancel, { capture: true, once: true });
  window.addEventListener('pointercancel', handlePointerCancel, { capture: true, once: true });

  return () => {
    target.removeEventListener('click', markNativeClick, { capture: true });
    root.removeEventListener('pointerup', handlePointerUp, { capture: true });
    window.removeEventListener('pointerup', handlePointerUp, { capture: true });
    root.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
    window.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
  };
}

function cleanupDeferredActivation(state: DeferredActivationState): void {
  state.cleanupListeners();
  if (state.fallbackTimer !== null) {
    window.clearTimeout(state.fallbackTimer);
    state.fallbackTimer = null;
  }
}

function activateDeferred(params: DeferredActivationParams, state: DeferredActivationState): void {
  if (state.activated) {
    return;
  }
  state.activated = true;
  cleanupDeferredActivation(state);

  if (!state.nativeClickReached) {
    params.onActivate(params.target);
    params.dispatchActivation(params.target, params.event);
  }
}

export function scheduleDeferredActivation(params: DeferredActivationParams): void {
  if (params.target.matches('[data-command-press]')) {
    scheduleCommandRelease(params);
    return;
  }
  const state: DeferredActivationState = {
    activated: false,
    cleanupListeners: () => {},
    fallbackTimer: null,
    nativeClickReached: false,
  };
  const cleanup = () => cleanupDeferredActivation(state);
  const activate = () => activateDeferred(params, state);
  const markNativeClick = (event: Event) => {
    state.nativeClickReached = !params.isBridgedEvent(event);
  };
  const handlePointerUp = () => {
    window.setTimeout(activate, 0);
  };

  state.cleanupListeners = addDeferredActivationListeners({
    handlePointerCancel: cleanup,
    handlePointerUp,
    markNativeClick,
    root: params.root,
    target: params.target,
  });
  state.fallbackTimer = window.setTimeout(activate, DEFERRED_ACTIVATION_FALLBACK_MS);
}
/** Marked commands retain native press/release ownership instead of the legacy hold fallback. */
function scheduleCommandRelease(params: DeferredActivationParams): void {
  let phase: 'held' | 'released' | 'finished' = 'held';
  let releaseTimer: number | null = null;
  let nativeClickReached = false;
  const document = params.target.ownerDocument;
  const window = document.defaultView;
  if (!window) return;

  const finish = () => {
    phase = 'finished';
    if (releaseTimer !== null) window.clearTimeout(releaseTimer);
    for (const target of [params.root, window]) {
      target.removeEventListener('pointerup', onPointerUp, true);
      target.removeEventListener('pointercancel', onPointerCancel, true);
      target.removeEventListener('lostpointercapture', onLostCapture, true);
      target.removeEventListener('keydown', onKeyDown, true);
    }
    params.target.removeEventListener('click', onClick, true);
    window.removeEventListener('blur', finish);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const matchesPointer = (event: Event) =>
    isTrustedPointerEvent(event) &&
    'pointerId' in event &&
    event.pointerId === params.event.pointerId;
  const canActivate = () =>
    params.target.isConnected &&
    params.root.contains(params.target) &&
    params.target.matches('[data-command-press]') &&
    !params.target.matches(':disabled, [aria-disabled="true"]');
  const activate = () => {
    const accepted = phase === 'released' && !nativeClickReached && canActivate();
    finish();
    if (accepted) {
      params.onActivate(params.target);
      params.dispatchActivation(params.target, params.event);
    }
  };
  const onPointerUp = (event: Event) => {
    if (phase !== 'held' || !matchesPointer(event)) return;
    if (!getEventPath(event).includes(params.target) || !canActivate()) {
      finish();
      return;
    }
    phase = 'released';
    // A delivered native click wins before the host-cancelled-click fallback runs.
    releaseTimer = window.setTimeout(activate, 0);
  };
  const onPointerCancel = (event: Event) => {
    if (matchesPointer(event)) finish();
  };
  const onLostCapture = (event: Event) => {
    if (phase === 'held' && matchesPointer(event)) finish();
  };
  const onKeyDown = (event: Event) => {
    if ('key' in event && event.key === 'Escape') finish();
  };
  const onVisibility = () => {
    if (document.hidden) finish();
  };
  const onClick = (event: Event) => {
    if (!params.isBridgedEvent(event)) nativeClickReached = true;
  };

  for (const target of [params.root, window]) {
    target.addEventListener('pointerup', onPointerUp, true);
    target.addEventListener('pointercancel', onPointerCancel, true);
    target.addEventListener('lostpointercapture', onLostCapture, true);
    target.addEventListener('keydown', onKeyDown, true);
  }
  params.target.addEventListener('click', onClick, true);
  window.addEventListener('blur', finish);
  document.addEventListener('visibilitychange', onVisibility);
}
