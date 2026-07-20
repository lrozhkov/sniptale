// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectLayersMock: vi.fn(() => [{ id: 'layer-1' }]),
  getObjectDimensionsMock: vi.fn(() => ({ height: 45, width: 120 })),
  getSingleSelectionTypeMock: vi.fn(() => 'rectangle'),
  isUserObjectMock: vi.fn(() => true),
  setCropReadyMock: vi.fn(),
  syncRuntimeMock: vi.fn(),
  syncSelectionToolSettingsFromObjectMock: vi.fn(),
}));

let storeState: {
  browserFrame: { enabled: boolean };
  frame: { backgroundColor: string };
  syncRuntime: typeof mocks.syncRuntimeMock;
  setCropReady: typeof mocks.setCropReadyMock;
};

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: { getState: () => storeState },
}));
vi.mock('../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/layers')>()),
  collectLayers: mocks.collectLayersMock,
  getObjectDimensions: mocks.getObjectDimensionsMock,
}));
vi.mock('../selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../selection')>()),
  syncSelectionToolSettingsFromObject: mocks.syncSelectionToolSettingsFromObjectMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    getSingleSelectionType: mocks.getSingleSelectionTypeMock,
    isUserObject: mocks.isUserObjectMock,
  };
});

import { syncEditorRuntimeState, scheduleEditorZoomToFit } from './';

function initializeStoreState() {
  storeState = {
    browserFrame: { enabled: false },
    frame: { backgroundColor: '#fff' },
    setCropReady: mocks.setCropReadyMock,
    syncRuntime: mocks.syncRuntimeMock,
  };
}

function registerRuntimeSyncTests() {
  it('syncs layers, selection, history state, and crop readiness', () => {
    const selectedObject = { sniptaleId: 'rect-1' };
    const canvas = { getActiveObjects: () => [selectedObject] };
    const history = {
      getState: () => ({ canRedo: true, canUndo: true, index: 2, size: 4 }),
    };

    syncEditorRuntimeState(
      canvas as never,
      history as never,
      { id: 'crop' } as never,
      { left: 0, top: 0, width: 10, height: 10 },
      {
        scrollLeft: 20,
        scrollTop: 10,
        zoomLevel: 1,
      } as never
    );

    expect(mocks.syncSelectionToolSettingsFromObjectMock).toHaveBeenCalledWith(
      selectedObject,
      'rectangle'
    );
    expect(mocks.syncRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        history: { canRedo: true, canUndo: true, index: 2, size: 4 },
        layers: [{ id: 'layer-1' }],
        selection: expect.objectContaining({ selectedObjectId: 'rect-1' }),
      })
    );
    expect(mocks.setCropReadyMock).toHaveBeenCalledWith(true);
  });
}

function registerRuntimeFallbackTests() {
  it('falls back to empty history state when runtime owners are missing', () => {
    syncEditorRuntimeState(null, null, null, null, {
      scrollLeft: 0,
      scrollTop: 0,
      zoomLevel: 1,
    } as never);

    expect(mocks.syncRuntimeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        history: { canRedo: false, canUndo: false, index: 0, size: 1 },
      })
    );
    expect(mocks.setCropReadyMock).toHaveBeenCalledWith(false);
  });
}

function registerZoomScheduleTests() {
  it('schedules zoom-to-fit on a double animation frame', () => {
    const callbacks: FrameRequestCallback[] = [];
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    }) as never;

    try {
      const callback = vi.fn();
      scheduleEditorZoomToFit(callback);
      callbacks[0]?.(0);
      callbacks[1]?.(16);
      expect(callback).toHaveBeenCalledOnce();
    } finally {
      window.requestAnimationFrame = original;
    }
  });
}

function runRuntimeAndToolModeSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeStoreState();
  });

  registerRuntimeSyncTests();
  registerRuntimeFallbackTests();
  registerZoomScheduleTests();
}

describe('editor-controller runtime and tool mode seams', runRuntimeAndToolModeSuite);
