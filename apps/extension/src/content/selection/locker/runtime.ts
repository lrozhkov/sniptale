import { addEventListenerToAllWindowsDynamic, walkAllDocuments } from '../../platform/frame';
import { createLogger } from '@sniptale/platform/observability/logger';
import { removeNavigationLockOverlay, syncNavigationLockOverlay } from './overlay';
import { createNavigationLockApi, createNavigationLockerHandlers } from './runtime.helpers';
import {
  createNavigationLockerState,
  type NavigationLockerDeps,
  type NavigationLockerHandlers,
  type NavigationLockerState,
} from './runtime.shared';

export type { NavigationLockerDeps } from './runtime.shared';

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
      deps.logger.log('[Sniptale] UI hidden flag set to:', hidden);
    },
  };
}
