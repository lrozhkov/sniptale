import { beforeEach, expect, it, vi } from 'vitest';
const actionMocks = vi.hoisted(() => ({
  deleteEditorSelectionMock: vi.fn(),
  duplicateEditorSelectionMock: vi.fn(),
  renameEditorLayerByIdMock: vi.fn(),
  reorderEditorLayerMock: vi.fn(),
  resizeEditorLayerByIdMock: vi.fn(),
  selectEditorLayerByIdMock: vi.fn(),
  toggleEditorLayerLockStateMock: vi.fn(),
  toggleEditorLayerVisibilityMock: vi.fn(),
}));
const mutationMocks = vi.hoisted(() => ({
  applyEditorLayerRasterEffectMock: vi.fn(),
  applyEditorLayerTransformationMock: vi.fn(),
  mergeEditorSelectedLayersMock: vi.fn(),
  removeEditorLayerRasterEffectMock: vi.fn(),
  resizeEditorLayerWithRasterizeMock: vi.fn(),
  updateEditorLayerRasterEffectMock: vi.fn(),
}));
vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  deleteEditorSelection: actionMocks.deleteEditorSelectionMock,
  duplicateEditorSelection: actionMocks.duplicateEditorSelectionMock,
  renameEditorLayerById: actionMocks.renameEditorLayerByIdMock,
  reorderEditorLayer: actionMocks.reorderEditorLayerMock,
  resizeEditorLayerById: actionMocks.resizeEditorLayerByIdMock,
  selectEditorLayerById: actionMocks.selectEditorLayerByIdMock,
  toggleEditorLayerLockState: actionMocks.toggleEditorLayerLockStateMock,
  toggleEditorLayerVisibility: actionMocks.toggleEditorLayerVisibilityMock,
}));
vi.mock('../layer-effects/merge', () => ({
  mergeEditorSelectedLayers: mutationMocks.mergeEditorSelectedLayersMock,
}));
vi.mock('../layer-effects/raster-mutations/effects', () => ({
  applyEditorLayerRasterEffect: mutationMocks.applyEditorLayerRasterEffectMock,
  previewEditorLayerRasterEffect: vi.fn(),
  removeEditorLayerRasterEffect: mutationMocks.removeEditorLayerRasterEffectMock,
  resetEditorLayerRasterEffectPreview: vi.fn(),
  updateEditorLayerRasterEffect: mutationMocks.updateEditorLayerRasterEffectMock,
}));
vi.mock('../layer-effects/raster-mutations/resize', () => ({
  resizeEditorLayerWithRasterize: mutationMocks.resizeEditorLayerWithRasterizeMock,
}));
vi.mock('../layer-effects/raster-mutations/transform', () => ({
  applyEditorLayerTransformation: mutationMocks.applyEditorLayerTransformationMock,
}));
import {
  applyEditorControllerLayerEffect,
  applyEditorControllerLayerTransformation,
  deleteEditorControllerSelection,
  duplicateEditorControllerSelection,
  mergeEditorControllerSelectedLayers,
  removeEditorControllerLayerEffect,
  renameEditorControllerLayer,
  reorderEditorControllerLayer,
  resizeEditorControllerLayer,
  selectEditorControllerLayer,
  toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility,
  updateEditorControllerLayerEffect,
} from './layer-actions';

function createController() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    createLayerMutationToken: vi.fn(() => 2),
    ensureObjectReachable: vi.fn(),
    focusObjectInViewport: vi.fn(),
    isLayerMutationTokenCurrent: vi.fn(() => true),
    lastLayerSelectionAnchorId: 'layer-anchor',
    nextLabelIndex: vi.fn(() => 1),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setLastLayerSelectionAnchorId: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}
type LayerActionController = ReturnType<typeof createController>;
function resetControllerSpies(controller: LayerActionController) {
  controller.commitHistory.mockClear();
  controller.createLayerMutationToken.mockClear();
  controller.ensureObjectReachable.mockClear();
  controller.focusObjectInViewport.mockClear();
  controller.isLayerMutationTokenCurrent.mockClear();
  controller.prepareObject.mockClear();
  controller.sendFrameObjectsToBack.mockClear();
  controller.setLastLayerSelectionAnchorId.mockClear();
  controller.setSource.mockClear();
  controller.syncRuntimeState.mockClear();
}

