import { beforeEach, expect, it, vi } from 'vitest';
import { buildContextMenuQuickActionId } from './constants';
import {
  createContextMenuTestTab,
  flushContextMenuTestMicrotasks,
} from './service.listeners.test-support';

const {
  browserContextMenusCreateMock,
  browserContextMenusRemoveAllMock,
  browserStorageSubscribeToChangesMock,
  buildContextMenuDescriptorsMock,
  getContextMenuContextsMock,
  getQuickActionsMock,
  handleBackgroundContextMenuActionMock,
  handleBackgroundContextMenuQuickActionMock,
  hasContextMenuVideoPresetMock,
  hasVisibleContextMenuItemsMock,
  loadSettingsMock,
  loggerDebugMock,
  loggerErrorMock,
  loggerWarnMock,
  storageUnsubscribeMock,
  clickedUnsubscribeMock,
  shownUnsubscribeMock,
  resolveContextMenuDynamicStateMock,
  showBackgroundContextMenuErrorMock,
} = vi.hoisted(() => ({
  browserContextMenusCreateMock: vi.fn(),
  browserContextMenusRemoveAllMock: vi.fn(),
  browserStorageSubscribeToChangesMock: vi.fn(),
  buildContextMenuDescriptorsMock: vi.fn(),
  getContextMenuContextsMock: vi.fn(),
  getQuickActionsMock: vi.fn(),
  handleBackgroundContextMenuActionMock: vi.fn(),
  handleBackgroundContextMenuQuickActionMock: vi.fn(),
  hasContextMenuVideoPresetMock: vi.fn(),
  hasVisibleContextMenuItemsMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  storageUnsubscribeMock: vi.fn(),
  clickedUnsubscribeMock: vi.fn(),
  shownUnsubscribeMock: vi.fn(),
  resolveContextMenuDynamicStateMock: vi.fn(),
  showBackgroundContextMenuErrorMock: vi.fn(),
}));

let storageListener:
  | ((
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: chrome.storage.AreaName
    ) => void)
  | null = null;
let clickedListener:
  | ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void)
  | null = null;
let shownListener: ((info: unknown, tab?: chrome.tabs.Tab) => void) | null = null;

const DUPLICATE_MENU_ID_ERROR = 'Cannot create item with duplicate id sniptale.root';

vi.mock('@sniptale/platform/browser/context-menus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/context-menus')>()),
  browserContextMenus: {
    create: browserContextMenusCreateMock,
    refresh: vi.fn().mockResolvedValue(undefined),
    removeAll: browserContextMenusRemoveAllMock,
    subscribeToClicked: vi.fn((listener: typeof clickedListener) => {
      clickedListener = listener;
      return clickedUnsubscribeMock;
    }),
    subscribeToShown: vi.fn((listener: typeof shownListener) => {
      shownListener = listener;
      return shownUnsubscribeMock;
    }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock(
  '../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      subscribeToChanges: browserStorageSubscribeToChangesMock,
    },
  })
);
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    warn: loggerWarnMock,
  })),
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: getQuickActionsMock,
}));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));
vi.mock('./model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model')>()),
  buildContextMenuDescriptors: buildContextMenuDescriptorsMock,
  getContextMenuContexts: getContextMenuContextsMock,
  hasVisibleContextMenuItems: hasVisibleContextMenuItemsMock,
  resolveContextMenuDynamicState: resolveContextMenuDynamicStateMock,
}));

vi.mock('./actions', () => ({
  BackgroundContextMenuActionDeps: undefined,
  handleBackgroundContextMenuAction: handleBackgroundContextMenuActionMock,
  handleBackgroundContextMenuQuickAction: handleBackgroundContextMenuQuickActionMock,
  hasContextMenuVideoPreset: hasContextMenuVideoPresetMock,
  showBackgroundContextMenuError: showBackgroundContextMenuErrorMock,
}));

import { initializeBackgroundContextMenus } from './service';

function createSettings() {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled: true,
      showScreenshots: true,
      showVideo: true,
      showExport: true,
      showImageEditor: true,
      showVideoEditor: true,
      showGallery: true,
      showPageLinkCopy: true,
      showSettings: true,
    },
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: null,
    defaultViewportId: 'native',
    imageFormat: 'png',
    imageQuality: 100,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [],
  };
}

function createDeps() {
  return {
    captureGuardState: { isCapturing: false },
    screenshotModeState: new Map<number, boolean>(),
    viewportOwnerState: new Map<number, 'debugger' | 'viewer'>(),
    viewportState: new Map<number, { width: number; height: number } | null>(),
  };
}

