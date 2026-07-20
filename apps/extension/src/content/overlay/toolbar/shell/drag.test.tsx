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

function DragHarness(props: { currentViewport: { width: number; height: number } | null }) {
  const state = useToolbarDragPosition(props.currentViewport);

  useEffect(() => {
    latestDragState = state;
  });

  return <div ref={state.toolbarRef} />;
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
    y: 5,
  });
}

async function expectClampedToolbarPreferences() {
  storageMocks.loadSettings.mockResolvedValue({
    contentToolbar: {
      compactMenus: true,
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
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: -50, clientY: 900 }));
  });

  expect(getDragState().position).toEqual({
    x: 0,
    y: window.innerHeight - 32,
  });

  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup'));
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
  });
  await dragToolbarToViewportEdge();

  expect(getDragState().isDragging).toBe(false);
  expect(storageMocks.patchSettings).toHaveBeenCalledWith({
    contentToolbar: {
      compactMenus: true,
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
    'mousemove',
    expect.any(Function),
    expect.objectContaining({ passive: true })
  );
  expect(addEventListenerSpy).toHaveBeenCalledWith(
    'mouseup',
    expect.any(Function),
    expect.objectContaining({ passive: true })
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
