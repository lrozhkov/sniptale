import { Point, Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeEditorDrawSessionMock: vi.fn(),
  createDiamondDraftMock: vi.fn(),
  createEllipseDraftMock: vi.fn(),
  createRectangleDraftMock: vi.fn(),
  isCompletedDrawSessionTooSmallMock: vi.fn(),
  setCropReadyMock: vi.fn(),
  updateEditorDrawSessionObjectMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      setCropReady: mocks.setCropReadyMock,
      toolSettings: {
        arrow: { color: '#fff', width: 4 },
        blur: { amount: 10, blurType: 'gaussian', showBorder: false },
        ellipse: { strokeWidth: 5 },
        line: { color: '#111', width: 2 },
        rectangle: { strokeWidth: 3 },
      },
    }),
  },
}));

vi.mock('../drawing', () => ({
  createDiamondDraft: mocks.createDiamondDraftMock,
  createEllipseDraft: mocks.createEllipseDraftMock,
  createRectangleDraft: mocks.createRectangleDraftMock,
  isCompletedDrawSessionTooSmall: mocks.isCompletedDrawSessionTooSmallMock,
  updateEditorDrawSessionObject: mocks.updateEditorDrawSessionObjectMock,
}));

vi.mock('../transient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../transient')>()),
  completeEditorDrawSession: mocks.completeEditorDrawSessionMock,
}));

import { completeEditorDrawWorkflow, handleEditorDrawMouseMove } from './';

function runMouseMoveSuite() {
  it('updates draw sessions and preserves prior crop selection on null updates', () => {
    const object = {
      setCoords: vi.fn(),
    };
    const canvas = {
      requestRenderAll: vi.fn(),
    };

    const nextSelection = handleEditorDrawMouseMove({
      canvas: canvas as never,
      cropSelection: { width: 20 } as never,
      drawSession: { object, tool: 'rectangle' } as never,
      point: new Point(10, 12),
    });

    expect(nextSelection).toEqual({ width: 44 });
    expect(mocks.updateEditorDrawSessionObjectMock).toHaveBeenCalledWith(
      { object, tool: 'rectangle' },
      new Point(10, 12),
      { color: '#fff', width: 4 },
      { strokeWidth: 3 },
      { amount: 10, blurType: 'gaussian', showBorder: false },
      false,
      { color: '#111', width: 2 }
    );
    expect(object.setCoords).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();

    mocks.updateEditorDrawSessionObjectMock.mockReturnValueOnce(null);
    expect(
      handleEditorDrawMouseMove({
        canvas: canvas as never,
        cropSelection: { width: 20 } as never,
        drawSession: { object, tool: 'rectangle' } as never,
        point: new Point(10, 12),
      })
    ).toEqual({ width: 20 });
  });
}

function createCompletionFixtures() {
  return {
    canvas: {
      remove: vi.fn(),
      requestRenderAll: vi.fn(),
      setActiveObject: vi.fn(),
    },
    commitHistory: vi.fn(),
    object: { id: 'shape-1' },
    switchToSelectTool: vi.fn(),
    syncRuntimeState: vi.fn(),
  };
}

function runDiscardCompletionSuite() {
  it('builds discard workflow states', () => {
    const fixtures = createCompletionFixtures();

    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      drawSession: null,
      kind: 'discard',
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: fixtures.canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: fixtures.commitHistory,
        drawSession: { object: fixtures.object, tool: 'rectangle' } as never,
        minDrawSize: 8,
        syncRuntimeState: fixtures.syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(fixtures.canvas.remove).toHaveBeenCalledWith(fixtures.object);
  });
}

function runCropCompletionSuite() {
  it('builds crop workflow states', () => {
    const fixtures = createCompletionFixtures();
    const cropGuide = new Rect({ width: 10, height: 20 });

    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      cropGuide,
      cropSelection: { height: 20, left: 10, top: 12, width: 24 },
      drawSession: null,
      kind: 'crop',
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: fixtures.canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: fixtures.commitHistory,
        drawSession: { object: fixtures.object, tool: 'crop' } as never,
        minDrawSize: 8,
        syncRuntimeState: fixtures.syncRuntimeState,
      })
    ).toEqual({
      cropGuide,
      cropSelection: { height: 20, left: 10, top: 12, width: 24 },
      drawSession: null,
    });
    expect(mocks.setCropReadyMock).toHaveBeenCalledWith(true);
  });
}

function runCompleteCompletionSuite() {
  it('builds completed workflow states without switching annotation tools to select', () => {
    const fixtures = createCompletionFixtures();

    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'rectangle',
      drawSession: null,
      kind: 'complete',
      object: fixtures.object,
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: fixtures.canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: fixtures.commitHistory,
        drawSession: { object: fixtures.object, tool: 'rectangle' } as never,
        minDrawSize: 8,
        syncRuntimeState: fixtures.syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(fixtures.canvas.setActiveObject).toHaveBeenCalledWith(fixtures.object);
    expect(fixtures.switchToSelectTool).not.toHaveBeenCalled();
    expect(fixtures.commitHistory).toHaveBeenCalled();
  });
}

function runCropCompletionGuardSuite() {
  it('keeps crop completions from switching back to select and returns null without canvas', () => {
    const fixtures = createCompletionFixtures();

    expect(
      completeEditorDrawWorkflow({
        canvas: null,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: fixtures.commitHistory,
        drawSession: { object: fixtures.object, tool: 'rectangle' } as never,
        minDrawSize: 8,
        syncRuntimeState: fixtures.syncRuntimeState,
      })
    ).toBeNull();

    mocks.completeEditorDrawSessionMock.mockReturnValueOnce({
      completedTool: 'crop',
      drawSession: null,
      kind: 'complete',
      object: fixtures.object,
    });

    expect(
      completeEditorDrawWorkflow({
        canvas: fixtures.canvas as never,
        canvasDocumentSize: { height: 100, width: 200 },
        commitHistory: fixtures.commitHistory,
        drawSession: { object: fixtures.object, tool: 'crop' } as never,
        minDrawSize: 8,
        syncRuntimeState: fixtures.syncRuntimeState,
      })
    ).toEqual({
      cropGuide: null,
      cropSelection: null,
      drawSession: null,
    });
    expect(fixtures.switchToSelectTool).not.toHaveBeenCalled();
  });
}

describe('editor-controller-draw-workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateEditorDrawSessionObjectMock.mockReturnValue({ width: 44 });
  });
  runMouseMoveSuite();
  runDiscardCompletionSuite();
  runCropCompletionSuite();
  runCompleteCompletionSuite();
  runCropCompletionGuardSuite();
});
