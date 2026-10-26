// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getQuickActions: vi.fn(),
  loadSettings: vi.fn(),
  homePage: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: { canObserveChanges: () => true, subscribeToChanges: mocks.subscribe },
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActions,
}));
vi.mock('../tab-access/capabilities', () => ({
  useActiveTabCapabilities: () => ({ tabId: 1 }),
}));
vi.mock('../runtime/page-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/page-access')>()),
  usePopupPageAccessRuntime: () => ({ status: null }),
}));
vi.mock('./page-shell', () => ({
  PopupHomePage: (props: unknown) => {
    mocks.homePage(props);
    return <div data-testid="screenshots-page" />;
  },
}));

import { ScreenshotsRoute } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.subscribe.mockReturnValue(vi.fn());
  mocks.getQuickActions.mockResolvedValue([]);
});

it('loads screenshot settings and shortcuts while forwarding the fixed screenshot mode', async () => {
  mocks.getQuickActions.mockResolvedValue([{ id: 'shortcut', status: true }]);
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [{ id: 'preset' }] });
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() =>
    root.render(<ScreenshotsRoute startup={{ page: 'screenshots', screenshotMode: 'tab' }} />)
  );

  expect(mocks.homePage).toHaveBeenCalledWith(
    expect.objectContaining({
      startupMode: 'tab',
      viewportPresets: [],
      quickActions: [],
      quickActionsReady: false,
    })
  );
  await vi.waitFor(() =>
    expect(mocks.homePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startupMode: 'tab',
        viewportPresets: [expect.objectContaining({ id: 'preset' })],
        quickActions: [expect.objectContaining({ id: 'shortcut' })],
        quickActionsReady: true,
      })
    )
  );
  act(() => root.unmount());
});

it('ignores a screenshot override supplied to another route descriptor', async () => {
  mocks.loadSettings.mockResolvedValue({});
  const container = document.createElement('div');
  const root = createRoot(container);

  act(() => root.render(<ScreenshotsRoute startup={{ page: 'menu' }} />));

  expect(mocks.homePage).toHaveBeenCalledWith(expect.objectContaining({ startupMode: null }));
  act(() => root.unmount());
});

it('updates popup placement without losing the selected screenshot mode', async () => {
  mocks.getQuickActions.mockResolvedValue([{ id: 'shortcut', status: true }]);
  mocks.loadSettings.mockResolvedValue({ pageLaunch: { quickActionsPopup: true } });
  const root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(<ScreenshotsRoute startup={{ page: 'screenshots', screenshotMode: 'tab' }} />)
  );
  expect(mocks.homePage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      quickActions: [{ id: 'shortcut', status: true }],
      startupMode: 'tab',
    })
  );
  mocks.loadSettings.mockResolvedValue({ pageLaunch: { quickActionsPopup: false } });
  await act(async () => mocks.subscribe.mock.calls[0]![0]({ sniptale_settings: {} }, 'sync'));
  expect(mocks.homePage).toHaveBeenLastCalledWith(
    expect.objectContaining({ quickActions: [], startupMode: 'tab' })
  );
  act(() => root.unmount());
});
