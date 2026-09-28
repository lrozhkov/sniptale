// @vitest-environment jsdom

import { Rect, type Canvas } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findObjectByIdMock: vi.fn(),
  reorderLayerObjectsMock: vi.fn(),
  resizeLayerObjectMock: vi.fn(),
  selectLayerObjectMock: vi.fn(),
  syncSourceStateFromObjectMock: vi.fn(() => ({ id: 'next-source' })),
  toggleLayerVisibilityMock: vi.fn(),
}));

vi.mock('../../../layer-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../layer-actions')>()),
  reorderLayerObjects: mocks.reorderLayerObjectsMock,
  resizeLayerObject: mocks.resizeLayerObjectMock,
  selectLayerObject: mocks.selectLayerObjectMock,
  toggleLayerVisibility: mocks.toggleLayerVisibilityMock,
}));

vi.mock('../../../document/layers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/layers')>()),
  findObjectById: mocks.findObjectByIdMock,
}));

vi.mock('../../../document/source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../document/source')>()),
  syncSourceStateFromObject: mocks.syncSourceStateFromObjectMock,
}));

import { renameEditorLayerById } from './rename';
import { reorderEditorLayer } from './reorder';
import { selectEditorLayerById } from './select';
import { EditorCanvas } from '../../../viewport/render-region';
import { resizeEditorLayerById, toggleEditorLayerVisibility } from './source-mutations';

function createSyncOptions() {
  return {
    commitHistory: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' } as never,
    syncRuntimeState: vi.fn(),
  };
}

function registerReorderAndSelectTest() {
  it('keeps reorder and select side effects owned by their action roles', () => {
    const canvas = { requestRenderAll: vi.fn() } as unknown as Canvas;
    const sendFrameObjectsToBack = vi.fn();
    const syncRuntimeState = vi.fn();
    const commitHistory = vi.fn();
    mocks.reorderLayerObjectsMock.mockReturnValue(true);
    mocks.selectLayerObjectMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    reorderEditorLayer({
      canvas,
      commitHistory,
      draggedId: 'a',
      sendFrameObjectsToBack,
      syncRuntimeState,
      targetId: 'b',
    });
    const selectionOptions = {
      canvas,
      commitHistory,
      ensureObjectReachable: vi.fn(),
      focusObjectInViewport: vi.fn(),
      id: 'a',
      syncRuntimeState,
    };
    expect(selectEditorLayerById(selectionOptions)).toBe(false);
    expect(selectEditorLayerById(selectionOptions)).toBe(true);
    expect(selectEditorLayerById(selectionOptions)).toBe(true);

    expect(sendFrameObjectsToBack).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledTimes(2);
    expect(syncRuntimeState).toHaveBeenCalledTimes(3);
  });

  it('keeps selected-layer priority aligned with the editor canvas selection', () => {
    const canvas = new EditorCanvas(document.createElement('canvas'));
    const object = new Rect({ width: 20, height: 20 });
    canvas.add(object);
    canvas.setActiveObject(object);
    const setPriority = vi.spyOn(canvas, 'setLayerSelectionPriority');
    mocks.selectLayerObjectMock.mockReturnValue(false);
    const options = {
      canvas,
      commitHistory: vi.fn(),
      ensureObjectReachable: vi.fn(),
      focusObjectInViewport: vi.fn(),
      id: 'a',
      syncRuntimeState: vi.fn(),
    };

    selectEditorLayerById(options);
    expect(setPriority).toHaveBeenCalledWith(object);

    canvas.discardActiveObject();
    selectEditorLayerById(options);
    expect(setPriority).toHaveBeenLastCalledWith(null);
    canvas.dispose();
  });
}

function registerSourceMutationTest() {
  it('syncs source-backed layer mutations only after an object changes', () => {
    const options = createSyncOptions();
    const object = { sniptaleId: 'layer-1' } as never;
    mocks.toggleLayerVisibilityMock.mockReturnValueOnce(null).mockReturnValueOnce(object);
    mocks.resizeLayerObjectMock.mockReturnValue(object);

    toggleEditorLayerVisibility({ canvas: null, id: 'layer-1', ...options });
    toggleEditorLayerVisibility({ canvas: null, id: 'layer-1', ...options });
    resizeEditorLayerById({
      canvas: null,
      ensureObjectReachable: vi.fn(),
      height: 80,
      id: 'layer-1',
      width: 120,
      ...options,
    });

    expect(options.setSource).toHaveBeenCalledTimes(2);
    expect(options.commitHistory).toHaveBeenCalledTimes(2);
    expect(options.syncRuntimeState).toHaveBeenCalledTimes(2);
  });
}

function registerRenameTest() {
  it('keeps rename validation separate from source mutation helpers', () => {
    const options = createSyncOptions();
    const object = { sniptaleId: 'layer-1', sniptaleLabel: 'Layer 1' };
    mocks.findObjectByIdMock.mockReturnValue(object);

    renameEditorLayerById({ canvas: null, id: 'layer-1', name: '  Renamed  ', ...options });

    expect(object.sniptaleLabel).toBe('Renamed');
    expect(options.setSource).toHaveBeenCalledWith({ id: 'next-source' });
    expect(options.commitHistory).toHaveBeenCalledOnce();
  });
}

describe('selection layer public action role owners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.syncSourceStateFromObjectMock.mockReturnValue({ id: 'next-source' });
  });

  registerReorderAndSelectTest();
  registerSourceMutationTest();
  registerRenameTest();
});
