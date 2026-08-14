// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { PopupPage } from '../navigation/actions';
import type { PopupNavigationResult } from './types/navigation';

const mocks = vi.hoisted(() => ({
  isPopupPagePreloaded: vi.fn(() => false),
  preloadPopupPage: vi.fn<(page: PopupPage) => Promise<void>>(),
  toastError: vi.fn(),
}));

vi.mock('../lazy-chunks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lazy-chunks')>()),
  isPopupPagePreloaded: mocks.isPopupPagePreloaded,
  preloadPopupPage: mocks.preloadPopupPage,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError },
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

import { useState } from 'react';
import { usePopupNavigationState } from './navigation';

type NavigationState = ReturnType<typeof usePopupNavigationState> & { page: PopupPage };
let latest: NavigationState | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function Harness() {
  const [page, setPage] = useState<PopupPage>('home');
  latest = { page, ...usePopupNavigationState(page, setPage) };
  return <div data-page={page} data-pending={latest.pendingPage ?? ''} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.preloadPopupPage.mockResolvedValue(undefined);
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root?.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  latest = null;
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

it('keeps the current page visible until the target resource resolves', async () => {
  const target = deferred();
  mocks.preloadPopupPage.mockReturnValueOnce(target.promise);

  let navigation!: Promise<PopupNavigationResult>;
  act(() => {
    navigation = latest!.navigateToPage('video', 'tab');
  });

  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBe('video');

  await act(async () => target.resolve());
  await expect(navigation).resolves.toBe('committed');

  expect(latest?.page).toBe('video');
  expect(latest?.pendingPage).toBeNull();
});

it('lets the latest navigation intent win over a stale load result', async () => {
  const video = deferred();
  const exportRoute = deferred();
  mocks.preloadPopupPage.mockImplementation((page) =>
    page === 'video' ? video.promise : exportRoute.promise
  );

  let first!: Promise<PopupNavigationResult>;
  let second!: Promise<PopupNavigationResult>;
  act(() => {
    first = latest!.navigateToPage('video', 'tab');
    second = latest!.navigateToPage('export', 'tab');
  });

  await act(async () => video.resolve());
  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBe('export');

  await act(async () => exportRoute.resolve());
  await expect(first).resolves.toBe('committed');
  await expect(second).resolves.toBe('committed');
  expect(latest?.page).toBe('export');
});

it('settles a superseded startup route from the higher-priority recording winner', async () => {
  const exportRoute = deferred();
  const video = deferred();
  mocks.preloadPopupPage.mockImplementation((page) =>
    page === 'export' ? exportRoute.promise : video.promise
  );

  let startupNavigation!: Promise<PopupNavigationResult>;
  let recordingNavigation!: Promise<PopupNavigationResult>;
  act(() => {
    startupNavigation = latest!.navigateToPage('export', 'startup');
    recordingNavigation = latest!.navigateToPage('video', 'recording');
  });

  await act(async () => exportRoute.resolve());
  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBe('video');

  await act(async () => video.resolve());

  await expect(startupNavigation).resolves.toBe('committed');
  await expect(recordingNavigation).resolves.toBe('committed');
  expect(latest?.page).toBe('video');
  expect(latest?.pendingPage).toBeNull();
});

it('retains the committed winner when it settles before the superseded startup loader', async () => {
  const exportRoute = deferred();
  const video = deferred();
  mocks.preloadPopupPage.mockImplementation((page) =>
    page === 'export' ? exportRoute.promise : video.promise
  );

  let startupNavigation!: Promise<PopupNavigationResult>;
  let recordingNavigation!: Promise<PopupNavigationResult>;
  act(() => {
    startupNavigation = latest!.navigateToPage('export', 'startup');
    recordingNavigation = latest!.navigateToPage('video', 'recording');
  });

  await act(async () => video.resolve());
  await expect(recordingNavigation).resolves.toBe('committed');
  expect(latest?.page).toBe('video');

  await act(async () => exportRoute.resolve());

  await expect(startupNavigation).resolves.toBe('committed');
  expect(latest?.page).toBe('video');
  expect(latest?.pendingPage).toBeNull();
});

it('propagates failure from the final winning navigation to a superseded startup intent', async () => {
  const exportRoute = deferred();
  const video = deferred();
  mocks.preloadPopupPage.mockImplementation((page) =>
    page === 'export' ? exportRoute.promise : video.promise
  );

  let startupNavigation!: Promise<PopupNavigationResult>;
  let recordingNavigation!: Promise<PopupNavigationResult>;
  act(() => {
    startupNavigation = latest!.navigateToPage('export', 'startup');
    recordingNavigation = latest!.navigateToPage('video', 'recording');
  });

  await act(async () => exportRoute.resolve());
  await act(async () => video.reject(new Error('video chunk failed')));

  await expect(startupNavigation).resolves.toBe('failed');
  await expect(recordingNavigation).resolves.toBe('failed');
  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBeNull();
});

it('retains the failed winner when it settles before the superseded startup loader', async () => {
  const exportRoute = deferred();
  const video = deferred();
  mocks.preloadPopupPage.mockImplementation((page) =>
    page === 'export' ? exportRoute.promise : video.promise
  );

  let startupNavigation!: Promise<PopupNavigationResult>;
  let recordingNavigation!: Promise<PopupNavigationResult>;
  act(() => {
    startupNavigation = latest!.navigateToPage('export', 'startup');
    recordingNavigation = latest!.navigateToPage('video', 'recording');
  });

  await act(async () => video.reject(new Error('video chunk failed')));
  await expect(recordingNavigation).resolves.toBe('failed');

  await act(async () => exportRoute.resolve());

  await expect(startupNavigation).resolves.toBe('failed');
  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBeNull();
});

it('coalesces concurrent bootstrap and recording intents for the same cold route', async () => {
  const video = deferred();
  mocks.preloadPopupPage.mockReturnValueOnce(video.promise);

  let bootstrapNavigation!: Promise<PopupNavigationResult>;
  let recordingNavigation!: Promise<PopupNavigationResult>;
  act(() => {
    bootstrapNavigation = latest!.navigateToPage('video', 'startup');
    recordingNavigation = latest!.navigateToPage('video', 'recording');
  });

  expect(recordingNavigation).toBe(bootstrapNavigation);
  expect(mocks.preloadPopupPage).toHaveBeenCalledTimes(1);
  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBe('video');

  await act(async () => video.resolve());

  await expect(bootstrapNavigation).resolves.toBe('committed');
  await expect(recordingNavigation).resolves.toBe('committed');
  expect(latest?.page).toBe('video');
  expect(latest?.pendingPage).toBeNull();
});

it('keeps the current page and surfaces the localized error when loading fails', async () => {
  const target = deferred();
  mocks.preloadPopupPage.mockReturnValueOnce(target.promise);

  let navigation!: Promise<PopupNavigationResult>;
  act(() => {
    navigation = latest!.navigateToPage('video', 'tab');
  });
  await act(async () => target.reject(new Error('chunk failed')));
  await expect(navigation).resolves.toBe('failed');

  expect(latest?.page).toBe('home');
  expect(latest?.pendingPage).toBeNull();
  expect(mocks.toastError).toHaveBeenCalledWith('common.states.error');
});
