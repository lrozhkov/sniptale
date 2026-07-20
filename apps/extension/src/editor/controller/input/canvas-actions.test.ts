import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyShapeSettings: vi.fn(),
  createObjectLabel: vi.fn(() => 'rectangle-1'),
  getActiveEditorCropRect: vi.fn(),
  setCropReady: vi.fn(),
  startEditorDrawSession: vi.fn(),
}));

vi.mock('../../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      setCropReady: mocks.setCropReady,
      toolSettings: {
        ellipse: { strokeColor: '#0000ff' },
        rectangle: { strokeColor: '#000', strokeWidth: 3 },
      },
    }),
  },
}));

vi.mock('../../objects', async () => ({
  ...(await vi.importActual<typeof import('../../objects')>('../../objects')),
}));

vi.mock('../../objects/shape-style', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shape-style')>(
    '../../objects/shape-style'
  )),
  applyShapeSettings: mocks.applyShapeSettings,
}));

vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  createObjectLabel: mocks.createObjectLabel,
}));

vi.mock('../tools/crop', async () => ({
  ...(await vi.importActual<typeof import('../tools/crop')>('../tools/crop')),
  getActiveEditorCropRect: mocks.getActiveEditorCropRect,
}));

vi.mock('../transient', async () => ({
  ...(await vi.importActual<typeof import('../transient')>('../transient')),
  startEditorDrawSession: mocks.startEditorDrawSession,
}));

import {
  addEditorCanvasObject,
  cancelEditorTransientInteraction,
  decorateEditorShape,
  getEditorControllerActiveCropRect,
  startEditorControllerDrawSession,
} from './canvas-actions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });
});

it('cancels transient interactions and syncs runtime state when the canvas changes', () => {
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObjects: vi.fn(() => [{ id: 'active' }]),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const clearCropSelection = vi.fn();
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();
  const drawObject = { id: 'draw-object' };

  expect(
    cancelEditorTransientInteraction({
      activeTool: 'rectangle',
      canvas: canvas as never,
      clearCropSelection,
      cropGuide: { id: 'crop-guide' } as never,
      drawSession: { object: drawObject } as never,
      switchToSelectTool,
      syncRuntimeState,
    })
  ).toEqual({ changed: true, drawSession: null });

  expect(canvas.remove).toHaveBeenCalledWith(drawObject);
  expect(clearCropSelection).toHaveBeenCalledTimes(1);
  expect(canvas.discardActiveObject).toHaveBeenCalledTimes(1);
  expect(switchToSelectTool).toHaveBeenCalledTimes(1);
  expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
  expect(syncRuntimeState).toHaveBeenCalledTimes(1);
});

it('starts draw sessions and resolves crop rects through the transient owner', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const prepareObject = vi.fn();
  const object = {
    set: vi.fn(),
  };

  mocks.startEditorDrawSession.mockReturnValue({
    clearedExistingCropGuide: true,
    cropGuide: { id: 'guide-next' },
    cropSelection: { id: 'crop-selection' },
    drawSession: { id: 'draw-session' },
  });
  mocks.getActiveEditorCropRect.mockReturnValue({ id: 'active-crop' });

  expect(
    startEditorControllerDrawSession({
      canvas: canvas as never,
      cropGuide: { id: 'guide' } as never,
      object: object as never,
      prepareObject,
      start: { x: 1, y: 2 } as never,
      tool: 'rectangle',
    })
  ).toEqual({
    cropGuide: { id: 'guide-next' },
    cropSelection: { id: 'crop-selection' },
    drawSession: { id: 'draw-session' },
  });
  expect(mocks.setCropReady).toHaveBeenCalledWith(false);
  expect(prepareObject).toHaveBeenCalledWith(object);
  expect(canvas.add).toHaveBeenCalledWith(object);
  expect(canvas.requestRenderAll).toHaveBeenCalledTimes(1);
  expect(getEditorControllerActiveCropRect(null, null)).toEqual({ id: 'active-crop' });
});

it('decorates shapes and adds committed objects to the active canvas', () => {
  const canvas = {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
  const prepareObject = vi.fn();
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const object: {
    sniptaleId?: string;
    sniptaleLabel?: string;
    sniptaleRole?: string;
    sniptaleType?: string;
    set: ReturnType<typeof vi.fn>;
  } = {
    set: vi.fn(),
  };

  decorateEditorShape(object as never, 'rectangle', () => 1);
  expect(object.sniptaleId).toBe('uuid-1');
  expect(object.sniptaleType).toBe('rectangle');
  expect(object.sniptaleRole).toBe('annotation');
  expect(object.sniptaleLabel).toBe('rectangle-1');
  expect(mocks.applyShapeSettings).toHaveBeenCalledWith(
    object,
    'rectangle',
    expect.objectContaining({ strokeColor: '#000', strokeWidth: 3 })
  );

  addEditorCanvasObject({
    canvas: canvas as never,
    commitHistory,
    object: object as never,
    prepareObject,
    syncRuntimeState,
  });
  expect(canvas.setActiveObject).toHaveBeenCalledWith(object);
  expect(commitHistory).toHaveBeenCalledTimes(1);
  expect(syncRuntimeState).toHaveBeenCalledTimes(1);
});

it('returns early when canvas-dependent actions have no canvas owner', () => {
  expect(
    cancelEditorTransientInteraction({
      activeTool: 'select',
      canvas: null,
      clearCropSelection: vi.fn(),
      cropGuide: null,
      drawSession: null,
      switchToSelectTool: vi.fn(),
      syncRuntimeState: vi.fn(),
    })
  ).toEqual({ changed: false, drawSession: null });

  expect(
    startEditorControllerDrawSession({
      canvas: null,
      cropGuide: null,
      object: {} as never,
      prepareObject: vi.fn(),
      start: { x: 0, y: 0 } as never,
      tool: 'rectangle',
    })
  ).toBeNull();

  expect(
    addEditorCanvasObject({
      canvas: null,
      commitHistory: vi.fn(),
      object: {} as never,
      prepareObject: vi.fn(),
      syncRuntimeState: vi.fn(),
    })
  ).toBeUndefined();
});

it('leaves the canvas untouched when there is no transient interaction to cancel', () => {
  const canvas = {
    discardActiveObject: vi.fn(),
    getActiveObjects: vi.fn(() => []),
    remove: vi.fn(),
    requestRenderAll: vi.fn(),
  };
  const switchToSelectTool = vi.fn();
  const syncRuntimeState = vi.fn();

  expect(
    cancelEditorTransientInteraction({
      activeTool: 'select',
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      cropGuide: null,
      drawSession: null,
      switchToSelectTool,
      syncRuntimeState,
    })
  ).toEqual({ changed: false, drawSession: null });

  expect(canvas.remove).not.toHaveBeenCalled();
  expect(canvas.discardActiveObject).not.toHaveBeenCalled();
  expect(canvas.requestRenderAll).not.toHaveBeenCalled();
  expect(switchToSelectTool).not.toHaveBeenCalled();
  expect(syncRuntimeState).not.toHaveBeenCalled();
});
