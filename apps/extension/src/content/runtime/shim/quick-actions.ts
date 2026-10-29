import {
  contentRuntimeShimBrowser,
  type ContentRuntimeShimBrowserAdapter,
  type ContentRuntimeShimStorageChangeListener,
} from '@sniptale/platform/browser/content-runtime-shim';
import { bundledQuickActionConfigs } from '../../../features/quick-actions-presets/bundled';
import type { QuickActionHotkeyAction } from '../../platform/quick-action-hotkeys';

export interface ShimQuickAction extends QuickActionHotkeyAction {
  name?: string;
  icon?: string;
  bundledId?: string;
  customized?: boolean;
}

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

function parseQuickActionHotkey(value: unknown): ShimQuickAction | null {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['status'] !== 'boolean') {
    return null;
  }

  const hotkey = value['hotkey'] ?? null;
  if (hotkey !== null && !isHotkey(hotkey)) {
    return null;
  }

  const icon =
    typeof value['icon'] === 'string' && value['icon'].length <= 128
      ? value['icon']
      : bundledQuickActionConfigs.find((config) => config.id === value['id'])?.icon;
  return {
    ...(icon ? { icon } : {}),
    hotkey,
    id: value['id'],
    status: value['status'],
    ...(typeof value['name'] === 'string' ? { name: value['name'].slice(0, 512) } : {}),
    ...(typeof value['bundledId'] === 'string'
      ? { bundledId: value['bundledId'].slice(0, 128) }
      : {}),
    ...(typeof value['customized'] === 'boolean' ? { customized: value['customized'] } : {}),
  };
}

export function createShimQuickActionLoader(browser: ContentRuntimeShimBrowserAdapter) {
  return async function loadShimQuickActions(): Promise<ShimQuickAction[]> {
    let stored: Record<string, unknown>;
    try {
      stored = await browser.getLocalStorage([QUICK_ACTIONS_STORAGE_KEY]);
    } catch {
      return [];
    }

    const value = stored[QUICK_ACTIONS_STORAGE_KEY];
    const actions = Array.isArray(value)
      ? value
          .map(parseQuickActionHotkey)
          .filter((action): action is ShimQuickAction => action !== null)
      : [];
    const storedIds = new Set(actions.map((action) => action.id));
    return [
      ...actions,
      ...bundledQuickActionConfigs
        .filter((config) => !storedIds.has(config.id))
        .map((config) => ({ id: config.id, icon: config.icon, status: true, hotkey: null })),
    ];
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
