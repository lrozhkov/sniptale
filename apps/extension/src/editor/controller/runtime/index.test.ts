import { beforeEach, expect, it, vi } from 'vitest';

const storeState = {
  browserFrame: { title: 'Browser frame' },
  frame: { padding: 12 },
  setCropReady: vi.fn(),
  syncRuntime: vi.fn(),
};

const mocks = vi.hoisted(() => ({
  collectLayersMock: vi.fn(() => [{ id: 'layer-1' }]),
  getObjectDimensionsMock: vi.fn(() => ({ height: 80, width: 120 })),
  getSingleSelectionTypeMock: vi.fn(() => 'rectangle'),
  isUserObjectMock: vi.fn(() => true),
  syncSelectionToolSettingsFromObjectMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => storeState,
  },
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

vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  getSingleSelectionType: mocks.getSingleSelectionTypeMock,
  isUserObject: mocks.isUserObjectMock,
}));

import { scheduleEditorZoomToFit, syncEditorRuntimeState } from './';

beforeEach(() => {
  vi.clearAllMocks();
});

it('syncs runtime state with selected object details and history metadata', () => {
  const selectedObject = { sniptaleId: 'object-1', sniptaleType: 'rectangle' };
  const canvas = {
    getActiveObjects: vi.fn(() => [selectedObject]),
  };
  const history = {
    getState: () => ({ canRedo: true, canUndo: true, index: 2, size: 5 }),
  };
  const viewport = { left: 12, top: 24, zoom: 2 } as never;

  syncEditorRuntimeState(
    canvas as never,
    history as never,
    { id: 'crop' } as never,
    { left: 0, top: 0, width: 10, height: 10 },
    viewport
  );

  expect(mocks.syncSelectionToolSettingsFromObjectMock).toHaveBeenCalledWith(
    selectedObject,
    'rectangle'
  );
  expect(storeState.syncRuntime).toHaveBeenCalledWith({
    browserFrame: storeState.browserFrame,
    cropSelection: { height: 10, left: 0, top: 0, width: 10 },
    frame: storeState.frame,
    history: { canRedo: true, canUndo: true, index: 2, size: 5 },
    layers: [{ id: 'layer-1' }],
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectHeight: 80,
      selectedObjectId: 'object-1',
      selectedObjectIds: ['object-1'],
      selectedObjectLabel: null,
      selectedObjectLocked: false,
      selectedObjectType: 'rectangle',
      selectedObjectWidth: 120,
    },
    viewport,
  });
  expect(storeState.setCropReady).toHaveBeenCalledWith(true);
});

it('syncs the selected rich shape source label for toolbar and inspector metadata', () => {
  mocks.getSingleSelectionTypeMock.mockReturnValueOnce('rich-shape');
  const selectedObject = {
    sniptaleId: 'rich-1',
    sniptaleRichShape: { shapeKind: 'flowchart-decision', source: { name: 'Condition' } },
    sniptaleType: 'rich-shape',
  };
  const canvas = {
    getActiveObjects: vi.fn(() => [selectedObject]),
  };

  syncEditorRuntimeState(canvas as never, null, null, null, { left: 0, top: 0, zoom: 1 } as never);

  expect(storeState.syncRuntime).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selection: expect.objectContaining({
        selectedObjectLabel: 'Condition',
        selectedObjectType: 'rich-shape',
      }),
    })
  );
});

it('falls back to empty history state and schedules zoom via nested animation frames', () => {
  const callback = vi.fn();
  const requestAnimationFrameMock = vi.fn((frame: FrameRequestCallback) => {
    frame(0);
    return 1;
  });

  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  syncEditorRuntimeState(null, null, null, null, { left: 0, top: 0, zoom: 1 } as never);
  scheduleEditorZoomToFit(callback);

  expect(storeState.syncRuntime).toHaveBeenCalledWith(
    expect.objectContaining({
      history: { canRedo: false, canUndo: false, index: 0, size: 1 },
      selection: {
        hasSelection: false,
        selectedObjectCount: 0,
        selectedObjectHeight: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedObjectLabel: null,
        selectedObjectLocked: false,
        selectedObjectType: 'rectangle',
        selectedObjectWidth: null,
      },
    })
  );
  expect(storeState.setCropReady).toHaveBeenCalledWith(false);
  expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);
  expect(callback).toHaveBeenCalledOnce();

  vi.unstubAllGlobals();
});

it('keeps multi-selection runtime state without single-object details', () => {
  mocks.getSingleSelectionTypeMock.mockReturnValueOnce(null as never);
  const activeObjects = [
    { sniptaleId: 'a', sniptaleType: 'rectangle' },
    { sniptaleId: 'b', sniptaleType: 'ellipse' },
  ];
  const canvas = {
    getActiveObjects: vi.fn(() => activeObjects),
  };

  syncEditorRuntimeState(canvas as never, null, null, null, { left: 1, top: 2, zoom: 3 } as never);

  expect(mocks.syncSelectionToolSettingsFromObjectMock).not.toHaveBeenCalled();
  expect(storeState.syncRuntime).toHaveBeenLastCalledWith(
    expect.objectContaining({
      selection: {
        hasSelection: true,
        selectedObjectCount: 2,
        selectedObjectHeight: null,
        selectedObjectId: null,
        selectedObjectIds: ['a', 'b'],
        selectedObjectLabel: null,
        selectedObjectLocked: false,
        selectedObjectType: null,
        selectedObjectWidth: null,
      },
    })
  );
});
