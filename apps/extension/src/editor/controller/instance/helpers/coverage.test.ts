/* eslint-disable max-lines-per-function */
import { describe, expect, it, vi } from 'vitest';

const storeState = {
  workspace: {
    backgroundColor: '#ffffff',
    gridColor: '#d1d5db',
    gridEnabled: true,
    gridSize: 24,
    gridSnapEnabled: true,
    magnetEnabled: false,
  },
};

const mocks = vi.hoisted(() => ({
  addObjectMock: vi.fn(),
  advanceStepMock: vi.fn(),
  applyDocumentMock: vi.fn(),
  applyGridSnapMock: vi.fn(),
  buildViewportStateMock: vi.fn(() => ({ zoom: 2 })),
  cancelInteractionMock: vi.fn(() => ({ changed: true, drawSession: { id: 'draw' } })),
  createHistoryMock: vi.fn((document) => ({ seed: document })),
  decorateShapeMock: vi.fn(),
  ensureBrowserFrameOnTopMock: vi.fn(),
  ensureObjectReachableMock: vi.fn(() => true),
  ensureObjectsReachableMock: vi.fn(() => true),
  focusObjectMock: vi.fn(),
  getActiveCropRectMock: vi.fn(() => ({ id: 'crop' })),
  getNextLabelIndexMock: vi.fn(() => 7),
  logBrowserFrameMock: vi.fn(),
  moveSelectionMock: vi.fn(),
  moveSelectionToEdgeMock: vi.fn(),
  prepareObjectMock: vi.fn(),
  rebuildFrameDecorationsMock: vi.fn(),
  relayoutSceneMock: vi.fn(() => ({
    canvasSize: { width: 90, height: 40 },
    source: { id: 'source' },
  })),
  scheduleViewportSyncMock: vi.fn(),
  sendFrameObjectsToBackMock: vi.fn(),
  startDrawSessionMock: vi.fn(() => ({
    cropGuide: null,
    cropSelection: null,
    drawSession: { id: 'session' },
  })),
  storeGetStateMock: vi.fn(() => storeState),
  syncViewportStateMock: vi.fn(),
}));

vi.mock('../../history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../history')>()),
  createEditorSnapshotHistory: mocks.createHistoryMock,
}));
vi.mock('../../document/lifecycle/apply/run', () => ({
  applyEditorControllerDocument: mocks.applyDocumentMock,
}));
vi.mock('../../browser-frame/document', () => ({
  ensureEditorBrowserFrameOnTop: mocks.ensureBrowserFrameOnTopMock,
  logEditorBrowserFrame: mocks.logBrowserFrameMock,
  rebuildEditorControllerFrameDecorations: mocks.rebuildFrameDecorationsMock,
  relayoutEditorControllerScene: mocks.relayoutSceneMock,
}));
vi.mock('../../document/objects/prepare', () => ({
  prepareEditorObject: mocks.prepareObjectMock,
}));
vi.mock('../../input/canvas-actions/transient', () => ({
  cancelEditorTransientInteraction: mocks.cancelInteractionMock,
}));
vi.mock('../../input/canvas-actions/draw-session', () => ({
  getEditorControllerActiveCropRect: mocks.getActiveCropRectMock,
  startEditorControllerDrawSession: mocks.startDrawSessionMock,
}));
vi.mock('../../input/canvas-actions/object-add', () => ({
  addEditorCanvasObject: mocks.addObjectMock,
}));
vi.mock('../../input/canvas-actions/shape-decoration', () => ({
  decorateEditorShape: mocks.decorateShapeMock,
}));
vi.mock('../../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/actions')>()),
  advanceEditorControllerStepValue: mocks.advanceStepMock,
  getNextEditorLabelIndex: mocks.getNextLabelIndexMock,
  moveEditorSelection: mocks.moveSelectionMock,
  moveEditorSelectionToEdge: mocks.moveSelectionToEdgeMock,
}));
vi.mock('../../viewport/grid', () => ({
  applyEditorGridSnap: mocks.applyGridSnapMock,
}));

