import {
  contentRuntimeShimBrowser,
  type ContentRuntimeShimBrowserAdapter,
  type ContentRuntimeShimStorageChangeListener,
} from '@sniptale/platform/browser/content-runtime-shim';
import type { QuickActionHotkeyAction } from '../../platform/quick-action-hotkeys';

const QUICK_ACTIONS_STORAGE_KEY = 'sniptale_quick_actions';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHotkey(value: unknown): value is NonNullable<QuickActionHotkeyAction['hotkey']> {
  return (
    isRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['ctrlKey'] === 'boolean' &&
    typeof value['shiftKey'] === 'boolean' &&
    typeof value['altKey'] === 'boolean' &&
    typeof value['metaKey'] === 'boolean'
  );
}

function parseQuickActionHotkey(value: unknown): QuickActionHotkeyAction | null {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['status'] !== 'boolean') {
    return null;
  }

  const hotkey = value['hotkey'];
  if (hotkey !== null && !isHotkey(hotkey)) {
    return null;
  }

  return {
    hotkey,
    id: value['id'],
    status: value['status'],
  };
}

export function createShimQuickActionLoader(browser: ContentRuntimeShimBrowserAdapter) {
  return async function loadShimQuickActions(): Promise<QuickActionHotkeyAction[]> {
    let stored: Record<string, unknown>;
    try {
      stored = await browser.getLocalStorage([QUICK_ACTIONS_STORAGE_KEY]);
    } catch {
      return [];
    }

    const value = stored[QUICK_ACTIONS_STORAGE_KEY];
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map(parseQuickActionHotkey)
      .filter((action): action is QuickActionHotkeyAction => action !== null);
  };
}

export function createShimQuickActionStorage(browser: ContentRuntimeShimBrowserAdapter) {
  return {
    canObserveChanges(): boolean {
      return browser.canObserveStorageChanges();
    },
    subscribeToChanges(listener: ContentRuntimeShimStorageChangeListener): () => void {
      return browser.subscribeToStorageChanges(listener);
    },
  };
}

export const loadShimQuickActions = createShimQuickActionLoader(contentRuntimeShimBrowser);
export const shimQuickActionStorage = createShimQuickActionStorage(contentRuntimeShimBrowser);
