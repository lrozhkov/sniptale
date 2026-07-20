import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSelectionMock: vi.fn(),
  duplicateSelectionMock: vi.fn(async () => undefined),
  insertEditorImageObjectMock: vi.fn(async () => undefined),
  insertEditorTechnicalDataObjectMock: vi.fn(),
  reorderEditorLayerMock: vi.fn(),
  resizeEditorLayerByIdMock: vi.fn(),
  resizeEditorLayerWithRasterizeMock: vi.fn(),
  selectEditorLayerByIdMock: vi.fn(),
  toggleEditorLayerLockStateMock: vi.fn(),
  toggleEditorLayerVisibilityMock: vi.fn(),
}));

vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  deleteEditorSelection: mocks.deleteSelectionMock,
  duplicateEditorSelection: mocks.duplicateSelectionMock,
  insertEditorImageObject: mocks.insertEditorImageObjectMock,
  insertEditorTechnicalDataObject: mocks.insertEditorTechnicalDataObjectMock,
  reorderEditorLayer: mocks.reorderEditorLayerMock,
  resizeEditorLayerById: mocks.resizeEditorLayerByIdMock,
  selectEditorLayerById: mocks.selectEditorLayerByIdMock,
  toggleEditorLayerLockState: mocks.toggleEditorLayerLockStateMock,
  toggleEditorLayerVisibility: mocks.toggleEditorLayerVisibilityMock,
}));

vi.mock('../layer-effects/raster-mutations/resize', () => ({
  resizeEditorLayerWithRasterize: mocks.resizeEditorLayerWithRasterizeMock,
}));

import {
  deleteEditorControllerSelection,
  duplicateEditorControllerSelection,
  insertEditorControllerImage,
  insertEditorControllerTechnicalData,
  reorderEditorControllerLayer,
  resizeEditorControllerLayer,
  selectEditorControllerLayer,
  toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility,
} from './actions';

function createController() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 1),
    ensureObjectReachable: vi.fn(),
    focusObjectInViewport: vi.fn(),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    lastLayerSelectionAnchorId: 'layer-anchor',
    nextLabelIndex: vi.fn(() => 3),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setLastLayerSelectionAnchorId: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('forwards selection and layer actions into the public action seams', async () => {
  const controller = createController();

  deleteEditorControllerSelection(controller);
  await duplicateEditorControllerSelection(controller);
  reorderEditorControllerLayer(controller, 'dragged', 'target');
  selectEditorControllerLayer(controller, 'layer-1');
  toggleEditorControllerLayerVisibility(controller, 'layer-1');
  toggleEditorControllerLayerLock(controller, 'layer-1');
  resizeEditorControllerLayer(controller, 'layer-1', 10, 20);
  await insertEditorControllerImage(controller, 'data-url', 'Image');
  insertEditorControllerTechnicalData(controller, ['url']);

  expect(mocks.deleteSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas })
  );
  expect(mocks.duplicateSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ nextLabelIndex: expect.any(Function) })
  );
  expect(mocks.reorderEditorLayerMock).toHaveBeenCalledWith(
    expect.objectContaining({ draggedId: 'dragged', targetId: 'target' })
  );
  expect(mocks.selectEditorLayerByIdMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'layer-1' })
  );
  expect(mocks.toggleEditorLayerVisibilityMock).toHaveBeenCalledOnce();
  expect(mocks.toggleEditorLayerLockStateMock).toHaveBeenCalledOnce();
  expect(mocks.resizeEditorLayerWithRasterizeMock).toHaveBeenCalledWith(
    expect.objectContaining({ height: 20, width: 10 })
  );
  expect(mocks.insertEditorImageObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ dataUrl: 'data-url', name: 'Image' })
  );
  expect(mocks.insertEditorTechnicalDataObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ kinds: ['url'] })
  );
});
