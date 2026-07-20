import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addObjectMock: vi.fn(),
  advanceStepMock: vi.fn(),
  cancelInteractionMock: vi.fn(),
  getNextLabelIndexMock: vi.fn(() => 7),
  moveSelectionMock: vi.fn(),
  prepareObjectMock: vi.fn(),
  startDrawSessionMock: vi.fn(),
  syncRasterEffectsMock: vi.fn(),
}));

vi.mock('../../../document/objects/prepare', () => ({
  prepareEditorObject: mocks.prepareObjectMock,
}));
vi.mock('../../../input/canvas-actions/transient', () => ({
  cancelEditorTransientInteraction: mocks.cancelInteractionMock,
}));
vi.mock('../../../input/canvas-actions/draw-session', () => ({
  getEditorControllerActiveCropRect: vi.fn(),
  startEditorControllerDrawSession: mocks.startDrawSessionMock,
}));
vi.mock('../../../input/canvas-actions/object-add', () => ({
  addEditorCanvasObject: mocks.addObjectMock,
}));
vi.mock('../../../layer-effects/filters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../layer-effects/filters')>()),
  syncEditorRasterEffects: mocks.syncRasterEffectsMock,
}));
vi.mock('../../../runtime/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/actions')>()),
  advanceEditorControllerStepValue: mocks.advanceStepMock,
  getNextEditorLabelIndex: mocks.getNextLabelIndexMock,
  moveEditorSelection: mocks.moveSelectionMock,
}));

import { addObjectForController, initializeObjectForController } from './canvas-object';
import { advanceStepValueForController, nextLabelIndexForController } from './labels';
import {
  cancelTransientInteractionForController,
  startDrawSessionForController,
} from './lifecycle';
import { moveSelectionForController } from './selection';

function createController() {
  return {
    activeTool: 'select',
    canvas: { remove: vi.fn(), requestRenderAll: vi.fn() },
    clearCropSelection: vi.fn(),
    commitHistory: vi.fn(),
    cropGuide: { id: 'guide' },
    cropSelection: null,
    drawSession: { id: 'draw' },
    prepareObject: vi.fn(),
    sendFrameObjectsToBack: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('adapts transient and draw session state back onto the controller instance', () => {
  const controller = createController();
  mocks.cancelInteractionMock.mockReturnValue({ changed: true, drawSession: { id: 'next' } });
  mocks.startDrawSessionMock.mockReturnValue({
    cropGuide: { id: 'next-guide' },
    cropSelection: { id: 'next-selection' },
    drawSession: { id: 'next-draw' },
  });

  expect(cancelTransientInteractionForController(controller)).toBe(true);
  startDrawSessionForController(
    controller,
    'rectangle',
    { x: 1, y: 2 } as never,
    {
      id: 'object',
    } as never
  );

  expect(controller.drawSession).toEqual({ id: 'next-draw' });
  expect(controller.cropGuide).toEqual({ id: 'next-guide' });
  expect(controller.cropSelection).toEqual({ id: 'next-selection' });
});

it('adapts object initialization callbacks to controller commands', () => {
  const controller = createController();
  const textbox = { sniptaleTextInitialInsertPending: true };
  mocks.prepareObjectMock.mockImplementationOnce((_object, callbacks) => {
    callbacks.onTextboxExitEmpty(textbox);
  });

  addObjectForController(controller, { id: 'object' } as never);
  initializeObjectForController(controller, textbox as never);

  expect(mocks.addObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas })
  );
  expect(mocks.syncRasterEffectsMock).toHaveBeenCalledWith(textbox);
  expect(controller.canvas.remove).toHaveBeenCalledWith(textbox);
  expect(controller.switchToSelectTool).toHaveBeenCalledOnce();
  expect(controller.syncRuntimeState).toHaveBeenCalledOnce();
});

it('adapts selection and label commands through runtime action owners', () => {
  const controller = createController();

  moveSelectionForController(controller, 1);
  expect(nextLabelIndexForController(controller, 'text' as never)).toBe(7);
  advanceStepValueForController();

  expect(mocks.moveSelectionMock).toHaveBeenCalledWith(
    expect.objectContaining({ canvas: controller.canvas, direction: 1 })
  );
  expect(mocks.getNextLabelIndexMock).toHaveBeenCalledWith(controller.canvas, 'text');
  expect(mocks.advanceStepMock).toHaveBeenCalledOnce();
});
