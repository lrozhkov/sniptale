// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getQuickActions: vi.fn(),
  loadSettings: vi.fn(),
  homePage: vi.fn(),
  footer: vi.fn(),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActions,
}));
vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettings,
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
    return <div data-testid="home-page" />;
  },
}));
vi.mock('../footer', () => ({
  default: (props: unknown) => {
    mocks.footer(props);
    return <div data-testid="footer" />;
  },
}));
vi.mock('../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation/actions')>()),
  openGallery: vi.fn(),
  openGithubRepository: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openSettings: vi.fn(),
  openVideoEditor: vi.fn(),
}));
vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getQuickActions.mockResolvedValue([
    { id: 'enabled', status: true },
    { id: 'disabled', status: false },
  ]);
  mocks.loadSettings.mockResolvedValue({ viewportPresets: [{ id: 'preset' }] });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderRoute(node: ReactNode) {
  act(() => root.render(node));
}

it('renders defaults immediately and hydrates Home sections independently', async () => {
  const { HomeRoute } = await import('./route');
  renderRoute(<HomeRoute startup={{ page: 'home', screenshotMode: 'tools' }} />);
  expect(mocks.homePage).toHaveBeenCalledWith(
    expect.objectContaining({ quickActionsReady: false, startupMode: 'tools' })
  );
  await vi.waitFor(() =>
    expect(mocks.homePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        quickActions: [expect.objectContaining({ id: 'enabled' })],
        quickActionsReady: true,
        viewportPresets: [expect.objectContaining({ id: 'preset' })],
      })
    )
  );
  expect(mocks.footer).toHaveBeenCalled();
});

it('publishes the localized quick-action error without blocking the page', async () => {
  mocks.getQuickActions.mockRejectedValue(new Error('failed'));
  const { HomeRoute } = await import('./route');
  renderRoute(<HomeRoute startup={{ page: 'home' }} />);
  await vi.waitFor(() =>
    expect(mocks.homePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        homeError: 'popup.home.quickActionsLoadError',
        quickActionsReady: true,
      })
    )
  );
});

it('uses empty viewport defaults and ignores a screenshot override for another route', async () => {
  mocks.loadSettings.mockResolvedValue({});
  const { HomeRoute } = await import('./route');
  renderRoute(<HomeRoute startup={{ page: 'export' }} />);
  await vi.waitFor(() =>
    expect(mocks.homePage).toHaveBeenLastCalledWith(
      expect.objectContaining({ startupMode: null, viewportPresets: [] })
    )
  );
});
