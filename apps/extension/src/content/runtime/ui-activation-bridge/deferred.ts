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