function invokeActionHistoryHandlers(
  handlers: {
    commitHistory?: () => void;
    syncRuntimeState?: () => void;
  },
  controller: LayerActionController
) {
  handlers.commitHistory?.();
  handlers.syncRuntimeState?.();

  expect(controller.commitHistory).toHaveBeenCalled();
  expect(controller.syncRuntimeState).toHaveBeenCalled();
}

function invokeSelectionHandlers(
  handlers: {
    commitHistory: () => void;
    ensureObjectReachable: (object: { sniptaleId: string }) => void;
    focusObjectInViewport: (object: { sniptaleId: string }) => void;
    syncRuntimeState: () => void;
  },
  controller: LayerActionController
) {
  const object = { sniptaleId: 'layer-1' };

  handlers.ensureObjectReachable(object);
  handlers.focusObjectInViewport(object);
  invokeActionHistoryHandlers(handlers, controller);

  expect(controller.ensureObjectReachable).toHaveBeenCalledWith(object);
  expect(controller.focusObjectInViewport).toHaveBeenCalledWith(object);
}

function invokeMutationHandlers(
  handlers: {
    commitHistory: () => void;
    createLayerMutationToken?: () => number;
    isLayerMutationTokenCurrent?: (token: number) => boolean;
    prepareObject?: (object: { sniptaleId: string }) => void;
    sendFrameObjectsToBack?: () => void;
    setSource?: (source: { id: string }) => void;
    syncRuntimeState: () => void;
  },
  controller: LayerActionController
) {
  const object = { sniptaleId: 'layer-1' };
  const source = { id: 'next-source' };

  handlers.prepareObject?.(object);
  handlers.sendFrameObjectsToBack?.();
  handlers.setSource?.(source);
  invokeActionHistoryHandlers(handlers, controller);

  if (handlers.createLayerMutationToken) {
    expect(handlers.createLayerMutationToken()).toBe(2);
  }

  if (handlers.isLayerMutationTokenCurrent) {
    expect(handlers.isLayerMutationTokenCurrent(2)).toBe(true);
  }

  if (handlers.prepareObject) {
    expect(controller.prepareObject).toHaveBeenCalledWith(object);
  } else {
    expect(controller.prepareObject).not.toHaveBeenCalled();
  }
  if (handlers.setSource) {
    expect(controller.setSource).toHaveBeenCalledWith(source);
  } else {
    expect(controller.setSource).not.toHaveBeenCalled();
  }
  if (handlers.sendFrameObjectsToBack) {
    expect(controller.sendFrameObjectsToBack).toHaveBeenCalled();
  } else {
    expect(controller.sendFrameObjectsToBack).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mutationMocks.applyEditorLayerRasterEffectMock.mockResolvedValue(undefined);
  mutationMocks.applyEditorLayerTransformationMock.mockResolvedValue(undefined);
  mutationMocks.mergeEditorSelectedLayersMock.mockResolvedValue(undefined);
  mutationMocks.resizeEditorLayerWithRasterizeMock.mockResolvedValue(undefined);
  mutationMocks.updateEditorLayerRasterEffectMock.mockResolvedValue(undefined);
});

it('forwards basic selection and reorder actions into the action seams', async () => {
  const controller = createController();

  deleteEditorControllerSelection(controller as never);
  await duplicateEditorControllerSelection(controller as never);
  reorderEditorControllerLayer(controller as never, 'dragged', 'target');
  selectEditorControllerLayer(controller as never, 'layer-1', { additive: true, toggle: true });

  const deleteHandlers = actionMocks.deleteEditorSelectionMock.mock.calls[0]?.[0];
  const duplicateHandlers = actionMocks.duplicateEditorSelectionMock.mock.calls[0]?.[0];
  const reorderHandlers = actionMocks.reorderEditorLayerMock.mock.calls[0]?.[0];
  const selectionHandlers = actionMocks.selectEditorLayerByIdMock.mock.calls[0]?.[0];

  expect(actionMocks.deleteEditorSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas })
  );
  expect(actionMocks.duplicateEditorSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas, prepareObject: expect.any(Function) })
  );
  expect(actionMocks.reorderEditorLayerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas: controller.canvas,
      draggedId: 'dragged',
      targetId: 'target',
    })
  );
  expect(actionMocks.selectEditorLayerByIdMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canvas: controller.canvas,
      selectionOptions: expect.objectContaining({
        additive: true,
        anchorId: 'layer-anchor',
        toggle: true,
      }),
    })
  );
  expect(controller.setLastLayerSelectionAnchorId).toHaveBeenCalledWith('layer-1');

  invokeActionHistoryHandlers(deleteHandlers, controller);
  duplicateHandlers.prepareObject({ sniptaleId: 'duplicate-layer' });
  invokeActionHistoryHandlers(duplicateHandlers, controller);
  expect(duplicateHandlers.nextLabelIndex('image')).toBe(1);
  expect(controller.prepareObject).toHaveBeenCalledWith({ sniptaleId: 'duplicate-layer' });
  reorderHandlers.sendFrameObjectsToBack();
  invokeActionHistoryHandlers(reorderHandlers, controller);
  expect(controller.sendFrameObjectsToBack).toHaveBeenCalledOnce();
  invokeSelectionHandlers(selectionHandlers, controller);
});

