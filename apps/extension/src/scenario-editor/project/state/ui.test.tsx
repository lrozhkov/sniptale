// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  loadScenarioEditorNavigatorCollapsedMock: vi.fn(),
  saveScenarioEditorNavigatorCollapsedMock: vi.fn(),
}));

vi.mock('../../persistence/navigator-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/navigator-state')>()),
  loadScenarioEditorNavigatorCollapsed: storageMocks.loadScenarioEditorNavigatorCollapsedMock,
  saveScenarioEditorNavigatorCollapsed: storageMocks.saveScenarioEditorNavigatorCollapsedMock,
}));

import { useScenarioEditorUiState } from './ui';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useScenarioEditorUiState> | null = null;

function renderHookHarness() {
  function Harness() {
    latestState = useScenarioEditorUiState();
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

function createDeferredPromise<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve: resolve! };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestState = null;
  storageMocks.loadScenarioEditorNavigatorCollapsedMock.mockReset();
  storageMocks.saveScenarioEditorNavigatorCollapsedMock.mockReset();
  storageMocks.loadScenarioEditorNavigatorCollapsedMock.mockResolvedValue(false);
  storageMocks.saveScenarioEditorNavigatorCollapsedMock.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('scenario editor ui state', () => {
  it('hydrates navigator collapsed state from shared storage', async () => {
    storageMocks.loadScenarioEditorNavigatorCollapsedMock.mockResolvedValueOnce(true);

    renderHookHarness();

    expect(latestState?.navigatorCollapsed).toBe(false);

    await flushMicrotasks();

    expect(latestState?.navigatorCollapsed).toBe(true);
  });

  it('persists navigator collapsed changes through shared storage', async () => {
    renderHookHarness();
    await flushMicrotasks();

    act(() => {
      latestState?.setNavigatorCollapsed(true);
    });

    expect(latestState?.navigatorCollapsed).toBe(true);
    expect(storageMocks.saveScenarioEditorNavigatorCollapsedMock).toHaveBeenCalledWith(true);
  });
});

describe('scenario editor ui state stale hydration', () => {
  it('does not let late storage hydration overwrite a user toggle', async () => {
    const deferredLoad = createDeferredPromise<boolean>();
    storageMocks.loadScenarioEditorNavigatorCollapsedMock.mockReturnValueOnce(deferredLoad.promise);

    renderHookHarness();

    act(() => {
      latestState?.setNavigatorCollapsed(true);
    });

    deferredLoad.resolve(false);
    await flushMicrotasks();

    expect(latestState?.navigatorCollapsed).toBe(true);
    expect(storageMocks.saveScenarioEditorNavigatorCollapsedMock).toHaveBeenCalledWith(true);
  });
});

describe('scenario editor ui state failure handling', () => {
  it('keeps the default navigator state when preference hydration fails', async () => {
    storageMocks.loadScenarioEditorNavigatorCollapsedMock.mockRejectedValueOnce(
      new Error('read failed')
    );

    renderHookHarness();
    await flushMicrotasks();

    expect(latestState?.navigatorCollapsed).toBe(false);
  });

  it('keeps the UI interactive when navigator preference persistence fails', async () => {
    storageMocks.saveScenarioEditorNavigatorCollapsedMock.mockRejectedValueOnce(
      new Error('write failed')
    );

    renderHookHarness();
    await flushMicrotasks();

    act(() => {
      latestState?.setNavigatorCollapsed(true);
    });
    await flushMicrotasks();

    expect(latestState?.navigatorCollapsed).toBe(true);
  });
});
