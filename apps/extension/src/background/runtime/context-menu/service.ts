import { PRODUCT_BRAND_NAME } from '@sniptale/ui/branding';
import {
  browserContextMenus,
  type BrowserContextMenuUpdateProperties,
} from '@sniptale/platform/browser/context-menus';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getQuickActions } from '../../../composition/persistence/quick-actions';
import { loadSettings } from '../../../composition/persistence/settings';
import {
  buildContextMenuDescriptors,
  getContextMenuContexts,
  hasVisibleContextMenuItems,
  resolveContextMenuDynamicState,
} from './model';
import { parseContextMenuQuickActionId } from './constants';
import {
  handleBackgroundContextMenuAction,
  handleBackgroundContextMenuQuickAction,
  hasContextMenuVideoPreset,
  showBackgroundContextMenuError,
  type BackgroundContextMenuActionDeps,
} from './actions';

const logger = createLogger({ namespace: 'BackgroundContextMenu' });

type ContextMenuDeps = BackgroundContextMenuActionDeps;
let contextMenuRebuildQueue: Promise<void> = Promise.resolve();

function getContextMenuUpdateEntries(
  updates: Record<string, BrowserContextMenuUpdateProperties>
): Array<{ id: string; update: BrowserContextMenuUpdateProperties }> {
  return (Object.entries(updates) as Array<[string, BrowserContextMenuUpdateProperties]>).map(
    ([id, update]) => ({ id, update })
  );
}

function logContextMenuUpdateFailure(
  id: string,
  update: BrowserContextMenuUpdateProperties,
  error: unknown
): void {
  logger.warn('Failed to update context menu item state', { error, id, update });
}

async function runBackgroundContextMenuRebuild(): Promise<void> {
  const [settings, quickActions] = await Promise.all([loadSettings(), getQuickActions()]);
  const contextMenuSettings = settings.contextMenu;

  await browserContextMenus.removeAll();

  if (
    !contextMenuSettings.enabled ||
    !hasVisibleContextMenuItems({
      quickActions,
      settings: contextMenuSettings,
    })
  ) {
    return;
  }

  const descriptors = buildContextMenuDescriptors({
    quickActions,
    settings: contextMenuSettings,
  });
  const contexts = getContextMenuContexts();

  for (const descriptor of descriptors) {
    const createProperties: chrome.contextMenus.CreateProperties = {
      id: descriptor.id,
      ...(contexts ? { contexts } : {}),
      ...(descriptor.parentId ? { parentId: descriptor.parentId } : {}),
      ...(descriptor.title ? { title: descriptor.title } : {}),
      ...(descriptor.type ? { type: descriptor.type } : {}),
    };

    await browserContextMenus.create(createProperties);
  }
}

function rebuildBackgroundContextMenus(): Promise<void> {
  const nextRebuild = contextMenuRebuildQueue
    .catch(() => undefined)
    .then(() => runBackgroundContextMenuRebuild());
  contextMenuRebuildQueue = nextRebuild;
  return nextRebuild;
}

async function refreshContextMenuVisibility(tab?: chrome.tabs.Tab): Promise<void> {
  const settings = await loadSettings();
  const contextMenuSettings = settings.contextMenu;

  if (!contextMenuSettings.enabled) {
    return;
  }

  const updates = resolveContextMenuDynamicState({
    hasVideoPreset: await hasContextMenuVideoPreset(),
    settings: contextMenuSettings,
    ...(tab ? { tab } : {}),
  });

  await Promise.all(
    getContextMenuUpdateEntries(updates).map(({ id, update }) =>
      browserContextMenus.update(id, update).catch((error: unknown) => {
        logContextMenuUpdateFailure(id, update, error);
      })
    )
  );

  await browserContextMenus.refresh();
}

function shouldRebuildContextMenus(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: chrome.storage.AreaName
): boolean {
  if (areaName === 'sync' && changes['sniptale_settings']) {
    return true;
  }

  return areaName === 'local' && Boolean(changes['sniptale_quick_actions']);
}

function registerContextMenuStorageListener(): () => void {
  return browserStorage.subscribeToChanges((changes, areaName) => {
    if (!shouldRebuildContextMenus(changes, areaName)) {
      return;
    }

    void rebuildBackgroundContextMenus().catch((error) => {
      logger.error('Failed to rebuild context menus after storage change', error);
    });
  });
}

function registerContextMenuClickedListener(deps: ContextMenuDeps): () => void {
  return browserContextMenus.subscribeToClicked((info, tab) => {
    const menuId = typeof info.menuItemId === 'string' ? info.menuItemId : String(info.menuItemId);
    const quickActionId = parseContextMenuQuickActionId(menuId);

    if (quickActionId) {
      const quickActionArgs = {
        actionId: quickActionId,
        deps,
        ...(tab ? { tab } : {}),
      };

      void handleBackgroundContextMenuQuickAction(quickActionArgs).catch((error) => {
        void showBackgroundContextMenuError({
          error,
          ...(tab ? { tab } : {}),
        });
      });
      return;
    }

    const actionArgs = {
      deps,
      menuId,
      ...(typeof info.pageUrl === 'string' ? { pageUrl: info.pageUrl } : {}),
      ...(tab ? { tab } : {}),
    };

    void handleBackgroundContextMenuAction(actionArgs).catch((error) => {
      void showBackgroundContextMenuError({
        error,
        ...(tab ? { tab } : {}),
      });
    });
  });
}

function registerContextMenuShownListener(): () => void {
  return browserContextMenus.subscribeToShown((_info: unknown, tab?: chrome.tabs.Tab) => {
    void refreshContextMenuVisibility(tab).catch((error) => {
      logger.warn('Failed to refresh context menu visibility', error);
    });
  });
}

export function initializeBackgroundContextMenus(deps: ContextMenuDeps): () => void {
  logger.debug('Initializing background context menus', { product: PRODUCT_BRAND_NAME });

  const unsubscribeStorage = registerContextMenuStorageListener();
  const unsubscribeClicked = registerContextMenuClickedListener(deps);
  const unsubscribeShown = registerContextMenuShownListener();

  return () => {
    unsubscribeShown();
    unsubscribeClicked();
    unsubscribeStorage();
  };
}

export { rebuildBackgroundContextMenus, refreshContextMenuVisibility };
