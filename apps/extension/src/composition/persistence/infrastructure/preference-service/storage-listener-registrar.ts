import { browserStorage } from '../browser-storage';
import { resolveStorageBackedPreferenceBackend } from './helpers';
import type {
  CreateStorageBackedPreferenceServiceArgs,
  StorageBackedPreferenceState,
} from './types';

function registerBrowserStorageListener<TCurrent, TStored extends string>(props: {
  args: CreateStorageBackedPreferenceServiceArgs<TCurrent, TStored>;
  handleBrowserStorageChange: (
    changes: Record<string, { newValue?: unknown }>,
    areaName: chrome.storage.AreaName
  ) => void;
}) {
  const canObserve = props.args.canObserveBrowserStorageChanges?.() ?? true;
  return canObserve ? browserStorage.subscribeToChanges(props.handleBrowserStorageChange) : null;
}

function registerLocalStorageListener(handleLocalStorageChange: (event: StorageEvent) => void) {
  if (typeof window === 'undefined') {
    return null;
  }

  window.addEventListener('storage', handleLocalStorageChange);
  return () => {
    window.removeEventListener('storage', handleLocalStorageChange);
  };
}

export function createStorageListenerRegistrar<TCurrent, TStored extends string>(props: {
  args: CreateStorageBackedPreferenceServiceArgs<TCurrent, TStored>;
  handleBrowserStorageChange: (
    changes: Record<string, { newValue?: unknown }>,
    areaName: chrome.storage.AreaName
  ) => void;
  handleLocalStorageChange: (event: StorageEvent) => void;
  state: StorageBackedPreferenceState<TCurrent>;
}) {
  const clearStorageListener = () => {
    if (!props.state.storageListenerCleanup) {
      return;
    }

    props.state.storageListenerCleanup();
    props.state.storageListenerCleanup = null;
  };

  const registerStorageListener = (): (() => void) | null => {
    if (resolveStorageBackedPreferenceBackend(props.args, props.state) === 'browser') {
      return registerBrowserStorageListener(props);
    }

    return registerLocalStorageListener(props.handleLocalStorageChange);
  };

  return {
    cleanupStorageListenerIfUnused: () => {
      if (props.state.listeners.size === 0) {
        clearStorageListener();
      }
    },
    ensureStorageListenerRegistered: () => {
      if (props.state.storageListenerCleanup) {
        return;
      }

      props.state.storageListenerCleanup = registerStorageListener();
    },
  };
}
