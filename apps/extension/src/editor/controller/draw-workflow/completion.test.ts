import { Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeEditorDrawSessionMock: vi.fn(),
  isArrowObjectMock: vi.fn(() => false),
  isLineObjectMock: vi.fn(() => false),
  isTextboxMock: vi.fn(() => false),
  setCropReadyMock: vi.fn(),
  updateArrowObjectMock: vi.fn(),
  updateLineObjectMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      setCropReady: mocks.setCropReadyMock,
    }),
  },
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

vi.mock('../../objects/arrow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/arrow')>()),
  isArrowObject: mocks.isArrowObjectMock,
  updateArrowObject: mocks.updateArrowObjectMock,
}));

vi.mock('../../objects/line', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/line')>()),
  isLineObject: mocks.isLineObjectMock,
  updateLineObject: mocks.updateLineObjectMock,
}));

vi.mock('../transient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transient')>()),
  completeEditorDrawSession: mocks.completeEditorDrawSessionMock,
}));

import { completeEditorDrawWorkflow } from './completion';

function completeWorkflow(
  canvas: {
    discardActiveObject?: ReturnType<typeof vi.fn>;
    requestRenderAll: ReturnType<typeof vi.fn>;
    setActiveObject: ReturnType<typeof vi.fn>;
  },
  drawSession: unknown,
  canvasDocumentSize = { height: 100, width: 200 }
) {
  return completeEditorDrawWorkflow({
    canvas: canvas as never,
    canvasDocumentSize,
    commitHistory: vi.fn(),
    drawSession: drawSession as never,
    minDrawSize: 8,
    syncRuntimeState: vi.fn(),
  });
}

function registerCompletedTextTest() {
  it('enters editing for completed text draw sessions', () => {
    const textbox = { enterEditing: vi.fn(), selectAll: vi.fn() };
    const canvas = { requestRenderAll: vi.fn(), setActiveObject: vi.fn() };
    mocks.isTextboxMock.mockReturnValue(true);
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'text',
      drawSession: null,
      kind: 'complete',
      object: textbox,
    });

    expect(completeWorkflow(canvas, { object: textbox, tool: 'text' })).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(textbox);
    expect(textbox.enterEditing).toHaveBeenCalledOnce();
    expect(textbox.selectAll).toHaveBeenCalledOnce();
  });
}

function registerCropCompletionTest() {
  it('marks crop-ready state when a crop draw session completes', () => {
    const cropGuide = new Rect({
      left: 10,
      top: 12,
      width: 20,
      height: 30,
      scaleX: 2,
      scaleY: 3,
    });
    const canvas = { requestRenderAll: vi.fn(), setActiveObject: vi.fn() };
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      cropGuide,
      cropSelection: { height: 20, left: 10, top: 12, width: 24 },
      drawSession: null,
      kind: 'crop',
    });

    expect(
      completeWorkflow(canvas, { object: cropGuide, tool: 'crop' }, { height: 200, width: 300 })
    ).toEqual({
      cropGuide,
      cropSelection: { height: 20, left: 10, top: 12, width: 24 },
      drawSession: null,
    });
    expect(mocks.setCropReadyMock).toHaveBeenCalledWith(true);
    expect(canvas.setActiveObject).toHaveBeenCalledWith(cropGuide);
  });
}

function registerGuardAndDiscardTests() {
  it('returns null for missing canvas or draw sessions and discards transient objects', () => {
    expect(
      completeEditorDrawWorkflow({
        canvas: null,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: vi.fn(),
        drawSession: null,
        minDrawSize: 8,
        syncRuntimeState: vi.fn(),
      })
    ).toBeNull();

    const canvas = { remove: vi.fn(), requestRenderAll: vi.fn(), setActiveObject: vi.fn() };
    const syncRuntimeState = vi.fn();
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      drawSession: null,
      kind: 'discard',
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: vi.fn(),
        drawSession: { object: { id: 'discarded' }, tool: 'rectangle' } as never,
        minDrawSize: 8,
        syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(canvas.remove).toHaveBeenCalledWith({ id: 'discarded' });
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerArrowFlagCompletionTest() {
  it('commits non-text completions without entering textbox editing', () => {
    const canvas = { requestRenderAll: vi.fn(), setActiveObject: vi.fn() };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    const object = {
      id: 'arrow-1',
      sniptaleArrowClickMode: true,
      sniptaleArrowDrawing: true,
      sniptaleArrowDraftPoints: [{ x: 0, y: 0 }],
      sniptaleArrowPointerMoved: true,
    };
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'arrow',
      drawSession: null,
      kind: 'complete',
      object,
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory,
        drawSession: { object, tool: 'arrow' } as never,
        minDrawSize: 8,
        syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(object);
    expect(object).toEqual({ id: 'arrow-1' });
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerArrowControlCompletionTest() {
  it('reapplies arrow controls after clearing completed drawing flags', () => {
    const canvas = { requestRenderAll: vi.fn(), setActiveObject: vi.fn() };
    const object = { id: 'arrow-2', sniptaleArrowDrawing: true };
    mocks.isArrowObjectMock.mockReturnValueOnce(true);
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'arrow',
      drawSession: null,
      kind: 'complete',
      object,
    });

    completeWorkflow(canvas, { object, tool: 'arrow' });

    expect(object).toEqual({ id: 'arrow-2' });
    expect(mocks.updateArrowObjectMock).toHaveBeenCalledWith(object, {});
  });
}

function registerLineCompletionTests() {
  it('clears completed line drawing flags without selecting the new line', () => {
    const canvas = {
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const object = { id: 'line-1', sniptaleLineDrawing: true, sniptaleLinePointerMoved: true };
    mocks.isLineObjectMock.mockReturnValueOnce(true);
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'line',
      drawSession: null,
      kind: 'complete',
      object,
    });

    completeWorkflow(canvas, { object, tool: 'line' });

    expect(object).toEqual({ id: 'line-1' });
    expect(mocks.updateLineObjectMock).toHaveBeenCalledWith(object, {});
    expect(canvas.setActiveObject).not.toHaveBeenCalled();
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  });
}

function registerRichShapeCompletionTests() {
  it('keeps shape-library rich-shape completions selected for the canvas toolbar', () => {
    const canvas = {
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    };
    const object = { id: 'rich-shape-1', sniptaleRichShapeToolOrigin: 'shape-library' };
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();
    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'rich-shape',
      drawSession: null,
      kind: 'complete',
      object,
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory,
        drawSession: { object, tool: 'rich-shape' } as never,
        minDrawSize: 8,
        syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(canvas.setActiveObject).toHaveBeenCalledWith(object);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
    expect(object).toEqual({ id: 'rich-shape-1' });
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

describe('editor-controller draw workflow completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isArrowObjectMock.mockReturnValue(false);
    mocks.isLineObjectMock.mockReturnValue(false);
    mocks.isTextboxMock.mockReturnValue(false);
  });

  registerCompletedTextTest();
  registerCropCompletionTest();
  registerGuardAndDiscardTests();
  registerArrowFlagCompletionTest();
  registerArrowControlCompletionTest();
  registerLineCompletionTests();
  registerRichShapeCompletionTests();
});
