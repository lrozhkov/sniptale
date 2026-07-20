import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorControllerEventBindings } from './types';
const mocks = vi.hoisted(() => ({
  activateTextTargetMock: vi.fn(),
  completeEditorDrawWorkflowMock: vi.fn(),
  handleArrowDrawingMouseDownMock: vi.fn(),
  handleBlurMouseDownMock: vi.fn(),
  handleCalloutMouseDownMock: vi.fn(),
  handleCropMouseDownMock: vi.fn(),
  handleEditorDrawMouseMoveMock: vi.fn(() => ({ height: 40 })),
  handleEditorPathCreatedMock: vi.fn(),
  handleShapeMouseDownMock: vi.fn(),
  handleRichShapeToolMouseDownMock: vi.fn(),
  handleStepMouseDownMock: vi.fn(),
  handleTextMouseDownMock: vi.fn(),
  handleRasterToolMouseDownMock: vi.fn(async () => false),
  handleRasterToolMouseMoveMock: vi.fn(() => false),
  handleRasterToolMouseUpMock: vi.fn(async () => false),
  isTextTargetMock: vi.fn(() => false),
  resolveTextCalloutPointerZoneMock: vi.fn(() => 'outside'),
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
  handleArrowMouseDown: vi.fn(),
  handleCropMouseDown: mocks.handleCropMouseDownMock,
  handleLineMouseDown: vi.fn(),
  handleShapeMouseDown: mocks.handleShapeMouseDownMock,
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
vi.mock('./drawing-callout-actions', () => ({
  handleCalloutMouseDown: mocks.handleCalloutMouseDownMock,
}));
vi.mock('./arrow-drawing', () => ({
  handleArrowDrawingMouseDown: mocks.handleArrowDrawingMouseDownMock,
  shouldKeepArrowDrawSessionOpen: vi.fn(() => false),
}));
vi.mock('../raster-tools/interactions/down', () => ({
  handleRasterToolMouseDown: mocks.handleRasterToolMouseDownMock,
}));
vi.mock('../raster-tools/interactions/move', () => ({
  handleRasterToolMouseMove: mocks.handleRasterToolMouseMoveMock,
}));
vi.mock('../raster-tools/interactions/up', () => ({
  handleRasterToolMouseUp: mocks.handleRasterToolMouseUpMock,
}));
vi.mock('../raster-tools/interactions/tool', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../raster-tools/interactions/tool')>()),
  isRasterEditorTool: (tool: string) =>
    tool === 'selection' || tool === 'brush' || tool === 'eraser' || tool === 'fill',
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
  const cropGuide = { id: 'guide' };
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
    getCropGuide: vi.fn(() => cropGuide),
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
function registerWorkflowRoutingTest() {
  it('routes path, mouse move, and mouse up through workflow seams', () => {
    const bindings = createBindings('rectangle');
    const handlers = createDrawingEventHandlers(bindings);
    const pointEvent = { e: { kind: 'pointer' } } as never;

    handlers.handlePathCreated({ path: { id: 'path-1' } } as never);
    expect(mocks.handleEditorPathCreatedMock).toHaveBeenCalled();
    const pathArgs = mocks.handleEditorPathCreatedMock.mock.calls.at(0)?.[0];
    expect(pathArgs?.switchToSelectTool).toBeUndefined();
    expect(pathArgs?.nextLabelIndex('rectangle')).toBe(7);
    expect(bindings.nextLabelIndex).toHaveBeenCalledWith('rectangle');
    pathArgs?.prepareObject({ id: 'draft-shape' } as never);
    pathArgs?.commitHistory();
    pathArgs?.syncRuntimeState();
    expect(bindings.prepareObject).toHaveBeenCalledWith({ id: 'draft-shape' });
    expect(bindings.commitHistory).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();

    handlers.handleMouseMove(pointEvent);
    expect(mocks.handleEditorDrawMouseMoveMock).toHaveBeenCalled();
    expect(bindings.setCropState).toHaveBeenCalledWith({ id: 'guide' }, { height: 40 });

    mocks.completeEditorDrawWorkflowMock.mockReturnValue({
      cropGuide: { id: 'next-guide' },
      cropSelection: { height: 22 },
      drawSession: null,
    });

    handlers.handleMouseUp();

    const workflowArgs = mocks.completeEditorDrawWorkflowMock.mock.calls.at(0)?.[0];
    workflowArgs?.commitHistory();
    workflowArgs?.syncRuntimeState();
    expect(bindings.setDrawSession).toHaveBeenCalledWith(null);
    expect(bindings.setCropState).toHaveBeenLastCalledWith({ id: 'next-guide' }, { height: 22 });
    expect(bindings.commitHistory).toHaveBeenCalledTimes(2);
    expect(bindings.syncRuntimeState).toHaveBeenCalledTimes(3);
  });
}

function registerLatestPointerTest() {
  it('stores the latest canvas pointer on active draw sessions', () => {
    const bindings = createBindings('line');
    const drawSession = { object: { setCoords: vi.fn() }, tool: 'line' };
    bindings.getDrawSession = vi.fn(() => drawSession as never);

    createDrawingEventHandlers(bindings).handleMouseMove({ e: { kind: 'pointer' } } as never);

    expect(drawSession).toMatchObject({ lastPoint: { x: 18, y: 24 } });
    expect(mocks.handleEditorDrawMouseMoveMock).toHaveBeenCalledWith(
      expect.objectContaining({ point: { x: 18, y: 24 } })
    );
  });
}

function runWorkflowDelegationSuite() {
  registerWorkflowRoutingTest();
  registerLatestPointerTest();
}

function runWorkflowGuardSuite() {
  it('guards mouse move and mouse up when workflow state is missing', () => {
    const bindings = createBindings('rectangle');
    bindings.getDrawSession = vi.fn(() => null);
    const handlers = createDrawingEventHandlers(bindings);

    handlers.handleMouseMove({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleEditorDrawMouseMoveMock).not.toHaveBeenCalled();

    mocks.completeEditorDrawWorkflowMock.mockReturnValueOnce(null);
    handlers.handleMouseUp();
    expect(bindings.setDrawSession).not.toHaveBeenCalled();
    expect(bindings.syncRuntimeState).not.toHaveBeenCalled();
  });
}
function registerMouseDownBeforeSelectionOwnershipTest() {
  it('clears annotation selection before freehand draws when the target is outside the selection', () => {
    const bindings = createBindings('pencil');
    const canvas = bindings.getCanvas() as unknown as {
      discardActiveObject: ReturnType<typeof vi.fn>;
      requestRenderAll: ReturnType<typeof vi.fn>;
    };

    createDrawingEventHandlers(bindings).handleMouseDownBefore({
      e: { kind: 'pointer' },
      target: { sniptaleId: 'outside-selection' },
    } as never);

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(bindings.syncRuntimeState).toHaveBeenCalledOnce();
  });
}
function registerToolDispatchCoverageTest() {
  it('dispatches mouse down events to the tool-specific owner seam', () => {
    const shapeBindings = createBindings('rectangle');
    createDrawingEventHandlers(shapeBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleShapeMouseDownMock).toHaveBeenCalled();
    const arrowBindings = createBindings('arrow');
    createDrawingEventHandlers(arrowBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleArrowDrawingMouseDownMock).toHaveBeenCalled();
    const blurBindings = createBindings('blur');
    createDrawingEventHandlers(blurBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleBlurMouseDownMock).toHaveBeenCalled();
    const cropBindings = createBindings('crop');
    createDrawingEventHandlers(cropBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleCropMouseDownMock).toHaveBeenCalled();
    const textBindings = createBindings('text');
    createDrawingEventHandlers(textBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleTextMouseDownMock).toHaveBeenCalled();
    const stepBindings = createBindings('step');
    createDrawingEventHandlers(stepBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);
    expect(mocks.handleStepMouseDownMock).toHaveBeenCalled();
    const calloutBindings = createBindings('callout');
    createDrawingEventHandlers(calloutBindings).handleMouseDown({
      e: { kind: 'pointer' },
    } as never);
    expect(mocks.handleCalloutMouseDownMock).toHaveBeenCalled();
  });
}

function registerCropGuideInteractionGuardTest() {
  it('keeps existing crop guide pointer interactions under Fabric move and resize ownership', () => {
    const cropBindings = createBindings('crop');
    const cropGuide = cropBindings.getCropGuide();

    createDrawingEventHandlers(cropBindings).handleMouseDown({
      e: { kind: 'pointer' },
      target: cropGuide,
    } as never);

    expect(mocks.handleCropMouseDownMock).not.toHaveBeenCalled();
    const canvas = cropBindings.getCanvas() as unknown as {
      getScenePoint: ReturnType<typeof vi.fn>;
    };
    expect(canvas.getScenePoint).not.toHaveBeenCalled();
  });
}

function registerMouseDownGuardTests() {
  it('keeps select mode, already-selected targets, and non-sticky tools out of sticky dispatch', () => {
    const selectBindings = createBindings('select');
    createDrawingEventHandlers(selectBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);

    const imageBindings = createBindings('image');
    createDrawingEventHandlers(imageBindings).handleMouseDown({ e: { kind: 'pointer' } } as never);

    const textBindings = createBindings('text');
    createDrawingEventHandlers(textBindings).handleMouseDown({
      alreadySelected: true,
      e: { kind: 'pointer' },
      target: { sniptaleId: 'active-object' },
    } as never);

    expect(mocks.handleShapeMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleArrowDrawingMouseDownMock).not.toHaveBeenCalled();
    expect(mocks.handleTextMouseDownMock).not.toHaveBeenCalled();
  });
}

describe('editor-controller-events-drawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTextTargetMock.mockReturnValue(false);
    mocks.resolveTextCalloutPointerZoneMock.mockReturnValue('outside');
  });
  runWorkflowDelegationSuite();
  runWorkflowGuardSuite();
  registerMouseDownBeforeSelectionOwnershipTest();
  registerToolDispatchCoverageTest();
  registerCropGuideInteractionGuardTest();
  registerMouseDownGuardTests();
});
