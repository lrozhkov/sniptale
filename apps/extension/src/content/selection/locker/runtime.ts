import { addEventListenerToAllWindowsDynamic, walkAllDocuments } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import { toggleContentHostClass } from '../../platform/dom-host';
import { removeNavigationLockOverlay, syncNavigationLockOverlay } from './overlay';
import {
  createLockerKeyDownState,
  handleLockerInteractionEvent,
  handleLockerKeyDown,
  handleLockerSelectStart,
} from './events';
import {
  attachBeforeUnloadHandler,
  cleanupNavigationListeners,
  createNavigationLockerState,
  detachBeforeUnloadHandler,
  registerNavigationListeners,
  syncExistingNavigationLock,
  syncNavigationLockSurfaces,
  type NavigationLockerDeps,
  type NavigationLockerHandlers,
  type NavigationLockerState,
} from './runtime-lifecycle';

export type { NavigationLockerDeps } from './runtime-lifecycle';

function createNavigationLockerHandlers(state: NavigationLockerState): NavigationLockerHandlers {
  return {
    handleInteractionEvent: (event) => {
      handleLockerInteractionEvent(event, {
        isFullLockMode: state.isFullLockMode,
        isNavigationLocked: state.isNavigationLocked,
        isUIHidden: state.isUIHidden,
      });
    },
    handleKeyDown: (event) => {
      handleLockerKeyDown(
        event,
        createLockerKeyDownState({
          isFullLockMode: state.isFullLockMode,
          isNavigationLocked: state.isNavigationLocked,
          isUIHidden: state.isUIHidden,
        })
      );
    },
    handleSelectStart: (event) => {
      handleLockerSelectStart(event);
    },
  };
}

function createEnableNavigationLock(
  deps: NavigationLockerDeps,
  handlers: NavigationLockerHandlers,
  state: NavigationLockerState
) {
  return (fullLockMode = true): void => {
    if (state.isNavigationLocked) {
      syncExistingNavigationLock(deps, fullLockMode, state);
      return;
    }

    deps.logger.log(
      '[Sniptale] Enabling navigation lock, mode:',
      fullLockMode ? 'FULL' : 'LINKS_ONLY'
    );
    state.isNavigationLocked = true;
    state.isFullLockMode = fullLockMode;
    syncNavigationLockSurfaces(deps, state);
    registerNavigationListeners(deps, handlers, state);
    attachBeforeUnloadHandler(deps, state);
    deps.logger.log('[Sniptale] Navigation lock enabled');
  };
}

function createDisableNavigationLock(deps: NavigationLockerDeps, state: NavigationLockerState) {
  return (): void => {
    if (!state.isNavigationLocked) {
      deps.logger.log('[Sniptale] Navigation lock already disabled');
      return;
    }

    deps.logger.log('[Sniptale] Disabling navigation lock');
    state.isNavigationLocked = false;
    syncNavigationLockSurfaces(deps, state);
    cleanupNavigationListeners(state);
    detachBeforeUnloadHandler(deps, state);
    deps.removeNavigationLockOverlay();
    deps.logger.log('[Sniptale] Navigation lock disabled');
  };
}

function createSetFullLockMode(deps: NavigationLockerDeps, state: NavigationLockerState) {
  return (enabled: boolean): void => {
    if (!state.isNavigationLocked) {
      deps.logger.log('[Sniptale] Cannot set lock mode - navigation lock is not enabled');
      return;
    }

    state.isFullLockMode = enabled;
    syncNavigationLockSurfaces(deps, state);
    deps.logger.log('[Sniptale] Full lock mode set to:', enabled);
  };
}

function createNavigationLockApi(
  deps: NavigationLockerDeps,
  handlers: NavigationLockerHandlers,
  state: NavigationLockerState
) {
  const enableNavigationLock = createEnableNavigationLock(deps, handlers, state);
  const disableNavigationLock = createDisableNavigationLock(deps, state);
  const setFullLockMode = createSetFullLockMode(deps, state);

  return { disableNavigationLock, enableNavigationLock, setFullLockMode };
}

const defaultNavigationLockerDeps: NavigationLockerDeps = {
  addEventListenerToAllWindowsDynamic,
  addSelectStartListener: (listener) => {
    walkAllDocuments((doc) => {
      doc.addEventListener('selectstart', listener, { capture: true });
    });
  },
  logger: createLogger({ namespace: 'ContentNavigationLocker' }),
  removeNavigationLockOverlay,
  removeSelectStartListener: (listener) => {
    walkAllDocuments((doc) => {
      doc.removeEventListener('selectstart', listener, { capture: true });
    });
  },
  subscribeBeforeUnload: (listener) => {
    window.addEventListener('beforeunload', listener);
  },
  syncNavigationLockOverlay,
  toggleBodyClass: (className, enabled) => {
    document.body?.classList.toggle(className, enabled);
  },
  toggleContentHostClass,
  walkAllDocuments,
  unsubscribeBeforeUnload: (listener) => {
    window.removeEventListener('beforeunload', listener);
  },
};

function createTextSelectionApi(
  deps: NavigationLockerDeps,
  handlers: NavigationLockerHandlers,
  state: NavigationLockerState
) {
  function enableTextSelectionBlock(): void {
    if (state.isTextSelectionBlocked) {
      deps.logger.log('[Sniptale] Text selection block already enabled');
      return;
    }

    deps.logger.log('[Sniptale] Enabling text selection block');
    state.isTextSelectionBlocked = true;
    deps.toggleBodyClass('sniptale-no-select', true);
    state.selectStartHandler = handlers.handleSelectStart;
    deps.addSelectStartListener(state.selectStartHandler);
    deps.logger.log('[Sniptale] Text selection block enabled');
  }

  function disableTextSelectionBlock(): void {
    if (!state.isTextSelectionBlocked) {
      deps.logger.log('[Sniptale] Text selection block already disabled');
      return;
    }

    deps.logger.log('[Sniptale] Disabling text selection block');
    state.isTextSelectionBlocked = false;
    deps.toggleBodyClass('sniptale-no-select', false);
    if (state.selectStartHandler) {
      deps.removeSelectStartListener(state.selectStartHandler);
      state.selectStartHandler = null;
    }
    deps.logger.log('[Sniptale] Text selection block disabled');
  }

  return { disableTextSelectionBlock, enableTextSelectionBlock };
}

/**
 * Creates an instance-based navigation locker so runtime side effects can be tested
 * without relying on the singleton module state.
 */
export function createNavigationLocker(deps: NavigationLockerDeps = defaultNavigationLockerDeps) {
  const state = createNavigationLockerState();
  const handlers = createNavigationLockerHandlers(state);
  const navigationLockApi = createNavigationLockApi(deps, handlers, state);
  const textSelectionApi = createTextSelectionApi(deps, handlers, state);

  return {
    ...navigationLockApi,
    ...textSelectionApi,
    isFullLockEnabled: () => state.isFullLockMode,
    isLockEnabled: () => state.isNavigationLocked,
    isTextSelectionBlockEnabled: () => state.isTextSelectionBlocked,
    setUIHidden: (hidden: boolean) => {
      state.isUIHidden = hidden;
      deps.toggleBodyClass('sniptale-capture-ui-hidden', hidden);
      deps.toggleContentHostClass('sniptale-capture-ui-hidden', hidden);
      deps.logger.log('[Sniptale] UI hidden flag set to:', hidden);
    },
  };
}
