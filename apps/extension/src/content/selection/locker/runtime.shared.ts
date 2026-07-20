import type { addEventListenerToAllWindowsDynamic, walkAllDocuments } from '../../platform/frame';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { removeNavigationLockOverlay, syncNavigationLockOverlay } from './overlay';

type BeforeUnloadHandler = (this: Window, ev: BeforeUnloadEvent) => string | void;

type LockerLogger = Pick<Logger, 'log'>;

export type NavigationLockerDeps = {
  addEventListenerToAllWindowsDynamic: typeof addEventListenerToAllWindowsDynamic;
  addSelectStartListener: (listener: EventListener) => void;
  logger: LockerLogger;
  removeNavigationLockOverlay: typeof removeNavigationLockOverlay;
  removeSelectStartListener: (listener: EventListener) => void;
  subscribeBeforeUnload: (listener: BeforeUnloadHandler) => void;
  syncNavigationLockOverlay: typeof syncNavigationLockOverlay;
  toggleBodyClass: (className: string, enabled: boolean) => void;
  walkAllDocuments: typeof walkAllDocuments;
  unsubscribeBeforeUnload: (listener: BeforeUnloadHandler) => void;
};

export type NavigationLockerState = {
  beforeUnloadHandler: BeforeUnloadHandler | null;
  cleanupClickHandler: (() => void) | null;
  cleanupKeyDownHandler: (() => void) | null;
  cleanupMouseDownHandler: (() => void) | null;
  cleanupPointerDownHandler: (() => void) | null;
  isFullLockMode: boolean;
  isNavigationLocked: boolean;
  isTextSelectionBlocked: boolean;
  isUIHidden: boolean;
  selectStartHandler: EventListener | null;
};

export type NavigationLockerHandlers = {
  handleInteractionEvent: (event: Event) => void;
  handleKeyDown: (event: Event) => void;
  handleSelectStart: (event: Event) => void;
};

export function createNavigationLockerState(): NavigationLockerState {
  return {
    beforeUnloadHandler: null,
    cleanupClickHandler: null,
    cleanupKeyDownHandler: null,
    cleanupMouseDownHandler: null,
    cleanupPointerDownHandler: null,
    isFullLockMode: false,
    isNavigationLocked: false,
    isTextSelectionBlocked: false,
    isUIHidden: false,
    selectStartHandler: null,
  };
}

function toggleNavigationLockClass(deps: NavigationLockerDeps, enabled: boolean): void {
  deps.walkAllDocuments((doc) => {
    doc.body?.classList.toggle('sniptale-navigation-locked', enabled);
  });
}

export function syncNavigationLockSurfaces(
  deps: NavigationLockerDeps,
  state: NavigationLockerState
): void {
  toggleNavigationLockClass(deps, state.isNavigationLocked);
  deps.syncNavigationLockOverlay(state.isNavigationLocked && !state.isFullLockMode);
}

export function registerNavigationListeners(
  deps: NavigationLockerDeps,
  handlers: NavigationLockerHandlers,
  state: NavigationLockerState
): void {
  state.cleanupPointerDownHandler = deps.addEventListenerToAllWindowsDynamic(
    'pointerdown',
    handlers.handleInteractionEvent,
    { capture: true }
  );
  state.cleanupMouseDownHandler = deps.addEventListenerToAllWindowsDynamic(
    'mousedown',
    handlers.handleInteractionEvent,
    { capture: true }
  );
  state.cleanupClickHandler = deps.addEventListenerToAllWindowsDynamic(
    'click',
    handlers.handleInteractionEvent,
    { capture: true }
  );
  state.cleanupKeyDownHandler = deps.addEventListenerToAllWindowsDynamic(
    'keydown',
    handlers.handleKeyDown,
    { capture: true }
  );
}

export function cleanupNavigationListeners(state: NavigationLockerState): void {
  state.cleanupPointerDownHandler?.();
  state.cleanupPointerDownHandler = null;

  state.cleanupMouseDownHandler?.();
  state.cleanupMouseDownHandler = null;

  state.cleanupClickHandler?.();
  state.cleanupClickHandler = null;

  state.cleanupKeyDownHandler?.();
  state.cleanupKeyDownHandler = null;
}

export function syncExistingNavigationLock(
  deps: NavigationLockerDeps,
  fullLockMode: boolean,
  state: NavigationLockerState
): void {
  deps.logger.log('[Sniptale] Navigation lock already enabled');
  if (state.isFullLockMode !== fullLockMode) {
    state.isFullLockMode = fullLockMode;
    deps.logger.log(
      '[Sniptale] Navigation lock mode updated to:',
      fullLockMode ? 'FULL' : 'LINKS_ONLY'
    );
  }
  syncNavigationLockSurfaces(deps, state);
}

export function attachBeforeUnloadHandler(
  deps: NavigationLockerDeps,
  state: NavigationLockerState
): void {
  state.beforeUnloadHandler = () =>
    'Are you sure you want to leave this page? Changes will be lost.';
  deps.subscribeBeforeUnload(state.beforeUnloadHandler);
}

export function detachBeforeUnloadHandler(
  deps: NavigationLockerDeps,
  state: NavigationLockerState
): void {
  if (!state.beforeUnloadHandler) {
    return;
  }

  deps.unsubscribeBeforeUnload(state.beforeUnloadHandler);
  state.beforeUnloadHandler = null;
}