vi.mock('../../viewport/interactions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport/interactions')>()),
  scheduleEditorViewportStateSyncFrame: mocks.scheduleViewportSyncMock,
}));

vi.mock('../../viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../viewport')>()),
  buildEditorViewportState: mocks.buildViewportStateMock,
  syncEditorViewportState: mocks.syncViewportStateMock,
}));

vi.mock('../../document/visibility/reachability', () => ({
  ensureEditorObjectReachable: mocks.ensureObjectReachableMock,
  ensureEditorObjectsReachable: mocks.ensureObjectsReachableMock,
}));
vi.mock('../../document/visibility/viewport-focus', () => ({
  focusEditorObjectInViewport: mocks.focusObjectMock,
}));
vi.mock('../../document/visibility/frame-stack', () => ({
  sendEditorFrameObjectsToBack: mocks.sendFrameObjectsToBackMock,
}));

vi.mock('../../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: mocks.storeGetStateMock,
  },
}));

import {
  applyDocumentForController,
  ensureBrowserFrameOnTopForController,
  logBrowserFrameForController,
  rebuildFrameDecorationsForController,
  relayoutSceneForController,
} from './document';
import {
  addObjectForController,
  decorateShapeForController,
  initializeObjectForController,
} from './object/canvas-object';
import {
  cancelTransientInteractionForController,
  getActiveCropRectForController,
  startDrawSessionForController,
} from './object/lifecycle';
import { advanceStepValueForController, nextLabelIndexForController } from './object/labels';
import { moveSelectionForController, moveSelectionToEdgeForController } from './object/selection';
import {
  applyGridSnapForController,
  buildViewportStateForController,
  ensureObjectReachableForController,
  ensureReachableObjectsForController,
  focusObjectInViewportForController,
  scheduleViewportStateSyncForController,
  sendFrameObjectsToBackForController,
  syncViewportStateForController,
} from './viewport';

