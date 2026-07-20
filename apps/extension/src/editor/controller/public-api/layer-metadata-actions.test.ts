import { describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  renameEditorLayerById: vi.fn(),
  toggleEditorLayerLockState: vi.fn(),
  toggleEditorLayerVisibility: vi.fn(),
}));

vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  renameEditorLayerById: actionMocks.renameEditorLayerById,
  toggleEditorLayerLockState: actionMocks.toggleEditorLayerLockState,
  toggleEditorLayerVisibility: actionMocks.toggleEditorLayerVisibility,
}));

import {
  renameEditorControllerLayer,
  toggleEditorControllerLayerLock,
  toggleEditorControllerLayerVisibility,
} from './layer-metadata-actions';

function createController() {
  return {
    canvas: { id: 'canvas' },
    commitHistory: vi.fn(),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

function expectSourceBindingsForwarded(
  args: {
    commitHistory: () => void;
    setSource: (source: { id: string }) => void;
    syncRuntimeState: () => void;
  },
  controller: ReturnType<typeof createController>
) {
  args.setSource({ id: 'next-source' });
  args.commitHistory();
  args.syncRuntimeState();

  expect(controller.setSource).toHaveBeenCalledWith({ id: 'next-source' });
  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
}

describe('editor-controller public api layer metadata actions', () => {
  it('forwards rename, visibility, and lock state through source bindings', () => {
    const controller = createController();

    renameEditorControllerLayer(controller as never, 'layer-1', 'Renamed');
    toggleEditorControllerLayerVisibility(controller as never, 'layer-1');
    toggleEditorControllerLayerLock(controller as never, 'layer-1');

    expect(actionMocks.renameEditorLayerById).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        id: 'layer-1',
        name: 'Renamed',
        source: controller.source,
      })
    );
    expect(actionMocks.toggleEditorLayerVisibility).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: controller.canvas, id: 'layer-1' })
    );
    expect(actionMocks.toggleEditorLayerLockState).toHaveBeenCalledWith(
      expect.objectContaining({ canvas: controller.canvas, id: 'layer-1' })
    );

    for (const calls of [
      actionMocks.renameEditorLayerById.mock.calls,
      actionMocks.toggleEditorLayerVisibility.mock.calls,
      actionMocks.toggleEditorLayerLockState.mock.calls,
    ]) {
      const args = calls[0]?.[0];
      if (!args) {
        throw new Error('Expected layer metadata action bindings');
      }

      expectSourceBindingsForwarded(args, controller);
      controller.commitHistory.mockClear();
      controller.setSource.mockClear();
      controller.syncRuntimeState.mockClear();
    }
  });
});
