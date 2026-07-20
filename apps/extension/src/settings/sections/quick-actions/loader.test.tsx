// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { QuickAction, QuickActionsDisplayMode } from '../../../contracts/settings';

const loaderMocks = vi.hoisted(() => ({
  getQuickActionsMock: vi.fn(),
  getQuickActionsDisplayModeMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal()),
  getQuickActions: loaderMocks.getQuickActionsMock,
  getQuickActionsDisplayMode: loaderMocks.getQuickActionsDisplayModeMock,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loaderMocks.loggerErrorMock,
  }),
}));

import { useQuickActionsLoader } from './loader';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function LoaderHarness(props: {
  setActions: (actions: QuickAction[]) => void;
  setDisplayModeState: (value: QuickActionsDisplayMode) => void;
  setIsLoading: (value: boolean) => void;
}) {
  useQuickActionsLoader(props);
  return null;
}

async function renderHarness(props: React.ComponentProps<typeof LoaderHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<LoaderHarness {...props} />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loaderMocks.getQuickActionsMock.mockReset();
  loaderMocks.getQuickActionsDisplayModeMock.mockReset();
  loaderMocks.loggerErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads quick actions state and clears loading once data arrives', async () => {
  const setActions = vi.fn();
  const setDisplayModeState = vi.fn();
  const setIsLoading = vi.fn();

  loaderMocks.getQuickActionsMock.mockResolvedValue([{ id: 'action-1' }]);
  loaderMocks.getQuickActionsDisplayModeMock.mockResolvedValue('list');

  await renderHarness({ setActions, setDisplayModeState, setIsLoading });
  await flushEffects();

  expect(setIsLoading).toHaveBeenNthCalledWith(1, true);
  expect(setActions).toHaveBeenCalledWith([{ id: 'action-1' }]);
  expect(setDisplayModeState).toHaveBeenCalledWith('list');
  expect(setIsLoading).toHaveBeenLastCalledWith(false);
});

it('logs loader failures and still clears loading state', async () => {
  const setActions = vi.fn();
  const setDisplayModeState = vi.fn();
  const setIsLoading = vi.fn();
  const loadError = new Error('load failed');

  loaderMocks.getQuickActionsMock.mockRejectedValue(loadError);
  loaderMocks.getQuickActionsDisplayModeMock.mockResolvedValue('list');

  await renderHarness({ setActions, setDisplayModeState, setIsLoading });
  await flushEffects();

  expect(loaderMocks.loggerErrorMock).toHaveBeenCalledWith(
    'Failed to load quick actions',
    loadError
  );
  expect(setActions).not.toHaveBeenCalled();
  expect(setDisplayModeState).not.toHaveBeenCalled();
  expect(setIsLoading).toHaveBeenLastCalledWith(false);
});
