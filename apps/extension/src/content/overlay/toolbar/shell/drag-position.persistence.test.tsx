// @vitest-environment jsdom

import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patchSettings: vi.fn(),
  loadSettings: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  patchSettings: mocks.patchSettings,
  loadSettings: mocks.loadSettings,
}));

import {
  useToolbarPreferencePersistence,
  useToolbarPreferencesState,
  useToolbarViewportClamping,
} from './drag-position.effects';

function Harness({ compactMenus = false }: { compactMenus?: boolean }) {
  useToolbarPreferencePersistence({
    compactMenus,
    displayMode: 'horizontal',
    isInitialized: true,
    position: { x: 10, y: 20 },
    preferencesReady: true,
  });
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('does not report toolbar persistence after the content extension context is invalidated', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('Extension context invalidated.'));

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(mocks.patchSettings).toHaveBeenCalledOnce();
  expect(consoleError).not.toHaveBeenCalled();
});

it('continues to report genuine toolbar persistence failures', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('storage failed'));

  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });

  expect(consoleError).toHaveBeenCalledWith(
    '[ContentToolbarDragPosition]',
    'Failed to persist content toolbar preferences',
    expect.any(Error)
  );
});

it.each([false, true])(
  'saves compact menus %s before Crop unmount cancels the position timer',
  async (compactMenus) => {
    mocks.patchSettings.mockResolvedValue(undefined);
    await act(async () => {
      root?.render(<Harness compactMenus={compactMenus} />);
    });
    await act(async () => {
      root?.unmount();
    });
    root = null;
    expect(mocks.patchSettings).toHaveBeenCalledWith({
      contentToolbar: expect.objectContaining({ compactMenus }),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(mocks.patchSettings).toHaveBeenCalledOnce();
  }
);

it('flushes only the latest preference and never replays the cancelled timer', async () => {
  mocks.patchSettings.mockResolvedValue(undefined);
  await act(async () => {
    root?.render(<Harness compactMenus={false} />);
  });
  await act(async () => {
    root?.render(<Harness compactMenus />);
  });
  await act(async () => {
    root?.unmount();
  });
  root = null;
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(mocks.patchSettings).toHaveBeenCalledExactlyOnceWith({
    contentToolbar: expect.objectContaining({ compactMenus: true }),
  });
});

it('reports a failed unmount save through the existing advisory failure policy', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('storage failed'));
  await act(async () => {
    root?.render(<Harness compactMenus />);
  });
  await act(async () => {
    root?.unmount();
  });
  root = null;
  expect(consoleError).toHaveBeenCalledWith(
    '[ContentToolbarDragPosition]',
    'Failed to persist content toolbar preferences',
    expect.any(Error)
  );
});

function RestoredPreferences() {
  const preferences = useToolbarPreferencesState();
  return (
    <output>{preferences.preferencesReady ? String(preferences.compactMenus) : 'loading'}</output>
  );
}

it.each([false, true])(
  'hydrates compact menus %s only after the previous toolbar save completes',
  async (compactMenus) => {
    let stored = !compactMenus;
    let finishSave = () => {};
    mocks.loadSettings.mockImplementation(async () => ({
      contentToolbar: { compactMenus: stored },
    }));
    mocks.patchSettings.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            stored = compactMenus;
            resolve();
          };
        })
    );
    await act(async () => {
      root?.render(<Harness compactMenus={compactMenus} />);
    });
    await act(async () => {
      root?.unmount();
    });
    root = createRoot(container!);
    await act(async () => {
      root?.render(<RestoredPreferences />);
    });
    expect(container?.textContent).toBe('loading');
    expect(mocks.loadSettings).not.toHaveBeenCalled();
    await act(async () => {
      finishSave();
    });
    expect(container?.textContent).toBe(String(compactMenus));
  }
);

it('loads persisted preferences after a previous toolbar save fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.patchSettings.mockRejectedValueOnce(new Error('storage failed'));
  mocks.loadSettings.mockResolvedValue({ contentToolbar: { compactMenus: true } });
  await act(async () => {
    root?.render(<Harness />);
  });
  await act(async () => {
    root?.unmount();
  });
  root = createRoot(container!);
  await act(async () => {
    root?.render(<RestoredPreferences />);
  });
  expect(container?.textContent).toBe('true');
});

it('commits final scaled dock geometry once and ignores intermediate animated resize', () => {
  let resize = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('innerWidth', 1280);
  let width = 400;
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(48);
  let commit!: () => { x: number; y: number };
  function Geometry() {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: 0, y: 8 });
    commit = useToolbarViewportClamping({
      dockEdge: 'top',
      currentViewport: null,
      displayMode: 'horizontal',
      isInitialized: true,
      position,
      setPosition,
      toolbarRef,
      uiScale: 2,
    });
    return (
      <div ref={toolbarRef}>
        <output>
          {position.x},{position.y}
        </output>
      </div>
    );
  }
  act(() => root?.render(<Geometry />));
  expect(container?.textContent).toBe('120,8');
  width = 600;
  act(() => expect(commit()).toEqual({ x: 20, y: 8 }));
  expect(container?.textContent).toBe('20,8');
  container!.firstElementChild!.setAttribute('data-mode-transition', 'true');
  width = 500;
  act(() => resize());
  expect(container?.textContent).toBe('20,8');
  container!.firstElementChild!.removeAttribute('data-mode-transition');
  act(() => resize());
  expect(container?.textContent).toBe('70,8');
  vi.restoreAllMocks();
});
