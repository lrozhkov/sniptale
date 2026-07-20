import { beforeEach, expect, it, vi } from 'vitest';

import { buildContextMenuQuickActionId } from './constants';

const {
  browserStorageSubscribeToChangesMock,
  clickedUnsubscribeMock,
  handleBackgroundContextMenuActionMock,
  handleBackgroundContextMenuQuickActionMock,
  loadSettingsMock,
  showBackgroundContextMenuErrorMock,
} = vi.hoisted(() => ({
  browserStorageSubscribeToChangesMock: vi.fn(),
  clickedUnsubscribeMock: vi.fn(),
  handleBackgroundContextMenuActionMock: vi.fn(),
  handleBackgroundContextMenuQuickActionMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  showBackgroundContextMenuErrorMock: vi.fn(),
}));

let clickedListener:
  | ((info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void)
  | null = null;

vi.mock('@sniptale/platform/browser/context-menus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/context-menus')>()),
  browserContextMenus: {
    create: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    removeAll: vi.fn().mockResolvedValue(undefined),
    subscribeToClicked: vi.fn((listener: typeof clickedListener) => {
      clickedListener = listener;
      return clickedUnsubscribeMock;
    }),
    subscribeToShown: vi.fn(() => vi.fn()),
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
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('./model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model')>()),
  buildContextMenuDescriptors: vi.fn().mockReturnValue([]),
  getContextMenuContexts: vi.fn().mockReturnValue(['all']),
  hasVisibleContextMenuItems: vi.fn().mockReturnValue(true),
  resolveContextMenuDynamicState: vi.fn().mockReturnValue({}),
}));

vi.mock('./actions', () => ({
  BackgroundContextMenuActionDeps: undefined,
  handleBackgroundContextMenuAction: handleBackgroundContextMenuActionMock,
  handleBackgroundContextMenuQuickAction: handleBackgroundContextMenuQuickActionMock,
  hasContextMenuVideoPreset: vi.fn().mockResolvedValue(true),
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

function createTab(id = 5): chrome.tabs.Tab {
  return { id, url: 'https://example.test' } as chrome.tabs.Tab;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  clickedListener = null;
  browserStorageSubscribeToChangesMock.mockReturnValue(vi.fn());
  handleBackgroundContextMenuActionMock.mockRejectedValue(new Error('action-failed'));
  handleBackgroundContextMenuQuickActionMock.mockRejectedValue(new Error('quick-failed'));
  loadSettingsMock.mockResolvedValue(createSettings());
  showBackgroundContextMenuErrorMock.mockResolvedValue(undefined);
});

it('omits tab payloads when click listeners are invoked without an associated tab', async () => {
  const deps = createDeps();
  initializeBackgroundContextMenus(deps);
  await flushMicrotasks();

  clickedListener?.({
    menuItemId: buildContextMenuQuickActionId('qa-3'),
  } as chrome.contextMenus.OnClickData);
  clickedListener?.({ menuItemId: 'sniptale.settings' } as chrome.contextMenus.OnClickData);
  await flushMicrotasks();

  expect(handleBackgroundContextMenuQuickActionMock).toHaveBeenCalledWith({
    actionId: 'qa-3',
    deps,
  });
  expect(handleBackgroundContextMenuActionMock).toHaveBeenCalledWith({
    deps,
    menuId: 'sniptale.settings',
  });
  expect(showBackgroundContextMenuErrorMock).toHaveBeenNthCalledWith(1, {
    error: expect.any(Error),
  });
  expect(showBackgroundContextMenuErrorMock).toHaveBeenNthCalledWith(2, {
    error: expect.any(Error),
  });
});

it('stringifies numeric menu ids and keeps tab payloads for action failures', async () => {
  const deps = createDeps();
  initializeBackgroundContextMenus(deps);
  await flushMicrotasks();

  clickedListener?.({ menuItemId: 42 } as chrome.contextMenus.OnClickData, createTab(9));
  await flushMicrotasks();

  expect(handleBackgroundContextMenuActionMock).toHaveBeenCalledWith({
    deps,
    menuId: '42',
    tab: createTab(9),
  });
  expect(showBackgroundContextMenuErrorMock).toHaveBeenCalledWith({
    error: expect.any(Error),
    tab: createTab(9),
  });
});
