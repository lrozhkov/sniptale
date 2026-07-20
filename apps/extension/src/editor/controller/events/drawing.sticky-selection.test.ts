import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerEventBindings } from './types';

const mocks = vi.hoisted(() => ({
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
}));

vi.mock('../draw-workflow', () => ({
  completeEditorDrawWorkflow: mocks.completeEditorDrawWorkflowMock,
  handleEditorDrawMouseMove: mocks.handleEditorDrawMouseMoveMock,
  handleEditorPathCreated: mocks.handleEditorPathCreatedMock,
}));

vi.mock('./drawing-tool-actions/blur', () => ({
  handleBlurMouseDown: mocks.handleBlurMouseDownMock,
}));

vi.mock('./drawing-tool-actions/primitive', () => ({
  handleArrowMouseDown: mocks.handleArrowMouseDownMock,
  handleCropMouseDown: mocks.handleCropMouseDownMock,
  handleShapeMouseDown: mocks.handleShapeMouseDownMock,
  handleLineMouseDown: vi.fn(),
}));

vi.mock('./drawing-tool-actions/rich-shape', () => ({
  handleRichShapeToolMouseDown: mocks.handleRichShapeToolMouseDownMock,
}));

vi.mock('./drawing-tool-actions/step', () => ({
  handleStepMouseDown: mocks.handleStepMouseDownMock,
}));

vi.mock('./drawing-tool-actions/text', () => ({
  handleTextMouseDown: mocks.handleTextMouseDownMock,
}));

import { createDrawingEventHandlers } from './drawing';

type TestCanvas = {
  discardActiveObject: ReturnType<typeof vi.fn>;
  getActiveObject: ReturnType<typeof vi.fn<() => { sniptaleId: string; type: string }>>;
  getActiveObjects: ReturnType<typeof vi.fn<() => Array<{ sniptaleId: string; type: string }>>>;
  getScenePoint: ReturnType<typeof vi.fn>;
  requestRenderAll: ReturnType<typeof vi.fn>;
  setActiveObject: ReturnType<typeof vi.fn>;
};

function createBindings(activeTool: string) {
  const activeObject = {
    exitEditing: vi.fn(),
    isEditing: false,
    sniptaleId: 'active-object',
    type: 'rect',
  };
  const getActiveObject = vi.fn<() => typeof activeObject>(() => activeObject);
  const getActiveObjects = vi.fn<() => (typeof activeObject)[]>(() => [activeObject]);
  const canvas: TestCanvas = {
    discardActiveObject: vi.fn(),
    getActiveObject,
    getActiveObjects,
    getScenePoint: vi.fn(() => ({ x: 18, y: 24 })),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };

  return {
    bindings: {
      addObject: vi.fn(),
      advanceStepValue: vi.fn(),
      commitHistory: vi.fn(),
      decorateShape: vi.fn(),
      getActiveTool: () => activeTool,
      getCanvas: () => canvas as never,
      getCanvasDocumentSize: () => ({ height: 200, width: 320 }),
      getCropGuide: vi.fn(() => ({ id: 'guide' })),
      getCropSelection: vi.fn(() => ({ height: 20 })),
      getDrawSession: vi.fn(() => ({ object: { setCoords: vi.fn() }, tool: 'rectangle' })),
      getSource: () => ({ id: 'source' }),
      nextLabelIndex: vi.fn(() => 7),
      prepareObject: vi.fn(),
      setCropState: vi.fn(),
      setDrawSession: vi.fn(),
      startDrawSession: vi.fn(),
      switchToSelectTool: vi.fn(),
      syncRuntimeState: vi.fn(),
    } as unknown as EditorControllerEventBindings,
    canvas,
  };
}

function runFreehandSelectionSuite() {
  it('clears freehand sticky selection before Fabric handles a blank-canvas draw gesture', () => {
    const { bindings, canvas } = createBindings('pencil');

    createDrawingEventHandlers(bindings).handleMouseDownBefore({
      e: { kind: 'pointer' },
      target: undefined,
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
  });

  it('keeps the current freehand selection active when the pointer stays inside it', () => {
    const { bindings, canvas } = createBindings('highlighter');
    const activeObject = canvas.getActiveObject();

    createDrawingEventHandlers(bindings).handleMouseDownBefore({
      e: { kind: 'pointer' },
      target: activeObject,
    } as never);

    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.requestRenderAll).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
  });

  it('clears active selection for freehand tools without dispatching shape handlers', () => {
    const { bindings, canvas } = createBindings('pencil');

    createDrawingEventHandlers(bindings).handleMouseDown({ e: { kind: 'pointer' } } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
  });
}

function runStickySelectionRoutingSuite() {
  it('keeps the current selected object active when a sticky tool clicks inside it', () => {
    const { bindings, canvas } = createBindings('rectangle');
    const activeObject = canvas.getActiveObject();

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: activeObject,
    } as never);

    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
  });

  it('clears the current active selection before starting another shape annotation', () => {
    const { bindings, canvas } = createBindings('rectangle');

    createDrawingEventHandlers(bindings).handleMouseDown({ e: { kind: 'pointer' } } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.handleShapeMouseDownMock).toHaveBeenCalledOnce();
  });

  it('treats another non-selected object like blank canvas for sticky tools', () => {
    const { bindings, canvas } = createBindings('rectangle');

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'other-object', type: 'ellipse' },
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(mocks.handleShapeMouseDownMock).toHaveBeenCalledOnce();
  });
}

function runStickyTextSelectionSuite() {
  it('exits editing text before clearing selection and creating another text layer', () => {
    const { bindings, canvas } = createBindings('text');
    const editingText = {
      exitEditing: vi.fn(),
      isEditing: true,
      sniptaleId: 'active-object',
      type: 'textbox',
    };
    canvas.getActiveObject.mockReturnValue(editingText);
    canvas.getActiveObjects.mockReturnValue([editingText]);

    createDrawingEventHandlers(bindings).handleMouseDown({ e: { kind: 'pointer' } } as never);

    expect(editingText.exitEditing).toHaveBeenCalledOnce();
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(mocks.handleTextMouseDownMock).toHaveBeenCalledOnce();
  });

  it('keeps editing text active when the sticky text tool clicks the current selection', () => {
    const { bindings, canvas } = createBindings('text');
    const editingText = {
      exitEditing: vi.fn(),
      isEditing: true,
      sniptaleId: 'active-object',
      type: 'textbox',
    };
    canvas.getActiveObject.mockReturnValue(editingText);
    canvas.getActiveObjects.mockReturnValue([editingText]);

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: editingText,
    } as never);

    expect(editingText.exitEditing).not.toHaveBeenCalled();
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });
}

function runStickyTextCalloutTargetSuite() {
  it('treats another callout like blank canvas for the sticky text tool', () => {
    const { bindings, canvas } = createBindings('text');
    const callout = {
      enterEditing: vi.fn(),
      isEditing: false,
      sniptaleId: 'callout-object',
      sniptaleType: 'text',
      selectAll: vi.fn(),
      type: 'textbox',
    };

    createDrawingEventHandlers(bindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: callout,
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(callout.enterEditing).not.toHaveBeenCalled();
    expect(callout.selectAll).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
    expect(mocks.handleTextMouseDownMock).toHaveBeenCalledOnce();
  });
}

describe('editor-controller-events-drawing sticky selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  runFreehandSelectionSuite();
  runStickySelectionRoutingSuite();
  runStickyTextSelectionSuite();
  runStickyTextCalloutTargetSuite();
});
