import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerEventBindings } from './types';

const mocks = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  handleTextMouseDownMock: vi.fn(),
  isTextTargetMock: vi.fn(() => true),
  resolveTextCalloutPointerZoneMock: vi.fn(() => 'text'),
}));

vi.mock('../draw-workflow', () => ({
  completeEditorDrawWorkflow: vi.fn(),
  handleEditorDrawMouseMove: vi.fn(),
  handleEditorPathCreated: vi.fn(),
}));
vi.mock('./drawing-tool-actions/blur', () => ({
  handleBlurMouseDown: vi.fn(),
}));
vi.mock('./drawing-tool-actions/primitive', () => ({
  handleArrowMouseDown: vi.fn(),
  handleCropMouseDown: vi.fn(),
  handleLineMouseDown: vi.fn(),
  handleShapeMouseDown: vi.fn(),
}));
vi.mock('./drawing-tool-actions/rich-shape', () => ({
  handleRichShapeToolMouseDown: vi.fn(),
}));
vi.mock('./drawing-tool-actions/step', () => ({
  handleStepMouseDown: vi.fn(),
}));
vi.mock('./drawing-tool-actions/text', () => ({
  handleTextMouseDown: mocks.handleTextMouseDownMock,
}));
vi.mock('./arrow-drawing', () => ({
  handleArrowDrawingMouseDown: vi.fn(),
  shouldKeepArrowDrawSessionOpen: vi.fn(() => false),
}));
vi.mock('../raster-tools/interactions/down', () => ({
  handleRasterToolMouseDown: vi.fn(async () => false),
}));
vi.mock('../raster-tools/interactions/move', () => ({
  handleRasterToolMouseMove: vi.fn(() => false),
}));
vi.mock('../raster-tools/interactions/up', () => ({
  handleRasterToolMouseUp: vi.fn(async () => false),
}));
vi.mock('../raster-tools/interactions/tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/interactions/tool')>()),
  isRasterEditorTool: () => false,
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
    type: 'textbox',
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
    getCropGuide: vi.fn(() => null),
    getCropSelection: vi.fn(() => null),
    getCropSelectionMouseEnabled: vi.fn(() => true),
    getSource: () => ({ id: 'source' }),
    getDrawSession: vi.fn(() => null),
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

function dispatchTextMouseDown(
  bindings: EditorControllerEventBindings,
  args: {
    alreadySelected: boolean;
    target: Record<string, unknown>;
  }
) {
  createDrawingEventHandlers(bindings).handleMouseDown({
    alreadySelected: args.alreadySelected,
    e: { kind: 'pointer' },
    target: args.target,
  } as never);
}

describe('editor-controller-events-drawing text targets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextTargetMock.mockReturnValue(true);
    mocks.resolveTextCalloutPointerZoneMock.mockReturnValue('text');
  });

  it('creates a new text layer when the text tool clicks a non-selected textbox', () => {
    const textBindings = createBindings('text');
    const textCanvas = textBindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
      requestRenderAll: ReturnType<typeof vi.fn>;
    };
    const target = { sniptaleId: 'text-target', sniptaleType: 'text', type: 'textbox' };

    dispatchTextMouseDown(textBindings, { alreadySelected: false, target });

    expect(mocks.activateTextTargetMock).not.toHaveBeenCalled();
    expect(textCanvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(mocks.handleTextMouseDownMock).toHaveBeenCalledOnce();
  });

  it('keeps selected text zones under native selection ownership in select mode', () => {
    const textBindings = createBindings('select');
    const target = { sniptaleId: 'active-object', sniptaleType: 'text', type: 'textbox' };

    dispatchTextMouseDown(textBindings, { alreadySelected: true, target });

    expect(mocks.activateTextTargetMock).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });

  it('keeps selected text callout move and handle zones available in text mode', () => {
    const textBindings = createBindings('text');
    const target = { sniptaleId: 'active-object', sniptaleType: 'text', type: 'textbox' };
    mocks.resolveTextCalloutPointerZoneMock.mockReturnValue('handle');

    dispatchTextMouseDown(textBindings, { alreadySelected: true, target });

    expect(mocks.activateTextTargetMock).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });
});