it('forwards rename and visibility mutations into the action seams', () => {
  const controller = createController();

  renameEditorControllerLayer(controller as never, 'layer-1', 'Renamed');
  toggleEditorControllerLayerVisibility(controller as never, 'layer-1');
  toggleEditorControllerLayerLock(controller as never, 'layer-1');

  const renameHandlers = actionMocks.renameEditorLayerByIdMock.mock.calls[0]?.[0];
  const visibilityHandlers = actionMocks.toggleEditorLayerVisibilityMock.mock.calls[0]?.[0];
  const lockHandlers = actionMocks.toggleEditorLayerLockStateMock.mock.calls[0]?.[0];

  expect(actionMocks.renameEditorLayerByIdMock).toHaveBeenCalled();
  expect(actionMocks.toggleEditorLayerVisibilityMock).toHaveBeenCalled();
  expect(actionMocks.toggleEditorLayerLockStateMock).toHaveBeenCalled();

  renameHandlers.setSource({ id: 'renamed-source' });
  invokeActionHistoryHandlers(renameHandlers, controller);
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'renamed-source' });

  vi.clearAllMocks();
  invokeMutationHandlers(visibilityHandlers, controller);

  vi.clearAllMocks();
  invokeMutationHandlers(lockHandlers, controller);
});

it('forwards layer-effect mutations into the raster mutation seam', async () => {
  const controller = createController();

  await resizeEditorControllerLayer(controller as never, 'layer-1', 320, 180);
  await mergeEditorControllerSelectedLayers(controller as never);
  await applyEditorControllerLayerEffect(controller as never, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  await updateEditorControllerLayerEffect(controller as never, 'layer-1', {
    amount: 0.4,
    enabled: true,
    id: 'brightness',
  });
  removeEditorControllerLayerEffect(controller as never, 'layer-1', 'brightness');
  await applyEditorControllerLayerTransformation(controller as never, 'layer-1', 'rotate-right');

  expect(mutationMocks.resizeEditorLayerWithRasterizeMock).toHaveBeenCalled();
  expect(mutationMocks.mergeEditorSelectedLayersMock).toHaveBeenCalled();
  expect(mutationMocks.applyEditorLayerRasterEffectMock).toHaveBeenCalled();
  expect(mutationMocks.updateEditorLayerRasterEffectMock).toHaveBeenCalled();
  expect(mutationMocks.removeEditorLayerRasterEffectMock).toHaveBeenCalled();
  const resizeHandlers = mutationMocks.resizeEditorLayerWithRasterizeMock.mock.calls[0]?.[0];
  const mergeHandlers = mutationMocks.mergeEditorSelectedLayersMock.mock.calls[0]?.[0];
  const applyHandlers = mutationMocks.applyEditorLayerRasterEffectMock.mock.calls[0]?.[0];
  const updateHandlers = mutationMocks.updateEditorLayerRasterEffectMock.mock.calls[0]?.[0];
  const removeHandlers = mutationMocks.removeEditorLayerRasterEffectMock.mock.calls[0]?.[0];
  const transformHandlers = mutationMocks.applyEditorLayerTransformationMock.mock.calls[0]?.[0];

  invokeMutationHandlers(resizeHandlers, controller);
  resetControllerSpies(controller);
  invokeMutationHandlers(mergeHandlers, controller);
  resetControllerSpies(controller);
  expect(applyHandlers.effect).toEqual({ amount: 0.4, enabled: true, id: 'brightness' });
  invokeMutationHandlers(applyHandlers, controller);
  resetControllerSpies(controller);
  invokeMutationHandlers(updateHandlers, controller);
  resetControllerSpies(controller);
  invokeMutationHandlers(removeHandlers, controller);
  resetControllerSpies(controller);
  invokeMutationHandlers(transformHandlers, controller);
});
