import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addObjectMock: vi.fn(),
  advanceStepMock: vi.fn(),
  cancelInteractionMock: vi.fn(),
  decorateShapeMock: vi.fn(),
  getActiveCropRectMock: vi.fn(() => ({ id: 'crop' })),
  getNextLabelIndexMock: vi.fn(() => 7),
  moveSelectionMock: vi.fn(),
  moveSelectionToEdgeMock: vi.fn(),
  prepareObjectMock: vi.fn(),
  startDrawSessionMock: vi.fn(),
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

function createController() {
  return {
    activeTool: 'select',
    canvas: { remove: vi.fn(), requestRenderAll: vi.fn() },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    cropSelection: { id: 'selection' },
    drawSession: { id: 'draw' },
    nextLabelIndex: vi.fn(() => 4),
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    source: { id: 'source' },
    switchToSelectTool: vi.fn(),
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

function triggerObjectActionCallbacks(controller: ReturnType<typeof createController>) {
  const addArgs = expectMockArgs(mocks.addObjectMock.mock.calls as any[][], 0, 'add args');
  addArgs.prepareObject({ id: 'added' });
  addArgs.commitHistory();
  addArgs.syncRuntimeState();

  const moveArgs = expectMockArgs(mocks.moveSelectionMock.mock.calls as any[][], 0, 'move args');
  moveArgs.sendFrameObjectsToBack();
  moveArgs.commitHistory();
  moveArgs.syncRuntimeState();

  const moveToEdgeArgs = expectMockArgs(
    mocks.moveSelectionToEdgeMock.mock.calls as any[][],
    0,
    'move-to-edge args'
  );
  moveToEdgeArgs.sendFrameObjectsToBack();
  moveToEdgeArgs.commitHistory();
  moveToEdgeArgs.syncRuntimeState();

  expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'added' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('forwards transient-interaction and draw-session helpers', () => {
  const controller = createController();
  mocks.cancelInteractionMock.mockReturnValueOnce({ changed: false, drawSession: null });
  mocks.cancelInteractionMock.mockReturnValueOnce({ changed: true, drawSession: { id: 'next' } });
  mocks.startDrawSessionMock.mockReturnValueOnce(null);
  mocks.startDrawSessionMock.mockReturnValueOnce({
    cropGuide: { id: 'next-guide' },
    cropSelection: { id: 'next-selection' },
    drawSession: { id: 'next-draw' },
  });

  expect(cancelTransientInteractionForController(controller)).toBe(false);
  expect(cancelTransientInteractionForController(controller)).toBe(true);
  startDrawSessionForController(
    controller,
    'rectangle',
    { x: 1, y: 2 } as never,
    { id: 'a' } as never
  );
  startDrawSessionForController(
    controller,
    'rectangle',
    { x: 1, y: 2 } as never,
    { id: 'b' } as never
  );

  const cancelArgs = expectMockArgs(
    mocks.cancelInteractionMock.mock.calls as any[][],
    0,
    'cancel args'
  );
  cancelArgs.clearCropSelection();
  cancelArgs.switchToSelectTool();
  cancelArgs.syncRuntimeState();

  const drawArgs = expectMockArgs(mocks.startDrawSessionMock.mock.calls as any[][], 1, 'draw args');
  drawArgs.prepareObject({ id: 'prepared' });

  expect(controller.drawSession).toEqual({ id: 'next-draw' });
  expect(controller.cropGuide).toEqual({ id: 'next-guide' });
  expect(controller.cropSelection).toEqual({ id: 'next-selection' });
  expect(getActiveCropRectForController(controller)).toEqual({ id: 'crop' });
  expect(controller.clearCropSelection).toHaveBeenCalledOnce();
  expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
  expect(controller.prepareObject).toHaveBeenCalledWith({ id: 'prepared' });
});

it('forwards object actions and textbox prepare callbacks', () => {
  const controller = createController();
  const textbox = { id: 'textbox', sniptaleTextInitialInsertPending: true } as never;
  mocks.prepareObjectMock.mockImplementationOnce((_object, callbacks) => {
    callbacks.onTextboxExitEmpty(textbox);
    callbacks.onTextboxExitCommit(textbox);
  });

  decorateShapeForController(controller, { id: 'shape' } as never, 'rectangle');
  addObjectForController(controller, { id: 'object' } as never);
  moveSelectionForController(controller, 1);
  moveSelectionToEdgeForController(controller, 'front');
  initializeObjectForController(controller, textbox);
  expect(nextLabelIndexForController(controller, 'text' as never)).toBe(7);
  advanceStepValueForController();

  triggerObjectActionCallbacks(controller);

  expect(mocks.decorateShapeMock).toHaveBeenCalledOnce();
  expect(mocks.addObjectMock).toHaveBeenCalledOnce();
  expect(mocks.moveSelectionMock).toHaveBeenCalledOnce();
  expect(mocks.moveSelectionToEdgeMock).toHaveBeenCalledOnce();
  expect(controller.canvas.remove).toHaveBeenCalledWith(textbox);
  expect(controller.canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(controller.commitHistory).toHaveBeenCalledTimes(4);
  expect(controller.syncRuntimeState).toHaveBeenCalledTimes(5);
  expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
  expect(controller.sendFrameObjectsToBack).toHaveBeenCalledTimes(2);
  expect(mocks.advanceStepMock).toHaveBeenCalledOnce();
  expect(
    (textbox as { sniptaleTextInitialInsertPending: boolean }).sniptaleTextInitialInsertPending
  ).toBe(false);
});

it('commits textbox exit without resetting the tool when the initial insert flag is already consumed', () => {
  const controller = createController();
  const textbox = { id: 'textbox', sniptaleTextInitialInsertPending: false } as never;
  mocks.prepareObjectMock.mockImplementationOnce((_object, callbacks) => {
    callbacks.onTextboxExitCommit(textbox);
  });

  initializeObjectForController(controller, textbox);

  expect(controller.commitHistory).toHaveBeenCalledOnce();
  expect(controller.switchToSelectTool).not.toHaveBeenCalled();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('removes empty textboxes without resetting the tool when the insert flag is already consumed', () => {
  const controller = createController();
  const textbox = { id: 'textbox', sniptaleTextInitialInsertPending: false } as never;
  mocks.prepareObjectMock.mockImplementationOnce((_object, callbacks) => {
    callbacks.onTextboxExitEmpty(textbox);
  });

  initializeObjectForController(controller, textbox);

  expect(controller.canvas.remove).toHaveBeenCalledWith(textbox);
  expect(controller.canvas.requestRenderAll).toHaveBeenCalledOnce();
  expect(controller.switchToSelectTool).not.toHaveBeenCalled();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});