function resetContextMenuServiceListenerMocks(): void {
  vi.clearAllMocks();
  storageListener = null;
  clickedListener = null;
  shownListener = null;
  browserContextMenusCreateMock.mockResolvedValue(undefined);
  browserContextMenusRemoveAllMock.mockResolvedValue(undefined);
  browserStorageSubscribeToChangesMock.mockImplementation(
    (
      listener: (
        changes: Record<string, chrome.storage.StorageChange>,
        areaName: chrome.storage.AreaName
      ) => void
    ) => {
      storageListener = listener;
      return storageUnsubscribeMock;
    }
  );
  buildContextMenuDescriptorsMock.mockReturnValue([
    { id: 'sniptale.root', title: 'Sniptale' },
    { id: 'sniptale.settings', parentId: 'sniptale.root', title: 'Settings' },
  ]);
  getContextMenuContextsMock.mockReturnValue(['all']);
  getQuickActionsMock.mockResolvedValue([]);
  handleBackgroundContextMenuActionMock.mockResolvedValue(undefined);
  handleBackgroundContextMenuQuickActionMock.mockResolvedValue(undefined);
  hasContextMenuVideoPresetMock.mockResolvedValue(true);
  hasVisibleContextMenuItemsMock.mockReturnValue(true);
  loadSettingsMock.mockResolvedValue(createSettings());
  resolveContextMenuDynamicStateMock.mockReturnValue({
    'sniptale.export': { visible: true },
  });
  showBackgroundContextMenuErrorMock.mockResolvedValue(undefined);
}

async function initializeAndFlushListeners(
  deps = createDeps()
): Promise<{ deps: typeof deps; dispose: () => void }> {
  const dispose = initializeBackgroundContextMenus(deps);
  await flushContextMenuTestMicrotasks();
  return { deps, dispose };
}

async function triggerContextMenuStorageAndClickRouting(): Promise<void> {
  storageListener?.({ sniptale_settings: { newValue: {}, oldValue: {} } }, 'sync');
  storageListener?.({ sniptale_quick_actions: { newValue: [], oldValue: [] } }, 'local');
  storageListener?.({ unrelated: { newValue: true, oldValue: false } }, 'local');
  clickedListener?.(
    { menuItemId: buildContextMenuQuickActionId('qa-1') } as chrome.contextMenus.OnClickData,
    createContextMenuTestTab()
  );
  clickedListener?.(
    { menuItemId: 'sniptale.settings' } as chrome.contextMenus.OnClickData,
    createContextMenuTestTab()
  );
  await flushContextMenuTestMicrotasks();
}

beforeEach(resetContextMenuServiceListenerMocks);

it('registers listeners, rebuilds on relevant storage changes, and routes clicks', async () => {
  const { deps } = await initializeAndFlushListeners();

  expect(browserContextMenusRemoveAllMock).not.toHaveBeenCalled();
  await triggerContextMenuStorageAndClickRouting();

  await vi.waitFor(() => {
    expect(browserContextMenusRemoveAllMock).toHaveBeenCalledTimes(2);
  });

  expect(loggerDebugMock).toHaveBeenCalledWith('Initializing background context menus', {
    product: 'Sniptale',
  });
  expect(handleBackgroundContextMenuQuickActionMock).toHaveBeenCalledWith({
    actionId: 'qa-1',
    deps,
    tab: createContextMenuTestTab(),
  });
  expect(handleBackgroundContextMenuActionMock).toHaveBeenCalledWith({
    deps,
    menuId: 'sniptale.settings',
    tab: createContextMenuTestTab(),
  });
  expect(showBackgroundContextMenuErrorMock).not.toHaveBeenCalled();
});

it('returns a composite disposer for the registered listener subscriptions', async () => {
  const { dispose } = await initializeAndFlushListeners();

  dispose();

  expect(shownUnsubscribeMock).toHaveBeenCalledOnce();
  expect(clickedUnsubscribeMock).toHaveBeenCalledOnce();
  expect(storageUnsubscribeMock).toHaveBeenCalledOnce();
});

it('routes listener failures into the shared error-feedback seam and logs refresh failures', async () => {
  handleBackgroundContextMenuQuickActionMock.mockRejectedValueOnce(new Error('quick-failed'));
  hasContextMenuVideoPresetMock.mockRejectedValueOnce(new Error('preset-failed'));

  await initializeAndFlushListeners();

  clickedListener?.(
    { menuItemId: buildContextMenuQuickActionId('qa-2') } as chrome.contextMenus.OnClickData,
    createContextMenuTestTab()
  );
  shownListener?.({}, createContextMenuTestTab());
  await flushContextMenuTestMicrotasks();

  expect(showBackgroundContextMenuErrorMock).toHaveBeenCalledWith({
    error: expect.any(Error),
    tab: createContextMenuTestTab(),
  });
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to refresh context menu visibility',
    expect.any(Error)
  );
});
it('logs rebuild failures from the storage listener', async () => {
  await initializeAndFlushListeners();

  browserContextMenusRemoveAllMock.mockRejectedValueOnce(new Error(DUPLICATE_MENU_ID_ERROR));
  storageListener?.({ sniptale_settings: { newValue: {}, oldValue: {} } }, 'sync');
  await flushContextMenuTestMicrotasks();

  await vi.waitFor(() => {
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to rebuild context menus after storage change',
      expect.objectContaining({ message: DUPLICATE_MENU_ID_ERROR })
    );
  });
});