function createController() {
  return {
    activeTool: 'select',
    applyToolMode: vi.fn(),
    browserFrameRenderToken: 3,
    canvas: { id: 'canvas', remove: vi.fn(), requestRenderAll: vi.fn() },
    canvasDocumentSize: { width: 40, height: 20 },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    cropSelection: { id: 'selection' },
    drawSession: { id: 'draw' },
    ensureBrowserFrameOnTop: vi.fn(),
    magnetManager: null,
    nextLabelIndex: vi.fn(() => 4),
    originalDocument: null,
    prepareObject: vi.fn(),
    rebuildFrameDecorations: vi.fn(),
    source: { id: 'source' },
    stageElement: { id: 'stage' },
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    syncViewportState: vi.fn(),
    viewportDevicePixelRatioBaseline: 1,
    viewportElement: { id: 'viewport' },
    viewportSyncFrame: 0,
    zoomLevel: 2,
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

describe('editor controller instance helper wrappers', () => {
  it('forwards document helpers and updates controller state', async () => {
    const controller = createController();

    relayoutSceneForController(controller, { padding: 2 } as never, { enabled: true } as never, {
      fitSourceToContent: true,
    });
    await applyDocumentForController(controller, { id: 'document' } as never, {
      resetHistory: true,
      updateOriginal: true,
    });
    await rebuildFrameDecorationsForController(controller);
    logBrowserFrameForController('ready', { objects: 2 });
    ensureBrowserFrameOnTopForController(controller);

    expect(mocks.relayoutSceneMock).toHaveBeenCalled();
    expect(controller.source).toEqual({ id: 'source' });
    expect(controller.canvasDocumentSize).toEqual({ width: 90, height: 40 });
    expect(mocks.applyDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canvas: controller.canvas,
        document: { id: 'document' },
        options: { resetHistory: true, updateOriginal: true },
      })
    );
    expect(mocks.rebuildFrameDecorationsMock).toHaveBeenCalled();
    expect(mocks.logBrowserFrameMock).toHaveBeenCalledWith('ready', { objects: 2 });
    expect(mocks.ensureBrowserFrameOnTopMock).toHaveBeenCalled();
  });

  it('forwards object/runtime helpers and mutates controller local state', () => {
    const controller = createController();
    const object = { id: 'object' } as never;

    expect(cancelTransientInteractionForController(controller)).toBe(true);
    startDrawSessionForController(controller, 'rectangle', { x: 1, y: 2 } as never, object);
    expect(getActiveCropRectForController(controller)).toEqual({ id: 'crop' });
    decorateShapeForController(controller, object, 'rectangle');
    addObjectForController(controller, object);
    moveSelectionForController(controller, 1);
    moveSelectionToEdgeForController(controller, 'front');
    initializeObjectForController(controller, object);
    expect(nextLabelIndexForController(controller, 'text' as never)).toBe(7);
    advanceStepValueForController();

    expect(controller.drawSession).toEqual({ id: 'session' });
    expect(mocks.decorateShapeMock).toHaveBeenCalled();
    expect(mocks.addObjectMock).toHaveBeenCalled();
    expect(mocks.moveSelectionMock).toHaveBeenCalled();
    expect(mocks.moveSelectionToEdgeMock).toHaveBeenCalled();
    expect(mocks.prepareObjectMock).toHaveBeenCalled();
    expect(mocks.advanceStepMock).toHaveBeenCalledOnce();
  });

  it('forwards viewport helpers through the controller seam', () => {
    const controller = {
      ...createController(),
      magnetManager: {
        hasActiveGuides: vi.fn(() => true),
      },
    };
    const object = { id: 'object' } as never;

    storeState.workspace.magnetEnabled = true;
    applyGridSnapForController(controller, object);
    expect(mocks.applyGridSnapMock).not.toHaveBeenCalled();
    controller.magnetManager.hasActiveGuides.mockReturnValue(false);
    applyGridSnapForController(controller, object);
    expect(buildViewportStateForController(controller)).toEqual({ zoom: 2 });
    syncViewportStateForController(controller);
    scheduleViewportStateSyncForController(controller);
    focusObjectInViewportForController(controller, object);
    expect(ensureObjectReachableForController(controller, object)).toBe(true);
    expect(ensureReachableObjectsForController(controller)).toBe(true);
    sendFrameObjectsToBackForController(controller);

    const scheduleArgs = expectMockArgs(
      mocks.scheduleViewportSyncMock.mock.calls as any[][],
      0,
      'viewport sync args'
    );
    scheduleArgs.syncViewportState();
    scheduleArgs.setViewportSyncFrame(11);

    const focusArgs = expectMockArgs(mocks.focusObjectMock.mock.calls as any[][], 0, 'focus args');
    focusArgs.onSynced();

    const sendFrameArgs = (mocks.sendFrameObjectsToBackMock.mock.calls as any[][])[0];
    const sendFrameSync = sendFrameArgs?.[1];
    if (!sendFrameSync) {
      throw new Error('Expected send-frame sync callback');
    }

    sendFrameSync();

    expect(mocks.applyGridSnapMock).toHaveBeenCalledWith(object, storeState.workspace);
    expect(mocks.buildViewportStateMock).toHaveBeenCalledWith(
      expect.objectContaining({ devicePixelRatioBaseline: 1 })
    );
    expect(mocks.syncViewportStateMock).toHaveBeenCalled();
    expect(mocks.scheduleViewportSyncMock).toHaveBeenCalled();
    expect(mocks.focusObjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ devicePixelRatioBaseline: 1 })
    );
    expect(mocks.ensureObjectReachableMock).toHaveBeenCalled();
    expect(mocks.ensureObjectsReachableMock).toHaveBeenCalled();
    expect(mocks.sendFrameObjectsToBackMock).toHaveBeenCalled();
    expect(controller.viewportSyncFrame).toBe(11);
    expect(controller.syncViewportState).toHaveBeenCalledTimes(2);
    expect(controller.ensureBrowserFrameOnTop).toHaveBeenCalledOnce();
  });
});
