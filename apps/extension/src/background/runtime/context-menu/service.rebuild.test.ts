import { beforeEach, expect, it, vi } from 'vitest';

const {
  browserContextMenusCreateMock,
  browserContextMenusRefreshMock,
  browserContextMenusRemoveAllMock,
  browserContextMenusUpdateMock,
  buildContextMenuDescriptorsMock,
  getContextMenuContextsMock,
  getQuickActionsMock,
  hasContextMenuVideoPresetMock,
  hasVisibleContextMenuItemsMock,
  loadSettingsMock,
  loggerWarnMock,
  resolveContextMenuDynamicStateMock,
} = vi.hoisted(() => ({
  browserContextMenusCreateMock: vi.fn(),
  browserContextMenusRefreshMock: vi.fn(),
  browserContextMenusRemoveAllMock: vi.fn(),
  browserContextMenusUpdateMock: vi.fn(),
  buildContextMenuDescriptorsMock: vi.fn(),
  getContextMenuContextsMock: vi.fn(),
  getQuickActionsMock: vi.fn(),
  hasContextMenuVideoPresetMock: vi.fn(),
  hasVisibleContextMenuItemsMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveContextMenuDynamicStateMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/context-menus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/context-menus')>()),
  browserContextMenus: {
    create: browserContextMenusCreateMock,
    refresh: browserContextMenusRefreshMock,
    removeAll: browserContextMenusRemoveAllMock,
    subscribeToClicked: vi.fn(),
    subscribeToShown: vi.fn(),
    update: browserContextMenusUpdateMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    error: vi.fn(),
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
  handleBackgroundContextMenuAction: vi.fn(),
  handleBackgroundContextMenuQuickAction: vi.fn(),
  hasContextMenuVideoPreset: hasContextMenuVideoPresetMock,
  showBackgroundContextMenuError: vi.fn(),
}));

import { rebuildBackgroundContextMenus, refreshContextMenuVisibility } from './service';

function createSettings(enabled = true) {
  return {
    captureAction: 'download_default',
    contextMenu: {
      enabled,
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

function createTab(id = 5): chrome.tabs.Tab {
  return { id, url: 'https://example.test' } as chrome.tabs.Tab;
}

function createDeferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: () => resolve?.(),
  };
}

async function flushRebuildQueueStart(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function resetContextMenuServiceRebuildMocks(): void {
  vi.clearAllMocks();
  browserContextMenusCreateMock.mockResolvedValue(undefined);
  browserContextMenusRefreshMock.mockResolvedValue(undefined);
  browserContextMenusRemoveAllMock.mockResolvedValue(undefined);
  browserContextMenusUpdateMock.mockResolvedValue(undefined);
  buildContextMenuDescriptorsMock.mockReturnValue([
    { id: 'sniptale.root', title: 'Sniptale' },
    { id: 'sniptale.settings', parentId: 'sniptale.root', title: 'Settings' },
  ]);
  getContextMenuContextsMock.mockReturnValue(['all']);
  getQuickActionsMock.mockResolvedValue([]);
  hasContextMenuVideoPresetMock.mockResolvedValue(true);
  hasVisibleContextMenuItemsMock.mockReturnValue(true);
  loadSettingsMock.mockResolvedValue(createSettings());
  resolveContextMenuDynamicStateMock.mockReturnValue({
    'sniptale.export': { visible: true },
    'sniptale.video': { enabled: true, visible: true },
  });
}

beforeEach(resetContextMenuServiceRebuildMocks);

it('rebuilds context menus from descriptors when the feature is enabled and visible', async () => {
  await rebuildBackgroundContextMenus();

  expect(browserContextMenusRemoveAllMock).toHaveBeenCalledOnce();
  expect(buildContextMenuDescriptorsMock).toHaveBeenCalledWith({
    quickActions: [],
    settings: createSettings().contextMenu,
  });
  expect(browserContextMenusCreateMock).toHaveBeenNthCalledWith(1, {
    contexts: ['all'],
    id: 'sniptale.root',
    title: 'Sniptale',
  });
  expect(browserContextMenusCreateMock).toHaveBeenNthCalledWith(2, {
    contexts: ['all'],
    id: 'sniptale.settings',
    parentId: 'sniptale.root',
    title: 'Settings',
  });
});

it('omits undefined optional create fields when descriptors or contexts do not provide them', async () => {
  buildContextMenuDescriptorsMock.mockReturnValue([
    { id: 'sniptale.root' },
    { id: 'sniptale.separator', parentId: 'sniptale.root', type: 'separator' },
  ]);
  getContextMenuContextsMock.mockReturnValue(undefined);

  await rebuildBackgroundContextMenus();

  expect(browserContextMenusCreateMock).toHaveBeenNthCalledWith(1, {
    id: 'sniptale.root',
  });
  expect(browserContextMenusCreateMock).toHaveBeenNthCalledWith(2, {
    id: 'sniptale.separator',
    parentId: 'sniptale.root',
    type: 'separator',
  });
});

it('skips menu creation when context menus are disabled or nothing is visible', async () => {
  loadSettingsMock.mockResolvedValueOnce(createSettings(false));
  await rebuildBackgroundContextMenus();

  hasVisibleContextMenuItemsMock.mockReturnValueOnce(false);
  loadSettingsMock.mockResolvedValueOnce(createSettings(true));
  await rebuildBackgroundContextMenus();

  expect(browserContextMenusCreateMock).not.toHaveBeenCalled();
  expect(browserContextMenusRemoveAllMock).toHaveBeenCalledTimes(2);
});

it('serializes overlapping rebuilds so a later removeAll cannot delete parents mid-build', async () => {
  buildContextMenuDescriptorsMock.mockReturnValue([
    { id: 'sniptale.root', title: 'Sniptale' },
    { id: 'sniptale.screenshots', parentId: 'sniptale.root', title: 'Screenshots' },
    {
      id: 'sniptale.screenshots.prepare',
      parentId: 'sniptale.screenshots',
      title: 'Prepare',
    },
  ]);

  const firstCreate = createDeferred();
  let createCallCount = 0;
  browserContextMenusCreateMock.mockImplementation(async () => {
    createCallCount += 1;
    if (createCallCount === 1) {
      await firstCreate.promise;
    }
  });

  const firstRebuild = rebuildBackgroundContextMenus();
  await flushRebuildQueueStart();
  const secondRebuild = rebuildBackgroundContextMenus();
  await flushRebuildQueueStart();

  expect(browserContextMenusRemoveAllMock).toHaveBeenCalledTimes(1);

  firstCreate.resolve();
  await Promise.all([firstRebuild, secondRebuild]);

  expect(browserContextMenusRemoveAllMock).toHaveBeenCalledTimes(2);
  expect(browserContextMenusCreateMock).toHaveBeenCalledTimes(6);
});

it('refreshes dynamic visibility and logs update failures per item', async () => {
  browserContextMenusUpdateMock
    .mockRejectedValueOnce(new Error('update-failed'))
    .mockResolvedValueOnce(undefined);

  await refreshContextMenuVisibility(createTab());

  expect(resolveContextMenuDynamicStateMock).toHaveBeenCalledWith({
    hasVideoPreset: true,
    settings: createSettings().contextMenu,
    tab: createTab(),
  });
  expect(browserContextMenusUpdateMock).toHaveBeenCalledTimes(2);
  expect(browserContextMenusRefreshMock).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to update context menu item state',
    expect.objectContaining({
      error: expect.any(Error),
      id: 'sniptale.export',
    })
  );
});

it('refreshes dynamic visibility without a tab payload when no tab is available', async () => {
  await refreshContextMenuVisibility();

  expect(resolveContextMenuDynamicStateMock).toHaveBeenCalledWith({
    hasVideoPreset: true,
    settings: createSettings().contextMenu,
  });
  expect(browserContextMenusRefreshMock).toHaveBeenCalledOnce();
});

it('does not refresh menu visibility when context menus are disabled', async () => {
  loadSettingsMock.mockResolvedValue(createSettings(false));

  await refreshContextMenuVisibility(createTab());

  expect(resolveContextMenuDynamicStateMock).not.toHaveBeenCalled();
  expect(browserContextMenusRefreshMock).not.toHaveBeenCalled();
});
