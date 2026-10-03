// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  patchSettings: vi.fn(),
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: storageMocks.loadSettings,
  patchSettings: storageMocks.patchSettings,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

import { useToolbarDragPosition } from '.';

type DragState = ReturnType<typeof useToolbarDragPosition>;

let container: HTMLDivElement | null = null;
let latestDragState: DragState | null = null;
let root: Root | null = null;
let addEventListenerSpy: ReturnType<typeof vi.spyOn> | null = null;

function DragHarness(props: {
  currentViewport: { width: number; height: number } | null;
  fullToolbar?: boolean;
}) {
  const state = useToolbarDragPosition(props.currentViewport);

  useEffect(() => {
    latestDragState = state;
  });

  return (
    <div ref={state.toolbarRef} data-display-mode={state.displayMode}>
      {props.fullToolbar
        ? Array.from({ length: 20 }, (_, index) => <button key={index} className="sniptale-btn" />)
        : null}
    </div>
  );
}

async function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

async function flushAsyncState() {
  await act(async () => {
    await Promise.resolve();
  });
}

function getDragState() {
  if (!latestDragState) {
    throw new Error('Drag state is not ready');
  }

  return latestDragState;
}

function createDeferredSettings() {
  let resolve!: (value: {
    contentToolbar: {
      compactMenus: boolean;
      displayMode: 'horizontal' | 'vertical';
      position: { x: number; y: number } | null;
    };
  }) => void;

  return {
    promise: new Promise<{
      contentToolbar: {
        compactMenus: boolean;
        displayMode: 'horizontal' | 'vertical';
        position: { x: number; y: number } | null;
      };
    }>((nextResolve) => {
      resolve = nextResolve;
    }),
    resolve,
  };
}

function expectCenteredToolbarPosition() {
  expect(getDragState().position).toEqual({
    x: (window.innerWidth - 120) / 2,
    y: 8,
  });
}

async function expectClampedToolbarPreferences() {
  storageMocks.loadSettings.mockResolvedValue({
    contentToolbar: {
      compactMenus: true,
      freePlacement: true,
      dockEdge: 'top',
      displayMode: 'vertical',
      position: { x: 9999, y: 9999 },
    },
  });

  await renderElement(<DragHarness currentViewport={null} />);
  await flushAsyncState();

  expect(getDragState().displayMode).toBe('vertical');
  expect(getDragState().compactMenus).toBe(true);
  expect(getDragState().position).toEqual({
    x: window.innerWidth - 120,
    y: window.innerHeight - 32,
  });
}

async function dragToolbarToViewportEdge() {
  act(() => {
    getDragState().setDisplayMode('vertical');
    getDragState().handleMouseDown({
      clientX: 500,
      clientY: 20,
      preventDefault: vi.fn(),
    });
  });

  expect(getDragState().isDragging).toBe(true);

  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: -50, clientY: 900 }));
  });

  expect(getDragState().position).toEqual({
    x: 0,
    y: window.innerHeight - 32,
  });

  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup'));
  });
  act(() => {
    vi.advanceTimersByTime(160);
  });
  await flushAsyncState();
}

async function expectToolbarDragPersistence() {
  await renderElement(<DragHarness currentViewport={null} />);
  await flushAsyncState();

  expectCenteredToolbarPosition();
  act(() => {
    getDragState().setCompactMenus(true);
    getDragState().setFreePlacement(true);
  });
  await dragToolbarToViewportEdge();

  expect(getDragState().isDragging).toBe(false);
  expect(storageMocks.patchSettings).toHaveBeenCalledWith({
    contentToolbar: {
      compactMenus: true,
      freePlacement: true,
      dockEdge: 'top',
      displayMode: 'vertical',
      position: {
        x: 0,
        y: window.innerHeight - 32,
      },
    },
  });
}

async function expectPassiveDragListeners() {
  await renderElement(<DragHarness currentViewport={null} />);
  await flushAsyncState();

  act(() => {
    getDragState().handleMouseDown({
      clientX: 100,
      clientY: 20,
      preventDefault: vi.fn(),
    });
  });

  expect(addEventListenerSpy).toHaveBeenCalledWith(
    'pointermove',
    expect.any(Function),
    expect.objectContaining({ capture: true, passive: true })
  );
  expect(addEventListenerSpy).toHaveBeenCalledWith(
    'pointerup',
    expect.any(Function),
    expect.objectContaining({ capture: true, passive: true })
  );
  expect(addEventListenerSpy).toHaveBeenCalledWith(
    'pointercancel',
    expect.any(Function),
    expect.objectContaining({ capture: true, passive: true })
  );
}

