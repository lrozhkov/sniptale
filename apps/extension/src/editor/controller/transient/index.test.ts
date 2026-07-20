import { Rect } from 'fabric';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  applyTextLayoutMock: vi.fn(),
  createDiamondDraftMock: vi.fn(),
  createEllipseDraftMock: vi.fn(),
  createRectangleDraftMock: vi.fn(),
  isCompletedDrawSessionTooSmallMock: vi.fn(() => false),
  normalizeEditorCropSelectionMock: vi.fn(() => ({
    height: 80,
    left: 10,
    top: 20,
    width: 120,
  })),
  updateEditorDrawSessionObjectMock: vi.fn(),
}));

vi.mock('../drawing', () => ({
  createDiamondDraft: mocks.createDiamondDraftMock,
  createEllipseDraft: mocks.createEllipseDraftMock,
  createRectangleDraft: mocks.createRectangleDraftMock,
  isCompletedDrawSessionTooSmall: mocks.isCompletedDrawSessionTooSmallMock,
  updateEditorDrawSessionObject: mocks.updateEditorDrawSessionObjectMock,
}));

vi.mock('../tools/crop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/crop')>()),
  normalizeEditorCropSelection: mocks.normalizeEditorCropSelectionMock,
}));

vi.mock('../../objects/annotation/text/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/annotation/text/layout')>()),
  applyTextLayout: mocks.applyTextLayoutMock,
}));

import {
  cancelEditorCropDrawSession,
  clearEditorCropGuide,
  completeEditorDrawSession,
  startEditorDrawSession,
} from './';

function setupTransientMocks() {
  vi.clearAllMocks();
  mocks.isCompletedDrawSessionTooSmallMock.mockReturnValue(false);
  mocks.normalizeEditorCropSelectionMock.mockReturnValue({
    height: 80,
    left: 10,
    top: 20,
    width: 120,
  });
}

function createCropCanvasMock(activeObject: Rect | null = null) {
  return {
    discardActiveObject: vi.fn(),
    getActiveObject: vi.fn(() => activeObject),
    remove: vi.fn(),
  };
}

function runClearCropGuideSuite() {
  it('clears crop guides only when a guide exists on the canvas', () => {
    const canvas = { discardActiveObject: vi.fn(), getActiveObject: vi.fn(), remove: vi.fn() };
    const cropGuide = new Rect({ height: 40, width: 60 });

    expect(clearEditorCropGuide({ canvas: canvas as never, cropGuide: null })).toEqual({
      changed: false,
      cropGuide: null,
      cropSelection: null,
    });
    expect(clearEditorCropGuide({ canvas: canvas as never, cropGuide })).toEqual({
      changed: true,
      cropGuide: null,
      cropSelection: null,
    });
    expect(canvas.remove).toHaveBeenCalledWith(cropGuide);
    expect(canvas.discardActiveObject).not.toHaveBeenCalled();
  });

  it('discards an active crop guide before removing it from the canvas', () => {
    const cropGuide = new Rect({ height: 40, width: 60 });
    const canvas = {
      discardActiveObject: vi.fn(),
      getActiveObject: vi.fn(() => cropGuide),
      remove: vi.fn(),
    };

    expect(clearEditorCropGuide({ canvas: canvas as never, cropGuide })).toEqual({
      changed: true,
      cropGuide: null,
      cropSelection: null,
    });

    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.discardActiveObject.mock.invocationCallOrder[0]).toBeLessThan(
      canvas.remove.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });
}

function runCancelCropDrawSessionSuite() {
  it('cancels crop draw sessions only for active crop objects', () => {
    const canvas = { remove: vi.fn() };

    expect(
      cancelEditorCropDrawSession({
        canvas: canvas as never,
        drawSession: { object: null, tool: 'crop' } as never,
      })
    ).toEqual({
      changed: false,
      cropSelection: null,
      drawSession: null,
    });

    const cropObject = new Rect({ height: 40, width: 60 });

    expect(
      cancelEditorCropDrawSession({
        canvas: canvas as never,
        drawSession: { object: cropObject, tool: 'crop' } as never,
      })
    ).toEqual({
      changed: true,
      cropSelection: null,
      drawSession: null,
    });
    expect(canvas.remove).toHaveBeenCalledWith(cropObject);
  });
}

