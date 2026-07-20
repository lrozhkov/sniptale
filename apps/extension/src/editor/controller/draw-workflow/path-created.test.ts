import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configureEditorFreehandPathMock: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      toolSettings: {
        arrow: { color: '#fff', width: 4 },
        highlighter: { opacity: 0.4, shapeCorrection: 'off', smoothingLevel: 4 },
        pencil: { opacity: 1, shapeCorrection: 'subtle', smoothingLevel: 4 },
      },
    }),
  },
}));
vi.mock('../input/interactions', () => ({
  configureEditorFreehandPath: mocks.configureEditorFreehandPathMock,
  updateEditorArrowOnDoubleClick: vi.fn(),
}));
vi.mock('../freehand', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../freehand')>()),
  EditorFreehandBrush: vi.fn(),
  applyFreehandSettingsToObject: vi.fn(),
  configureFreehandPath: vi.fn(),
  configureLiveFreehandBrush: vi.fn(),
  consumeCommittedFreehandPoints: vi.fn(),
  consumeCommittedFreehandStrokeSamples: vi.fn(),
  getBrushDecimate: vi.fn(),
  parseFreehandPointsJson: vi.fn(),
  readFreehandColorInput: vi.fn(),
  readFreehandDynamicWidth: vi.fn(),
  readFreehandSamplePoints: vi.fn(),
  readFreehandShadowAngle: vi.fn(),
  readFreehandShadowColor: vi.fn(),
  readFreehandSmoothingLevel: vi.fn(),
  readFreehandWidth: vi.fn(),
  recoverFreehandPointsFromPath: vi.fn(),
  serializeFreehandPoints: vi.fn(),
}));

import { handleEditorPathCreated } from './path';

function registerHighlighterPathCreationTest() {
  it('configures freehand paths and keeps the active annotation tool sticky', () => {
    const canvas = {
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };
    const path = { id: 'path-1' };
    const prepareObject = vi.fn();
    const commitHistory = vi.fn();
    const syncRuntimeState = vi.fn();

    handleEditorPathCreated({
      activeTool: 'highlighter',
      canvas: canvas as never,
      commitHistory,
      nextLabelIndex: () => 7,
      path: path as never,
      prepareObject,
      syncRuntimeState,
    });

    expect(mocks.configureEditorFreehandPathMock).toHaveBeenCalledWith({
      brush: null,
      labelIndex: 7,
      path,
      settings: { opacity: 0.4, shapeCorrection: 'off', smoothingLevel: 4 },
      tool: 'highlighter',
    });
    expect(prepareObject).toHaveBeenCalledWith(path);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
    expect(canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(syncRuntimeState).toHaveBeenCalledOnce();
  });
}

function registerNullCanvasPathCreationTest() {
  it('uses pencil settings and no-ops when the canvas is missing', () => {
    handleEditorPathCreated({
      activeTool: 'pencil',
      canvas: null,
      commitHistory: vi.fn(),
      nextLabelIndex: () => 3,
      path: { id: 'path-2' } as never,
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    });

    expect(mocks.configureEditorFreehandPathMock).not.toHaveBeenCalled();
  });
}

function registerPencilPathCreationTest() {
  it('configures pencil paths without selecting the created object', () => {
    const path = { id: 'path-3' };
    const prepareObject = vi.fn();
    const canvas = {
      discardActiveObject: vi.fn(),
      requestRenderAll: vi.fn(),
    };

    handleEditorPathCreated({
      activeTool: 'pencil',
      canvas: canvas as never,
      commitHistory: vi.fn(),
      nextLabelIndex: () => 3,
      path: path as never,
      prepareObject,
      syncRuntimeState: vi.fn(),
    });

    expect(prepareObject).toHaveBeenCalledWith(path);
    expect(canvas.discardActiveObject).toHaveBeenCalledOnce();
  });
}

describe('editor-controller draw workflow path creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerHighlighterPathCreationTest();
  registerNullCanvasPathCreationTest();
  registerPencilPathCreationTest();
});
