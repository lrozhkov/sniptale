import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
  removeAll: vi.fn(),
  update: vi.fn(),
  descriptors: vi.fn(),
  contexts: vi.fn(),
  visible: vi.fn(),
  dynamic: vi.fn(),
  quickActions: vi.fn(),
  settings: vi.fn(),
  videoPreset: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@sniptale/platform/browser/context-menus', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/context-menus')>()),
  browserContextMenus: {
    create: mocks.create,
    refresh: mocks.refresh,
    removeAll: mocks.removeAll,
    update: mocks.update,
    subscribeToClicked: vi.fn(),
    subscribeToShown: vi.fn(),
  },
}));
vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({ debug: vi.fn(), error: vi.fn(), warn: mocks.warn })),
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.quickActions,
}));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.settings,
}));
vi.mock('./model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model')>()),
  buildContextMenuDescriptors: mocks.descriptors,
  getContextMenuContexts: mocks.contexts,
  hasVisibleContextMenuItems: mocks.visible,
  resolveContextMenuDynamicState: mocks.dynamic,
}));
vi.mock('./actions', () => ({
  handleBackgroundContextMenuAction: vi.fn(),
  handleBackgroundContextMenuQuickAction: vi.fn(),
  hasContextMenuVideoPreset: mocks.videoPreset,
  showBackgroundContextMenuError: vi.fn(),
}));
import { rebuildBackgroundContextMenus, refreshContextMenuVisibility } from './service';

const menu = [
  { id: 'sniptale.root', title: 'Sniptale' },
  { id: 'sniptale.section.tools', parentId: 'sniptale.root', title: 'Tools' },
  { id: 'sniptale.video.preset', parentId: 'sniptale.section.tools', title: 'Preset' },
];
function settings(enabled = true) {
  return { contextMenu: { enabled }, viewportPresets: [] };
}
function deferred() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve?.() };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(undefined);
  mocks.removeAll.mockResolvedValue(undefined);
  mocks.update.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.descriptors.mockReturnValue(menu);
  mocks.contexts.mockReturnValue(['all']);
  mocks.visible.mockReturnValue(true);
  mocks.dynamic.mockReturnValue({
    'sniptale.video.preset': { visible: false, enabled: false },
    'sniptale.absent': { visible: false },
  });
  mocks.quickActions.mockResolvedValue([]);
  mocks.settings.mockResolvedValue(settings());
  mocks.videoPreset.mockResolvedValue(false);
});

it('creates the exact ordered descriptor tree', async () => {
  await rebuildBackgroundContextMenus();
  expect(mocks.create.mock.calls.map(([arg]) => arg)).toEqual(
    menu.map((item) => ({ contexts: ['all'], ...item }))
  );
});

it('updates only IDs that were created, even if the dynamic model lists an absent ID', async () => {
  await rebuildBackgroundContextMenus();
  await refreshContextMenuVisibility({ id: 2, url: 'https://example.test' } as chrome.tabs.Tab);
  expect(mocks.dynamic).toHaveBeenCalledWith({
    descriptors: menu,
    hasVideoPreset: false,
    tab: { id: 2, url: 'https://example.test' },
  });
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith('sniptale.video.preset', {
    visible: false,
    enabled: false,
  });
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it('stops old visibility updates before removeAll and skips refresh against a disabled rebuild', async () => {
  await rebuildBackgroundContextMenus();
  const update = deferred();
  mocks.update.mockReturnValueOnce(update.promise);
  const visibility = refreshContextMenuVisibility();
  await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  mocks.settings.mockResolvedValueOnce(settings(false));
  const rebuild = rebuildBackgroundContextMenus();
  await Promise.resolve();
  expect(mocks.removeAll).toHaveBeenCalledTimes(1);
  update.resolve();
  await Promise.all([visibility, rebuild]);
  expect(mocks.removeAll).toHaveBeenCalledTimes(2);
  expect(mocks.refresh).not.toHaveBeenCalled();
  mocks.update.mockClear();
  await refreshContextMenuVisibility();
  expect(mocks.update).not.toHaveBeenCalled();
});

it('serializes overlapping rebuilds so a later removeAll cannot delete a partially created tree', async () => {
  const firstCreate = deferred();
  mocks.create.mockImplementationOnce(() => firstCreate.promise);
  const first = rebuildBackgroundContextMenus();
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const second = rebuildBackgroundContextMenus();
  expect(mocks.removeAll).toHaveBeenCalledTimes(1);
  firstCreate.resolve();
  await Promise.all([first, second]);
  expect(mocks.removeAll).toHaveBeenCalledTimes(2);
  expect(mocks.create).toHaveBeenCalledTimes(6);
});
