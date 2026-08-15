// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  coordinator: vi.fn(),
  loadRoute: vi.fn(),
  preload: vi.fn(),
  saveLastPage: vi.fn(),
  messageHandlers: vi.fn(),
  initializeTheme: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../startup/coordinator', () => ({ resolvePopupStartupRoute: mocks.coordinator }));
vi.mock('../startup/resource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../startup/resource')>()),
  loadPopupRoute: mocks.loadRoute,
  preloadPopupPage: mocks.preload,
}));
vi.mock('../../../platform/i18n/locale/state', () => ({
  getCurrentLocale: () => 'ru',
  subscribeToLocaleChanges: () => () => undefined,
}));
vi.mock('../../../ui/theme', () => ({
  initializeExtensionPageTheme: mocks.initializeTheme,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));
vi.mock('../message-sync', () => ({
  subscribeToRecordingMessages: (handlers: unknown) => {
    mocks.messageHandlers(handlers);
    return () => undefined;
  },
}));
vi.mock(
  '../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/capture-settings/popup-startup')
    >()),
    savePopupLastPage: mocks.saveLastPage,
  })
);
vi.mock('../command-palette/route-first', () => ({
  RouteFirstPopupCommandPalette: () => <div data-testid="route-first-palette" />,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.coordinator.mockReset();
  mocks.loadRoute.mockReset();
  mocks.preload.mockReset();
  mocks.saveLastPage.mockReset();
  mocks.initializeTheme.mockReset();
  mocks.initializeTheme.mockReturnValue(() => undefined);
  mocks.preload.mockResolvedValue(undefined);
  mocks.saveLastPage.mockResolvedValue(undefined);
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 10 });
    return 1;
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('keeps current content until a cold navigation commits and only then persists it', async () => {
  const Home = () => <div data-testid="home-route" />;
  const Video = () => <div data-testid="video-route" />;
  let resolveVideo!: (component: React.ComponentType) => void;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute
    .mockResolvedValueOnce(Home)
    .mockReturnValueOnce(new Promise((resolve) => (resolveVideo = resolve)));
  const { PopupApp } = await import('./index');
  await act(async () => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  const menuButton = container.querySelector<HTMLButtonElement>('button[data-page="menu"]');
  expect(menuButton?.textContent).toBe('');
  expect(menuButton?.getAttribute('aria-label')).toBeTruthy();
  expect(
    [...container.querySelectorAll<HTMLButtonElement>('[data-ui="popup.app.tabs"] button')].every(
      (button) => button.textContent === '' && Boolean(button.getAttribute('aria-label'))
    )
  ).toBe(true);
  const buttons = container.querySelectorAll<HTMLButtonElement>(
    '[data-ui="popup.app.tabs"] button'
  );
  act(() => buttons[0]?.click());
  expect(mocks.loadRoute).toHaveBeenCalledTimes(1);
  act(() => buttons[1]?.click());
  expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull();
  expect(mocks.saveLastPage).not.toHaveBeenCalled();
  await act(async () => resolveVideo(Video));
  expect(container.querySelector('[data-testid="video-route"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="popup.app.tabs"]')?.getAttribute('data-animate')).toBe(
    'true'
  );
  await vi.waitFor(() => expect(mocks.saveLastPage).toHaveBeenCalledWith('video'));
});

it('loads the command palette only after the actual hotkey', async () => {
  mocks.coordinator.mockReturnValue(new Promise(() => undefined));
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  expect(container.querySelector('[data-testid="route-first-palette"]')).toBeNull();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await vi.dynamicImportSettled();
  });
  expect(container.querySelector('[data-testid="route-first-palette"]')).not.toBeNull();
});

it('keeps the committed route when a cold target fails to load', async () => {
  const Home = () => <div data-testid="home-route" />;
  const Video = () => <div data-testid="video-route" />;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute
    .mockResolvedValueOnce(Home)
    .mockRejectedValueOnce(new Error('chunk failed'))
    .mockResolvedValueOnce(Video);
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  const video = container.querySelectorAll<HTMLButtonElement>('button')[1]!;
  await act(async () => video.click());
  await vi.waitFor(() => expect(video.getAttribute('aria-busy')).toBeNull());
  expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="popup.app.route-error"]')).not.toBeNull();
  expect(mocks.saveLastPage).not.toHaveBeenCalled();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-ui="popup.app.route-error"] button')?.click()
  );
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="video-route"]')).not.toBeNull()
  );
});

it('surfaces and retries an initial selected-route module failure', async () => {
  const Home = () => <div data-testid="home-route" />;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute.mockRejectedValueOnce(new Error('chunk failed')).mockResolvedValueOnce(Home);
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-ui="popup.app.route-error"]')).not.toBeNull()
  );
  expect(container.querySelector('[data-testid="home-route"]')).toBeNull();
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-ui="popup.app.route-error"] button')?.click()
  );
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
});

