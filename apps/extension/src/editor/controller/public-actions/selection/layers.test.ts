/* eslint-disable max-lines-per-function -- layer public action coverage keeps related paths together */
import type { Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  reorderLayerObjectsMock: vi.fn(),
  resizeLayerObjectMock: vi.fn(),
  selectLayerObjectMock: vi.fn(),
  syncSourceStateFromObjectMock: vi.fn(),
  toggleLayerLockMock: vi.fn(),
  toggleLayerVisibilityMock: vi.fn(),
}));

vi.mock('../../layer-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../layer-actions')>()),
  reorderLayerObjects: mocks.reorderLayerObjectsMock,
  resizeLayerObject: mocks.resizeLayerObjectMock,
  selectLayerObject: mocks.selectLayerObjectMock,
  toggleLayerLock: mocks.toggleLayerLockMock,
  toggleLayerVisibility: mocks.toggleLayerVisibilityMock,
}));

vi.mock('../../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));

import {
  renameEditorLayerById,
  reorderEditorLayer,
  resizeEditorLayerById,
  selectEditorLayerById,
  toggleEditorLayerLockState,
  toggleEditorLayerVisibility,
} from './layers';

type SelectionActionsCanvas = Canvas & {
  requestRenderAll: ReturnType<typeof vi.fn>;
};

function createCanvas(): SelectionActionsCanvas {
  return {
    requestRenderAll: vi.fn(),
  } as unknown as SelectionActionsCanvas;
}

function createSyncOptions() {
  return {
    commitHistory: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' } as never,
    syncRuntimeState: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.syncSourceStateFromObjectMock.mockReturnValue({ id: 'next-source' });
});

function runReorderSuite() {
  it('reorders a layer and syncs history only when the reorder succeeds', () => {
    const canvas = createCanvas();
    const sendFrameObjectsToBack = vi.fn();
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.reorderLayerObjectsMock.mockReturnValueOnce(false).mockReturnValueOnce(true);

    reorderEditorLayer({
      canvas,
      draggedId: 'dragged',
      targetId: 'target',
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });
    expect(sendFrameObjectsToBack).not.toHaveBeenCalled();

    reorderEditorLayer({
      canvas,
      draggedId: 'dragged',
      targetId: 'target',
      sendFrameObjectsToBack,
      commitHistory,
      syncRuntimeState,
    });
    expect(sendFrameObjectsToBack).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runSelectSuite() {
  it('selects a layer and commits history only when recovery changed the scene', () => {
    const canvas = createCanvas();
    const ensureObjectReachable = vi.fn();
    const focusObjectInViewport = vi.fn();
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.selectLayerObjectMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    selectEditorLayerById({
      canvas,
      id: 'layer-1',
      selectionOptions: { focusViewport: false, toggle: true },
      ensureObjectReachable,
      focusObjectInViewport,
      commitHistory,
      syncRuntimeState,
    });
    expect(commitHistory).not.toHaveBeenCalled();
    expect(syncRuntimeState).not.toHaveBeenCalled();

    selectEditorLayerById({
      canvas,
      id: 'layer-1',
      ensureObjectReachable,
      focusObjectInViewport,
      commitHistory,
      syncRuntimeState,
    });
    expect(commitHistory).not.toHaveBeenCalled();
    expect(syncRuntimeState).toHaveBeenCalledOnce();

    selectEditorLayerById({
      canvas,
      id: 'layer-1',
      ensureObjectReachable,
      focusObjectInViewport,
      commitHistory,
      syncRuntimeState,
    });
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledTimes(2);
    expect(mocks.selectLayerObjectMock).toHaveBeenNthCalledWith(
      1,
      canvas,
      'layer-1',
      { focusViewport: false, toggle: true },
      ensureObjectReachable,
      focusObjectInViewport
    );
  });
}

function runVisibilityAndLockSuite() {
  it('updates source snapshots for visibility and lock mutations when an object changes', () => {
    const options = createSyncOptions();
    const object = { id: 'layer-object' } as never;
    const prepareObject = vi.fn();
    mocks.toggleLayerVisibilityMock.mockReturnValueOnce(null).mockReturnValueOnce(object);
    mocks.toggleLayerLockMock.mockReturnValue(object);

    toggleEditorLayerVisibility({
      canvas: createCanvas(),
      id: 'layer-1',
      ...options,
    });
    expect(options.setSource).not.toHaveBeenCalled();

    toggleEditorLayerVisibility({
      canvas: createCanvas(),
      id: 'layer-1',
      ...options,
    });
    toggleEditorLayerLockState({
      canvas: createCanvas(),
      id: 'layer-1',
      prepareObject,
      ...options,
    });

    expect(options.setSource).toHaveBeenNthCalledWith(1, { id: 'next-source' });
    expect(options.setSource).toHaveBeenNthCalledWith(2, { id: 'next-source' });
    expect(options.commitHistory).toHaveBeenCalledTimes(2);
    expect(options.syncRuntimeState).toHaveBeenCalledTimes(2);
  });
}

function runResizeSuite() {
  it('updates source snapshots after layer resize only when resize succeeds', () => {
    const options = createSyncOptions();
    const ensureObjectReachable = vi.fn();
    const object = { id: 'layer-object' } as never;
    mocks.resizeLayerObjectMock.mockReturnValueOnce(null).mockReturnValueOnce(object);

    resizeEditorLayerById({
      canvas: createCanvas(),
      id: 'layer-1',
      width: 120,
      height: 80,
      ensureObjectReachable,
      ...options,
    });
    resizeEditorLayerById({
      canvas: createCanvas(),
      id: 'layer-1',
      width: 120,
      height: 80,
      ensureObjectReachable,
      ...options,
    });

    expect(options.setSource).toHaveBeenCalledOnce();
    expect(options.commitHistory).toHaveBeenCalledOnce();
    expect(options.syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function runRenameSuite() {
  it('renames layers only when the next label is meaningful and changed', () => {
    const commitHistory = vi.fn();
    const setSource = vi.fn();
    const syncRuntimeState = vi.fn();
    const object = { sniptaleLabel: 'Layer 1' } as never;
    mocks.syncSourceStateFromObjectMock.mockReturnValue({ id: 'renamed-source' });

    renameEditorLayerById({
      canvas: null,
      commitHistory,
      id: 'layer-1',
      name: '  ',
      setSource,
      source: { id: 'source' } as never,
      syncRuntimeState,
    });
    renameEditorLayerById({
      canvas: { getObjects: () => [object] } as never,
      commitHistory,
      id: 'layer-1',
      name: 'Layer 1',
      setSource,
      source: { id: 'source' } as never,
      syncRuntimeState,
    });
    renameEditorLayerById({
      canvas: {
        getObjects: () => [{ sniptaleId: 'layer-1', sniptaleLabel: 'Layer 1' }],
      } as never,
      commitHistory,
      id: 'layer-1',
      name: '  Renamed  ',
      setSource,
      source: { id: 'source' } as never,
      syncRuntimeState,
    });
    renameEditorLayerById({
      canvas: {
        getObjects: () => [{ sniptaleId: 'locked', sniptaleLabel: 'Locked', sniptaleLocked: true }],
      } as never,
      commitHistory,
      id: 'locked',
      name: 'Renamed Locked',
      setSource,
      source: { id: 'source' } as never,
      syncRuntimeState,
    });

    expect(setSource).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

describe('editor-controller-public-actions-selection.layers', () => {
  runReorderSuite();
  runSelectSuite();
  runVisibilityAndLockSuite();
  runResizeSuite();
  runRenameSuite();
});