async function expectPositionReadinessDuringPreferenceLoad() {
  const deferredSettings = createDeferredSettings();
  storageMocks.loadSettings.mockReturnValueOnce(deferredSettings.promise);

  await renderElement(<DragHarness currentViewport={null} />);

  expect(getDragState().positionReady).toBe(false);

  deferredSettings.resolve({
    contentToolbar: {
      compactMenus: false,
      displayMode: 'horizontal',
      position: null,
    },
  });

  await flushAsyncState();

  expect(getDragState().positionReady).toBe(true);
  expectCenteredToolbarPosition();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  storageMocks.loadSettings.mockResolvedValue({
    contentToolbar: {
      compactMenus: false,
      displayMode: 'horizontal',
      position: null,
    },
  });
  storageMocks.patchSettings.mockResolvedValue(undefined);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 120,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: () => 32,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestDragState = null;
  addEventListenerSpy = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toolbar drag position hook', () => {
  it(
    'restores persisted toolbar preferences and clamps the saved position into the viewport',
    expectClampedToolbarPreferences
  );
  it(
    'updates the toolbar position while dragging and persists the latest layout preference',
    expectToolbarDragPersistence
  );
  it('registers passive window listeners for drag tracking', expectPassiveDragListeners);
  it(
    'keeps the toolbar position hidden behind readiness until preferences resolve',
    expectPositionReadinessDuringPreferenceLoad
  );
});

it('previews every edge, persists only a completed dock, and restores it on viewport resize', async () => {
  await renderElement(<DragHarness currentViewport={null} />);
  act(() => vi.advanceTimersByTime(160));
  storageMocks.patchSettings.mockClear();
  act(() => getDragState().handleMouseDown({ clientX: 500, clientY: 20, preventDefault: vi.fn() }));
  for (const [edge, x, y] of [
    ['left', 10, 300],
    ['bottom', 500, 760],
    ['right', 1010, 300],
    ['top', 500, 10],
    ['left', 10, 300],
  ] as const) {
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y })));
    expect(getDragState().dockPreview).toBe(edge);
    expect(getDragState().displayMode).toBe('horizontal');
    act(() => vi.advanceTimersByTime(200));
    expect(storageMocks.patchSettings).not.toHaveBeenCalled();
  }
  act(() => window.dispatchEvent(new MouseEvent('pointerup')));
  act(() => vi.advanceTimersByTime(160));
  expect(storageMocks.patchSettings).toHaveBeenCalledWith({
    contentToolbar: expect.objectContaining({
      freePlacement: false,
      dockEdge: 'left',
      displayMode: 'vertical',
    }),
  });
  expect(getDragState().position).toEqual({ x: 8, y: (window.innerHeight - 32) / 2 });
  vi.stubGlobal('innerHeight', 1000);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(getDragState().position.y).toBe(484);
});

it.each(['pointercancel', 'blur', 'Escape', 'outside'])(
  'restores the committed dock after %s',
  async (reason) => {
    await renderElement(<DragHarness currentViewport={null} />);
    act(() =>
      getDragState().handleMouseDown({ clientX: 500, clientY: 20, preventDefault: vi.fn() })
    );
    act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 300 })));
    expect(getDragState().displayMode).toBe('horizontal');
    act(() => {
      if (reason === 'outside') {
        window.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 300 }));
        window.dispatchEvent(new MouseEvent('pointerup'));
      } else if (reason === 'Escape')
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else window.dispatchEvent(new Event(reason));
    });
    expect(getDragState().isDragging).toBe(false);
    expect(getDragState().dockPreview).toBeNull();
    expect(getDragState().displayMode).toBe('horizontal');
    expectCenteredToolbarPosition();
  }
);

it('restores a saved dock and keeps its orientation when free placement is enabled', async () => {
  storageMocks.loadSettings.mockResolvedValue({
    contentToolbar: {
      freePlacement: false,
      dockEdge: 'right',
      displayMode: 'horizontal',
      position: { x: 40, y: 50 },
    },
  });
  await renderElement(<DragHarness currentViewport={null} />);
  expect(getDragState().displayMode).toBe('vertical');
  expect(getDragState().position.x).toBe(window.innerWidth - 120 - 8);
  act(() => getDragState().setFreePlacement(true));
  expect(getDragState().displayMode).toBe('vertical');
  act(() => getDragState().setDisplayMode('horizontal'));
  expect(getDragState().displayMode).toBe('horizontal');
  act(() => getDragState().setFreePlacement(false));
  expect(getDragState().displayMode).toBe('vertical');
});

it('fits vertical controls and restores normal density when height returns', async () => {
  storageMocks.loadSettings.mockResolvedValue({ contentToolbar: { dockEdge: 'left' } });
  vi.stubGlobal('innerHeight', 720);
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return (
        (Number.parseFloat(this.style.getPropertyValue('--sniptale-toolbar-button-size')) || 36) *
          20 +
        100
      );
    },
  });
  const originalGetComputedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = originalGetComputedStyle(element);
    vi.spyOn(style, 'getPropertyValue').mockReturnValue('36px');
    return style;
  });
  await renderElement(<DragHarness currentViewport={null} fullToolbar />);
  const toolbar = getDragState().toolbarRef.current!;
  expect(toolbar.offsetHeight).toBeLessThanOrEqual(704);
  expect(
    Number.parseFloat(toolbar.style.getPropertyValue('--sniptale-toolbar-button-size'))
  ).toBeGreaterThanOrEqual(24);
  expect(getDragState().position.y).toBeGreaterThanOrEqual(8);
  vi.stubGlobal('innerHeight', 1000);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(toolbar.style.getPropertyValue('--sniptale-toolbar-button-size')).toBe('');
  expect(getDragState().position.y).toBe(90);
});
