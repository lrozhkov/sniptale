/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { SelectionModeRuntimeFacadeArgs } from './runtime/facade/types';

const mocks = vi.hoisted(() => ({
  createRuntimeFacadeMock: vi.fn((_: SelectionModeRuntimeFacadeArgs) => ({
    disableCursor: vi.fn(),
    disableSelectionMode: vi.fn(),
    enableSelectionMode: vi.fn(),
    isSelectionModeActive: vi.fn(),
    setupSizePanelListeners: vi.fn(),
    uiRuntime: {
      createDragFrame: vi.fn(),
      createFinalElements: vi.fn(),
      createHoverElements: vi.fn(),
      createOverlayContainer: vi.fn(),
      prepare: vi.fn(),
    },
    zIndexBase: 0,
  })),
  createRuntimeGraphBindingsMock: vi.fn((args) => args),
  createSessionSettersMock: vi.fn((session) => ({
    setAspectRatio: vi.fn((value) => {
      session.aspectRatio = value;
    }),
    setCleanupEventListeners: vi.fn(),
    setCleanupScrollListeners: vi.fn(),
    setCurrentSelection: vi.fn((value) => {
      session.currentSelection = value;
    }),
    setCurrentState: vi.fn(),
    setIsActive: vi.fn((value) => {
      session.isActive = value;
    }),
    setMaintainAspectRatio: vi.fn((value) => {
      session.maintainAspectRatio = value;
    }),
    setRejectCallback: vi.fn((value) => {
      session.rejectCallback = value;
    }),
    setResolveCallback: vi.fn((value) => {
      session.resolveCallback = value;
    }),
  })),
  mountStyleMock: vi.fn(),
  setupRuntimeListenersMock: vi.fn(),
}));

vi.mock('./runtime/facade', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime/facade')>()),
  createSelectionModeRuntimeFacade: mocks.createRuntimeFacadeMock,
}));

vi.mock('./interaction/actions/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./interaction/actions/runtime')>()),
  setupSelectionModeRuntimeListeners: mocks.setupRuntimeListenersMock,
}));

vi.mock('./session/locals/setters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session/locals/setters')>()),
  createSelectionModeSessionLocalSetters: mocks.createSessionSettersMock,
}));

vi.mock('./runtime/graph-bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runtime/graph-bindings')>()),
  createSelectionModeRuntimeGraphBindings: mocks.createRuntimeGraphBindingsMock,
}));

vi.mock('../../platform/frame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/frame')>();

  return {
    ...actual,
    mountStyleInAccessibleDocuments: mocks.mountStyleMock,
    walkAllDocuments: vi.fn(),
  };
});

import { createSelectionModeFacadeBindings } from './controller/runtime-bindings/facade';
import { createSelectionModeRuntimeBindings } from './controller/runtime-bindings/runtime';
import { disableSelectionModeCursor, enableSelectionModeCursor } from './interaction/cursor';
import { handleResizeSelectionMove } from './interaction/selection/helpers';

function createSession() {
  return {
    aspectRatio: null,
    currentSelection: null,
    dom: { root: document.body },
    isActive: false,
    maintainAspectRatio: false,
    rejectCallback: null,
    resolveCallback: null,
  } as any;
}

describe('selection mode residual seams', () => {
  it('creates facade and runtime bindings around the session owner', () => {
    const session = createSession();
    const facade = createSelectionModeFacadeBindings({
      cleanup: vi.fn(),
      getRuntimeArgs: () => ({ runtime: 'args' }) as any,
      getRuntimeEvents: () => ({
        cancelSelection: vi.fn(),
        confirmSelection: vi.fn(),
        constrainSelection: vi.fn(),
        resetToIdleState: vi.fn(),
        updateFinalFrame: vi.fn(),
      }),
      session,
      state: { status: 'idle' } as never,
    });
    const runtimeBindings = createSelectionModeRuntimeBindings({
      cleanup: vi.fn(),
      mutableRefs: {} as never,
      runtimeFacade: facade as never,
      session,
      state: { status: 'idle' } as never,
      updateFinalFrame: vi.fn(),
    });

    expect(mocks.createRuntimeFacadeMock).toHaveBeenCalled();
    expect(mocks.setupRuntimeListenersMock).not.toHaveBeenCalled();
    const runtimeFacadeArgs = mocks.createRuntimeFacadeMock.mock.calls[0]?.[0];
    runtimeFacadeArgs?.setupRuntimeListeners();
    expect(mocks.setupRuntimeListenersMock).toHaveBeenCalledWith({ runtime: 'args' });
    expect(runtimeBindings).toEqual(
      expect.objectContaining({ minSelectionSize: expect.any(Number) })
    );
  });

  it('mounts and clears the selection cursor style', () => {
    Object.defineProperty(document.documentElement, 'style', {
      configurable: true,
      value: document.documentElement.style,
    });
    document.documentElement.style.setProperty('--sniptale-color-accent', '#123456');
    const cleanup = vi.fn();
    mocks.mountStyleMock.mockReturnValue(cleanup);
    const state = { cursorStyleCleanup: null } as any;

    enableSelectionModeCursor(state);
    disableSelectionModeCursor(state);

    expect(mocks.mountStyleMock).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: 'sniptale-crosshair-cursor' })
    );
    expect(cleanup).toHaveBeenCalledOnce();
    expect(state.cursorStyleCleanup).toBeNull();
  });

  it('resizes selections while preserving minimum size constraints', () => {
    const moved = handleResizeSelectionMove({
      aspectRatio: 2,
      dragStartPoint: { x: 10, y: 10 },
      event: { clientX: 40, clientY: 30 } as MouseEvent,
      getMaxSelectionHeight: () => 500,
      getMaxSelectionWidth: () => 500,
      maintainAspectRatio: true,
      minSelectionSize: 10,
      resizeDirection: 'se',
      selectionAtDragStart: { height: 40, width: 60, x: 20, y: 20 },
    });
    expect(moved.width).toBeGreaterThanOrEqual(10);
    expect(moved.height).toBeGreaterThanOrEqual(10);
  });
});
