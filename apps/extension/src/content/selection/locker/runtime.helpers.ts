import {
  attachBeforeUnloadHandler,
  cleanupNavigationListeners,
  detachBeforeUnloadHandler,
  registerNavigationListeners,
  syncExistingNavigationLock,
  syncNavigationLockSurfaces,
  type NavigationLockerDeps,
  type NavigationLockerHandlers,
  type NavigationLockerState,
} from './runtime.shared';
import {
  createLockerKeyDownState,
  handleLockerInteractionEvent,
  handleLockerKeyDown,
  handleLockerSelectStart,
} from './events';

export function createNavigationLockerHandlers(
  state: NavigationLockerState
): NavigationLockerHandlers {
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

export function createNavigationLockApi(
  deps: NavigationLockerDeps,
  handlers: NavigationLockerHandlers,
  state: NavigationLockerState
) {
  const enableNavigationLock = createEnableNavigationLock(deps, handlers, state);
  const disableNavigationLock = createDisableNavigationLock(deps, state);
  const setFullLockMode = createSetFullLockMode(deps, state);

  return { disableNavigationLock, enableNavigationLock, setFullLockMode };
}
