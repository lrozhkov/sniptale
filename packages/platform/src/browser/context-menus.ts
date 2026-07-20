import {
  normalizeChromeRuntimeError,
  runChromeVoidCallback,
  subscribeToChromeEvent,
} from './callback';

type ContextMenusOnClickedListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) => void;
type ContextMenusOnShownListener = (info: unknown, tab?: chrome.tabs.Tab) => void;
export type BrowserContextMenuUpdateProperties = Omit<chrome.contextMenus.CreateProperties, 'id'>;

interface ContextMenusCompatEvent<Listener> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}

interface ContextMenusCompatApi {
  create(
    createProperties: chrome.contextMenus.CreateProperties,
    callback?: () => void
  ): string | number;
  update(
    id: string | number,
    updateProperties: Omit<chrome.contextMenus.CreateProperties, 'id'>,
    callback?: () => void
  ): Promise<void> | void;
  removeAll(callback?: () => void): Promise<void> | void;
  refresh?: (callback?: () => void) => Promise<void> | void;
  onClicked: ContextMenusCompatEvent<ContextMenusOnClickedListener>;
  onShown?: ContextMenusCompatEvent<ContextMenusOnShownListener>;
}

function getContextMenusApi(): ContextMenusCompatApi | null {
  if (typeof chrome === 'undefined') {
    return null;
  }

  return (chrome as typeof chrome & { contextMenus?: ContextMenusCompatApi }).contextMenus ?? null;
}

/**
 * Shared browser context menus seam for creation, updates, refresh, and listeners.
 */
interface BrowserContextMenusAdapter {
  isAvailable(): boolean;
  create(createProperties: chrome.contextMenus.CreateProperties): Promise<string | number>;
  update(id: string | number, updateProperties: BrowserContextMenuUpdateProperties): Promise<void>;
  removeAll(): Promise<void>;
  refresh(): Promise<void>;
  subscribeToClicked(listener: ContextMenusOnClickedListener): () => void;
  subscribeToShown(listener: ContextMenusOnShownListener): () => void;
}

export const browserContextMenus: BrowserContextMenusAdapter = {
  isAvailable() {
    return getContextMenusApi() !== null;
  },

  create(createProperties) {
    const api = getContextMenusApi();
    if (!api) {
      return Promise.reject(new Error('chrome.contextMenus is unavailable'));
    }

    return new Promise<string | number>((resolve, reject) => {
      let createdId: string | number | null = null;

      try {
        createdId = api.create(createProperties, () => {
          const lastError = chrome.runtime?.lastError;
          if (lastError) {
            reject(normalizeChromeRuntimeError(lastError));
            return;
          }

          queueMicrotask(() => {
            if (createdId === null) {
              reject(new Error('chrome.contextMenus.create returned no menu id'));
              return;
            }

            resolve(createdId);
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  update(id, updateProperties) {
    const api = getContextMenusApi();
    if (!api) {
      return Promise.reject(new Error('chrome.contextMenus is unavailable'));
    }

    return runChromeVoidCallback(
      (callback) => api.update(id, updateProperties, callback),
      'chrome.contextMenus is unavailable'
    );
  },

  removeAll() {
    const api = getContextMenusApi();
    if (!api) {
      return Promise.reject(new Error('chrome.contextMenus is unavailable'));
    }

    return runChromeVoidCallback(
      (callback) => api.removeAll(callback),
      'chrome.contextMenus is unavailable'
    );
  },

  refresh() {
    const api = getContextMenusApi();
    if (!api?.refresh) {
      return Promise.reject(new Error('chrome.contextMenus is unavailable'));
    }

    return runChromeVoidCallback(
      (callback) => api.refresh?.(callback),
      'chrome.contextMenus is unavailable'
    );
  },

  subscribeToClicked(listener) {
    const api = getContextMenusApi();
    return subscribeToChromeEvent(api?.onClicked, listener);
  },

  subscribeToShown(listener) {
    const api = getContextMenusApi();
    return subscribeToChromeEvent(api?.onShown, listener);
  },
};
