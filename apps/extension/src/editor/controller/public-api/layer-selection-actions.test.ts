import { describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
  nudgeEditorSelectionMock: vi.fn(() => true),
  selectEditorLayerByIdMock: vi.fn(() => true),
}));

vi.mock('../public-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../public-actions')>()),
  nudgeEditorSelection: actionMocks.nudgeEditorSelectionMock,
  selectEditorLayerById: actionMocks.selectEditorLayerByIdMock,
}));

import {
  nudgeEditorControllerSelection,
  selectEditorControllerLayer,
} from './layer-selection-actions';

function createController() {
  return {
    canvas: { id: 'canvas' },
    ensureObjectReachable: vi.fn(),
    setSource: vi.fn(),
    source: { id: 'source' },
    syncRuntimeState: vi.fn(),
  };
}

describe('editor-controller public api layer selection actions', () => {
  it('switches to the cursor only after a layer is successfully selected', () => {
    const controller = {
      ...createController(),
      activeTool: 'shape',
      lastLayerSelectionAnchorId: null,
      setLastLayerSelectionAnchorId: vi.fn(),
      switchToSelectTool: vi.fn(),
    };

    actionMocks.selectEditorLayerByIdMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
    selectEditorControllerLayer(controller as never, 'missing-layer');
    expect(controller.switchToSelectTool).not.toHaveBeenCalled();

    selectEditorControllerLayer(controller as never, 'layer-1');
    expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
    expect(controller.setLastLayerSelectionAnchorId).toHaveBeenCalledWith('layer-1');
  });

  it('forwards selection nudge callbacks into the action seam', () => {
    const controller = createController();

    expect(nudgeEditorControllerSelection(controller as never, { deltaX: 1, deltaY: -1 })).toBe(
      true
    );

    const nudgeHandlers = (actionMocks.nudgeEditorSelectionMock.mock.calls as any[][])[0]?.[0] as {
      ensureObjectReachable: (object: { sniptaleId: string }) => void;
      setSource: (source: { id: string }) => void;
      syncRuntimeState: () => void;
    };

    nudgeHandlers.setSource({ id: 'nudged-source' });
    nudgeHandlers.ensureObjectReachable({ sniptaleId: 'nudged-layer' });
    nudgeHandlers.syncRuntimeState();

    expect(controller.setSource).toHaveBeenCalledWith({ id: 'nudged-source' });
    expect(controller.ensureObjectReachable).toHaveBeenCalledWith({ sniptaleId: 'nudged-layer' });
    expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
  });
});