it('does not preload non-selected routes after startup settles', async () => {
  const Home = () => <div data-testid="home-route" />;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute.mockResolvedValueOnce(Home);
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  expect(mocks.preload).not.toHaveBeenCalled();
});

it('restores the last persisted route when saving a committed navigation fails', async () => {
  const Home = () => <div data-testid="home-route" />;
  const Video = () => <div data-testid="video-route" />;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute.mockResolvedValueOnce(Home).mockResolvedValueOnce(Video);
  mocks.saveLastPage.mockRejectedValueOnce(new Error('storage failed'));
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  await act(async () => container.querySelectorAll<HTMLButtonElement>('button')[1]?.click());
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  await vi.waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
});

it('routes a cross-page recording message to Video', async () => {
  const Home = () => <div data-testid="home-route" />;
  const Video = () => <div data-testid="video-route" />;
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute.mockResolvedValueOnce(Home).mockResolvedValueOnce(Video);
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() => expect(mocks.messageHandlers).toHaveBeenCalled());
  const handlers = mocks.messageHandlers.mock.calls.at(-1)?.[0] as {
    onRecordingState(state: { status: string }): void;
    onRecordingStartFailed(error?: string): void;
  };
  await act(async () => handlers.onRecordingState({ status: 'RECORDING' }));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="video-route"]')).not.toBeNull()
  );
  const videoHandlers = mocks.messageHandlers.mock.calls.at(-1)?.[0] as typeof handlers;
  act(() => {
    videoHandlers.onRecordingState({ status: 'IDLE' });
    videoHandlers.onRecordingStartFailed('failed');
  });
});

it('ignores a stale cold-route result when a newer navigation wins', async () => {
  const Home = () => <div data-testid="home-route" />;
  const Video = () => <div data-testid="video-route" />;
  const Export = () => <div data-testid="export-route" />;
  let resolveVideo!: (component: React.ComponentType) => void;
  let resolveExport!: (component: React.ComponentType) => void;
  const videoPromise = new Promise<React.ComponentType>((resolve) => (resolveVideo = resolve));
  const exportPromise = new Promise<React.ComponentType>((resolve) => (resolveExport = resolve));
  mocks.coordinator.mockResolvedValue({ page: 'screenshots' });
  mocks.loadRoute
    .mockResolvedValueOnce(Home)
    .mockImplementation((descriptor: { page: string }) =>
      descriptor.page === 'video' ? videoPromise : exportPromise
    );
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="home-route"]')).not.toBeNull()
  );
  const buttons = container.querySelectorAll<HTMLButtonElement>('button');
  act(() => buttons[1]?.click());
  await vi.waitFor(() => expect(mocks.loadRoute).toHaveBeenCalledTimes(2));
  act(() => container.querySelectorAll<HTMLButtonElement>('button')[4]?.click());
  await vi.waitFor(() => expect(mocks.loadRoute).toHaveBeenCalledTimes(3));
  await act(async () => resolveVideo(Video));
  expect(container.querySelector('[data-testid="video-route"]')).toBeNull();
  await act(async () => resolveExport(Export));
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="export-route"]')).not.toBeNull()
  );
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps the real shell visible while startup and the selected route are pending', async () => {
  mocks.coordinator.mockReturnValue(new Promise(() => undefined));
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));

  expect(container.querySelector('[data-ui="popup.app.root"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-ui="popup.app.tabs"] > button')).toHaveLength(5);
  expect(container.querySelector('[data-ui="popup.app.tabs"] > [data-page="none"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="popup.app.content"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="popup.app.route-skeleton"]')).not.toBeNull();
  await vi.waitFor(() => expect(mocks.initializeTheme).toHaveBeenCalledOnce());
});

it('projects the resolved route without replacing the shell node', async () => {
  let resolveRoute!: (value: React.ComponentType) => void;
  mocks.coordinator.mockResolvedValue({ page: 'video' });
  mocks.loadRoute.mockReturnValue(new Promise((resolve) => (resolveRoute = resolve)));
  const { PopupApp } = await import('./index');
  act(() => root.render(<PopupApp />));
  const shell = container.querySelector('[data-ui="popup.app.root"]');

  await act(async () => {
    await Promise.resolve();
    resolveRoute(() => <div data-testid="video-route" />);
  });

  expect(container.querySelector('[data-ui="popup.app.root"]')).toBe(shell);
  await vi.waitFor(() =>
    expect(container.querySelector('[data-testid="video-route"]')).not.toBeNull()
  );
});
