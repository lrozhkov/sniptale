import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSelectionMock: vi.fn(),
  duplicateSelectionMock: vi.fn(async () => undefined),
  insertEditorImageObjectMock: vi.fn(async () => undefined),
  insertEditorTechnicalDataObjectMock: vi.fn(),
  nudgeSelectionMock: vi.fn(() => true),
  reorderEditorLayerMock: vi.fn(),
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
  nudgeEditorSelection: mocks.nudgeSelectionMock,
  reorderEditorLayer: mocks.reorderEditorLayerMock,
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
  nudgeEditorControllerSelection,
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
    createLayerMutationToken: vi.fn(() => 7),
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

function expectMockArgs<T>(calls: T[][], index: number, label: string): T {
  const call = calls[index];
  const args = call?.[0];
  if (!args) {
    throw new Error(`Expected ${label}`);
  }

  return args;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function registerDeleteAndDuplicateCallbackTest() {
  it('forwards delete, duplicate, and nudge callbacks', async () => {
    const controller = createController();

    deleteEditorControllerSelection(controller);
    await duplicateEditorControllerSelection(controller);
    expect(
      nudgeEditorControllerSelection(controller, {
        deltaX: 1,
        deltaY: -1,
      })
    ).toBe(true);

    const deleteArgs = expectMockArgs(
      mocks.deleteSelectionMock.mock.calls as any[][],
      0,
      'delete args'
    );
    deleteArgs.commitHistory();
    deleteArgs.syncRuntimeState();

    const duplicateArgs = expectMockArgs(
      mocks.duplicateSelectionMock.mock.calls as any[][],
      0,
      'duplicate args'
    );
    duplicateArgs.prepareObject({ id: 'duplicate' });
    expect(duplicateArgs.nextLabelIndex('text')).toBe(3);
    duplicateArgs.commitHistory();
    duplicateArgs.syncRuntimeState();

    expect(controller.commitHistory).toHaveBeenCalledTimes(2);
    expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
    expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'duplicate' });

    const nudgeArgs = expectMockArgs(
      mocks.nudgeSelectionMock.mock.calls as any[][],
      0,
      'nudge args'
    );
    nudgeArgs.setSource({ id: 'nudge-source' });
    nudgeArgs.ensureObjectReachable({ id: 'object' });
    nudgeArgs.syncRuntimeState();

    expect(controller.setSource).toHaveBeenCalledWith({ id: 'nudge-source' });
    expect(controller.ensureObjectReachable).toHaveBeenCalledWith({ id: 'object' });
    expect(controller.syncRuntimeState).toHaveBeenCalledTimes(3);
  });
}

function registerSelectionCallbackTest() {
  it('forwards layer selection focus callbacks', () => {
    const controller = createController();

    selectEditorControllerLayer(controller, 'layer-1');

    const selectArgs = expectMockArgs(
      mocks.selectEditorLayerByIdMock.mock.calls as any[][],
      0,
      'layer selection args'
    );
    selectArgs.ensureObjectReachable({ id: 'selected' });
    selectArgs.focusObjectInViewport({ id: 'selected' });
    selectArgs.commitHistory();
    selectArgs.syncRuntimeState();

    expect(controller.setLastLayerSelectionAnchorId).toHaveBeenCalledWith('layer-1');
    expect(controller.commitHistory).toHaveBeenCalledOnce();
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
    expect(controller.focusObjectInViewport).toHaveBeenCalledWith({ id: 'selected' });
    expect(controller.ensureObjectReachable).toHaveBeenCalledWith({ id: 'selected' });
  });
}