function registerCropStartDrawSessionTest() {
  it('starts draw sessions and clears an existing crop guide for crop tools', () => {
    const existingGuide = new Rect({ height: 10, width: 10 });
    const canvas = createCropCanvasMock(existingGuide);
    const object = { sniptaleId: 'shape-1' };

    const result = startEditorDrawSession({
      canvas: canvas as never,
      cropGuide: existingGuide,
      object: object as never,
      start: { x: 10, y: 12 } as never,
      tool: 'crop',
    });

    expect(canvas.remove).toHaveBeenCalledWith(existingGuide);
    expect(result).toEqual({
      clearedExistingCropGuide: true,
      cropGuide: null,
      cropSelection: null,
      drawSession: {
        object,
        objectId: 'shape-1',
        lastPoint: { x: 10, y: 12 },
        start: { x: 10, y: 12 },
        tool: 'crop',
      },
    });
  });
}

function registerNonCropStartDrawSessionTest() {
  it('starts non-crop draw sessions without clearing existing crop guides', () => {
    const canvas = { remove: vi.fn() };
    const existingGuide = new Rect({ height: 10, width: 10 });
    const object = {};

    const result = startEditorDrawSession({
      canvas: canvas as never,
      cropGuide: existingGuide,
      object: object as never,
      start: { x: 4, y: 6 } as never,
      tool: 'arrow',
    });

    expect(canvas.remove).not.toHaveBeenCalled();
    expect(result.cropGuide).toBe(existingGuide);
    expect(result.clearedExistingCropGuide).toBe(false);
    expect(result.drawSession).toEqual(
      expect.objectContaining({
        lastPoint: { x: 4, y: 6 },
        object,
        objectId: expect.any(String),
        start: { x: 4, y: 6 },
      })
    );
  });
}

function runDiscardDrawSessionSuite() {
  it('discards draw sessions with no object or too-small geometry', () => {
    expect(
      completeEditorDrawSession({
        canvasDocumentSize: { height: 200, width: 300 },
        drawSession: { object: null, tool: 'arrow' } as never,
        minDrawSize: 8,
      })
    ).toEqual({
      drawSession: null,
      kind: 'discard',
    });

    mocks.isCompletedDrawSessionTooSmallMock.mockReturnValue(true);

    expect(
      completeEditorDrawSession({
        canvasDocumentSize: { height: 200, width: 300 },
        drawSession: {
          object: { id: 'shape' },
          tool: 'rectangle',
        } as never,
        minDrawSize: 8,
      })
    ).toEqual({
      drawSession: null,
      kind: 'discard',
    });
  });
}

function runCompleteDrawSessionSuite() {
  it('returns crop and complete payloads for finished draw sessions', () => {
    const cropGuide = new Rect({
      height: 40,
      left: 10,
      scaleX: 2,
      scaleY: 3,
      top: 20,
      width: 30,
    });
    const cropResult = completeEditorDrawSession({
      canvasDocumentSize: { height: 200, width: 300 },
      drawSession: { object: cropGuide, tool: 'crop' } as never,
      minDrawSize: 8,
    });
    const object = { id: 'shape' };
    const completeResult = completeEditorDrawSession({
      canvasDocumentSize: { height: 200, width: 300 },
      drawSession: { object, tool: 'arrow' } as never,
      minDrawSize: 8,
    });

    expect(mocks.normalizeEditorCropSelectionMock).toHaveBeenCalledWith(
      { height: 120, left: 10, top: 20, width: 60 },
      { height: 200, width: 300 }
    );
    expect(cropResult).toEqual({
      cropGuide,
      cropSelection: { height: 80, left: 10, top: 20, width: 120 },
      drawSession: null,
      kind: 'crop',
    });
    expect(completeResult).toEqual({
      completedTool: 'arrow',
      drawSession: null,
      kind: 'complete',
      object,
    });
  });
}

function registerTextCompletionSuite() {
  it('completes text sessions through the shared text layout seam', () => {
    const object = { type: 'textbox' };

    const result = completeEditorDrawSession({
      canvasDocumentSize: { height: 200, width: 300 },
      drawSession: {
        lastPoint: { x: 36, y: 32 },
        object,
        start: { x: 10, y: 10 },
        tool: 'text',
      } as never,
      minDrawSize: 8,
    });

    expect(mocks.applyTextLayoutMock).toHaveBeenCalledWith(object, {
      layoutMode: 'fixed-width',
    });
    expect(result).toEqual({
      completedTool: 'text',
      drawSession: null,
      kind: 'complete',
      object,
    });
  });
}

describe('editor-controller-transient', () => {
  beforeEach(setupTransientMocks);
  runClearCropGuideSuite();
  runCancelCropDrawSessionSuite();
  registerCropStartDrawSessionTest();
  registerNonCropStartDrawSessionTest();
  runDiscardDrawSessionSuite();
  runCompleteDrawSessionSuite();
  registerTextCompletionSuite();
});
