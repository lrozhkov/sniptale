import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerEventBindings } from './types';

const mocks = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  completeEditorDrawWorkflowMock: vi.fn(),
  handleArrowMouseDownMock: vi.fn(),
  handleBlurMouseDownMock: vi.fn(),
  handleCropMouseDownMock: vi.fn(),
  handleEditorDrawMouseMoveMock: vi.fn(() => ({ height: 40 })),
  handleEditorPathCreatedMock: vi.fn(),
  handleShapeMouseDownMock: vi.fn(),
  handleRichShapeToolMouseDownMock: vi.fn(),
  handleStepMouseDownMock: vi.fn(),
  handleTextMouseDownMock: vi.fn(),
  isTextTargetMock: vi.fn(() => false),
  resolveTextCalloutPointerZoneMock: vi.fn(() => 'outside'),
}));

vi.mock('../draw-workflow', () => ({
  completeEditorDrawWorkflow: mocks.completeEditorDrawWorkflowMock,
  handleEditorDrawMouseMove: mocks.handleEditorDrawMouseMoveMock,
  handleEditorPathCreated: mocks.handleEditorPathCreatedMock,
}));

vi.mock('./drawing-tool-actions', () => ({
  handleArrowMouseDown: mocks.handleArrowMouseDownMock,
  handleBlurMouseDown: mocks.handleBlurMouseDownMock,
  handleCropMouseDown: mocks.handleCropMouseDownMock,
  handleRichShapeToolMouseDown: mocks.handleRichShapeToolMouseDownMock,
  handleShapeMouseDown: mocks.handleShapeMouseDownMock,
  handleStepMouseDown: mocks.handleStepMouseDownMock,
  handleTextMouseDown: mocks.handleTextMouseDownMock,
  handleLineMouseDown: vi.fn(),
}));

vi.mock('./text-target', () => ({
  activateTextTarget: mocks.activateTextTargetMock,
  isTextTarget: mocks.isTextTargetMock,
}));

vi.mock('../../objects/annotation/text/zones', () => ({
  getTextCalloutInteractionLayout: vi.fn(),
  resolveTextCalloutPointerZone: mocks.resolveTextCalloutPointerZoneMock,
}));

import { createDrawingEventHandlers } from './drawing';

function createBindings(activeTool: string) {
  const activeObject = {
    exitEditing: vi.fn(),
    isEditing: false,
    sniptaleId: 'active-object',
    type: 'rect',
  };
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => activeObject),
    getActiveObjects: vi.fn(() => [activeObject]),
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
    getViewportPoint: vi.fn(() => ({ x: 48, y: 36 })),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };

  return {
    commitHistory: vi.fn(),
    getActiveTool: () => activeTool,
    getCanvas: () => canvas as never,
    getCanvasDocumentSize: () => ({ height: 200, width: 320 }),
    getCropGuide: vi.fn(() => ({ id: 'guide' })),
    getCropSelection: vi.fn(() => ({ height: 20 })),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    getSource: () => ({ id: 'source' }),
    getDrawSession: vi.fn(() => ({ object: { setCoords: vi.fn() }, tool: 'rectangle' })),
    nextLabelIndex: vi.fn(() => 7),
    prepareObject: vi.fn(),
    setCropState: vi.fn(),
    setDrawSession: vi.fn(),
    startDrawSession: vi.fn(),
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
    decorateShape: vi.fn(),
    addObject: vi.fn(),
    advanceStepValue: vi.fn(),
  } as unknown as EditorControllerEventBindings;
}

function registerMouseDownBeforeTests() {
  it('clears the active annotation selection for pencil and highlighter when the pointer leaves it', () => {
    const bindings = createBindings('pencil');
    const canvas = bindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
      requestRenderAll: ReturnType<typeof vi.fn>;
    };

    createDrawingEventHandlers(bindings).handleMouseDownBefore({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'other-object', type: 'rect' },
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('keeps the current pencil selection when the pointer stays on the selected target', () => {
    const bindings = createBindings('highlighter');
    const canvas = bindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
    };

    createDrawingEventHandlers(bindings).handleMouseDownBefore({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'active-object', type: 'rect' },
    } as never);

    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
  });
}

function registerNonDrawableGuardTest() {
  it('ignores mouse down when the canvas, source, or active tool is not drawable', () => {
    const noCanvasBindings = createBindings('rectangle');
    noCanvasBindings.getCanvas = () => null;
    createDrawingEventHandlers(noCanvasBindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);

    const noSourceBindings = createBindings('rectangle');
    noSourceBindings.getSource = () => null;
    createDrawingEventHandlers(noSourceBindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);

    const ignoredToolBindings = createBindings('select');
    const ignoredToolCanvas = ignoredToolBindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
    };
    createDrawingEventHandlers(ignoredToolBindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);

    const imageToolBindings = createBindings('image');
    const imageToolCanvas = imageToolBindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
    };
    createDrawingEventHandlers(imageToolBindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);

    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleArrowMouseDownMock).not.toHaveBeenCalled();
    expect(ignoredToolCanvas.discardActiveObject).not.toHaveBeenCalled();
    expect(imageToolCanvas.discardActiveObject).not.toHaveBeenCalled();
  });
}

function registerSelectedTargetGuardTest() {
  it('does not start a new sticky annotation when the target was already selected', () => {
    const bindings = createBindings('rectangle');
    const canvas = bindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
    };

    createDrawingEventHandlers(bindings).handleMouseDown({
      alreadySelected: true,
      e: { kind: 'pointer' },
      target: { sniptaleId: 'active-object', type: 'rect' },
    } as never);

    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
  });
}

function registerSecondaryButtonGuardTest() {
  it('ignores secondary-button mouse down before sticky annotation dispatch starts', () => {
    const bindings = createBindings('rectangle');

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { button: 2, kind: 'pointer' },
      target: { sniptaleId: 'other-object', type: 'rect' },
    } as never);

    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleArrowMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });
}

function registerPencilGuardTest() {
  it('clears selection but does not create a new object for pencil strokes', () => {
    const bindings = createBindings('pencil');
    const canvas = bindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
    };

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'other-object', type: 'rect' },
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });
}

function registerCropSelectionMouseGuardTest() {
  it('does not start crop selection while image resize mode owns the crop tool', () => {
    const bindings = createBindings('crop');
    bindings.getCropSelectionMouseEnabled = vi.fn(() => false);

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);

    expect(mocks.handleCropMouseDownMock).not.toHaveBeenCalled();
  });
}

describe('editor-controller-events drawing guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextTargetMock.mockReturnValue(false);
    mocks.resolveTextCalloutPointerZoneMock.mockReturnValue('outside');
  });

  registerMouseDownBeforeTests();
  registerNonDrawableGuardTest();
  registerSelectedTargetGuardTest();
  registerSecondaryButtonGuardTest();
  registerPencilGuardTest();
  registerCropSelectionMouseGuardTest();
});