function expectLayerMutationCallbacksForwarded(controller: ReturnType<typeof createController>) {
  const reorderArgs = expectMockArgs(
    mocks.reorderEditorLayerMock.mock.calls as any[][],
    0,
    'reorder args'
  );
  reorderArgs.sendFrameObjectsToBack();
  reorderArgs.commitHistory();
  reorderArgs.syncRuntimeState();

  const visibilityArgs = expectMockArgs(
    mocks.toggleEditorLayerVisibilityMock.mock.calls as any[][],
    0,
    'visibility args'
  );
  visibilityArgs.setSource({ id: 'visibility-source' });
  visibilityArgs.commitHistory();
  visibilityArgs.syncRuntimeState();

  const lockArgs = expectMockArgs(
    mocks.toggleEditorLayerLockStateMock.mock.calls as any[][],
    0,
    'lock args'
  );
  lockArgs.setSource({ id: 'lock-source' });
  lockArgs.prepareObject({ id: 'lock-object' });
  lockArgs.commitHistory();
  lockArgs.syncRuntimeState();

  expectResizeLayerMutationCallbacksForwarded(controller);
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'visibility-source' });
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'lock-source' });
  expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'lock-object' });
}

function expectResizeLayerMutationCallbacksForwarded(
  controller: ReturnType<typeof createController>
) {
  const resizeArgs = expectMockArgs(
    mocks.resizeEditorLayerWithRasterizeMock.mock.calls as any[][],
    0,
    'resize args'
  );
  resizeArgs.setSource({ id: 'resize-source' });
  resizeArgs.prepareObject({ id: 'resize-object' });
  resizeArgs.sendFrameObjectsToBack();
  expect(resizeArgs.createLayerMutationToken()).toBe(7);
  expect(resizeArgs.isLayerMutationTokenCurrent(7)).toBe(true);
  resizeArgs.commitHistory();
  resizeArgs.syncRuntimeState();

  expect(controller.sendFrameObjectsToBack).toHaveBeenCalledTimes(2);
  expect(controller.setSource).toHaveBeenCalledWith({ id: 'resize-source' });
  expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'resize-object' });
  expect(controller.commitHistory).toHaveBeenCalledTimes(4);
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(4);
}

function registerLayerMutationCallbackTest() {
  it('forwards layer mutation callbacks', () => {
    const controller = createController();

    reorderEditorControllerLayer(controller, 'dragged', 'target');
    toggleEditorControllerLayerVisibility(controller, 'layer-1');
    toggleEditorControllerLayerLock(controller, 'layer-1');
    resizeEditorControllerLayer(controller, 'layer-1', 10, 20);

    expectLayerMutationCallbacksForwarded(controller);
  });
}

function registerInsertionCallbackTest() {
  it('forwards image and technical-data insertion callbacks', async () => {
    const controller = createController();

    await insertEditorControllerImage(controller, 'data-url', 'Image');
    insertEditorControllerTechnicalData(controller, ['url']);

    const imageArgs = expectMockArgs(
      mocks.insertEditorImageObjectMock.mock.calls as any[][],
      0,
      'image args'
    );
    imageArgs.prepareObject({ id: 'image-object' });
    expect(imageArgs.nextLabelIndex()).toBe(3);
    imageArgs.commitHistory();
    imageArgs.syncRuntimeState();

    const metaArgs = expectMockArgs(
      mocks.insertEditorTechnicalDataObjectMock.mock.calls as any[][],
      0,
      'meta args'
    );
    metaArgs.prepareObject({ id: 'meta-object' });
    expect(metaArgs.nextLabelIndex()).toBe(3);
    metaArgs.commitHistory();
    metaArgs.syncRuntimeState();

    expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'image-object' });
    expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'meta-object' });
    expect(controller.commitHistory).toHaveBeenCalledTimes(2);
    expect(controller.syncRuntimeState).toHaveBeenCalledTimes(2);
  });
}

function runActionCallbackBridgeSuite() {
  registerDeleteAndDuplicateCallbackTest();
  registerSelectionCallbackTest();
  registerLayerMutationCallbackTest();
  registerInsertionCallbackTest();
}

describe('public-api action callback bridges', runActionCallbackBridgeSuite);
