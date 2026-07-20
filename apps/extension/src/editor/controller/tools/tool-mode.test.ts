// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
  isUserObjectMock: vi.fn(() => true),
  PencilBrushMock: vi.fn(function PencilBrush(this: { canvas?: unknown }, canvas: unknown) {
    this.canvas = canvas;
  }),
}));
let storeState: {
  toolSettings: {
    highlighter: {
      color: string;
      opacity: number;
      shapeCorrection: 'off' | 'subtle' | 'strong';
      shadow: number;
      smoothingLevel: number;
      width: number;
    };
    pencil: {
      color: string;
      opacity: number;
      shapeCorrection: 'off' | 'subtle' | 'strong';
      shadow: number;
      smoothingLevel: number;
      width: number;
    };
    step: { alphabet: 'latin' | 'cyrillic'; type: 'number' | 'letter'; value: string };
  };
};

vi.mock('fabric', () => ({ PencilBrush: mocks.PencilBrushMock }));
vi.mock('../../state/useEditorStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/useEditorStore')>()),
  useEditorStore: { getState: () => storeState },
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    hexToRgba: mocks.hexToRgbaMock,
    isUserObject: mocks.isUserObjectMock,
  };
});
import { applyEditorToolMode } from './tool-mode';

function initializeStoreState() {
  storeState = {
    toolSettings: {
      highlighter: {
        color: '#ffff00',
        opacity: 0.4,
        shapeCorrection: 'off',
        shadow: 0,
        smoothingLevel: 7,
        width: 12,
      },
      pencil: {
        color: '#ff0000',
        opacity: 1,
        shapeCorrection: 'subtle',
        shadow: 0,
        smoothingLevel: 4,
        width: 4,
      },
      step: { alphabet: 'latin', type: 'number', value: '2' },
    },
  };
}

function registerCropGuideInteractivityTest() {
  it('keeps crop guides targetable so canvas crop selections can be moved and resized', () => {
    const object = { sniptaleId: 'annotation', sniptaleLocked: false, set: vi.fn() };
    const canvas = {
      defaultCursor: 'default',
      freeDrawingBrush: null,
      getActiveObjects: () => [],
      getObjects: () => [object],
      isDrawingMode: false,
      selection: true,
      skipTargetFind: true,
    };
    const clearCropSelection = vi.fn();
    applyEditorToolMode({
      activeTool: 'crop' as never,
      canvas: canvas as never,
      clearCropSelection,
      hasCropGuide: true,
    });
    expect(canvas.isDrawingMode).toBe(false);
    expect(canvas.selection).toBe(false);
    expect(canvas.skipTargetFind).toBe(false);
    expect(canvas.defaultCursor).toBe('crosshair');
    expect(object.set).toHaveBeenCalledWith({ evented: false, selectable: false });
    expect(clearCropSelection).not.toHaveBeenCalled();
  });
}

function registerStickySelectionInteractivityTests() {
  it('keeps only the current sticky selection interactive for non-select tools', () => {
    const selectedObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
    const otherObject = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn() };
    const canvas = {
      defaultCursor: 'default',
      freeDrawingBrush: null,
      getActiveObjects: () => [selectedObject],
      getObjects: () => [selectedObject, otherObject],
      isDrawingMode: false,
      selection: false,
      skipTargetFind: false,
    };
    applyEditorToolMode({
      activeTool: 'shapes-and-lines' as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: true,
    });

    expect(canvas.isDrawingMode).toBe(false);
    expect(canvas.skipTargetFind).toBe(false);
    expect(canvas.defaultCursor).toBe('crosshair');
    expect(selectedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
    expect(otherObject.set).toHaveBeenCalledWith({ evented: false, selectable: false });

    applyEditorToolMode({
      activeTool: 'line' as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: false,
    });
    expect(canvas.defaultCursor).toBe('crosshair');
  });
}

function registerSelectModeInteractivityTest() {
  it('restores normal select-mode interactivity for editable objects', () => {
    const unlockedObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
    const lockedObject = { sniptaleId: 'locked', sniptaleLocked: true, set: vi.fn() };
    const canvas = {
      defaultCursor: 'crosshair',
      freeDrawingBrush: null,
      getActiveObjects: () => [unlockedObject],
      getObjects: () => [unlockedObject, lockedObject],
      isDrawingMode: false,
      selection: false,
      skipTargetFind: true,
    };

    applyEditorToolMode({
      activeTool: 'select' as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: false,
    });
    expect(canvas.selection).toBe(true);
    expect(canvas.skipTargetFind).toBe(false);
    expect(unlockedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
    expect(lockedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
  });
}

function registerFreehandBrushRestoreTest() {
  it('restores drawing mode and brush preview once sticky freehand selection clears', () => {
    const object = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
    const canvas = {
      defaultCursor: 'default',
      freeDrawingBrush: null,
      getActiveObjects: () => [],
      getObjects: () => [object],
      isDrawingMode: false,
      selection: false,
      skipTargetFind: false,
    };
    const clearCropSelection = vi.fn();

    applyEditorToolMode({
      activeTool: 'highlighter' as never,
      canvas: canvas as never,
      clearCropSelection,
      hasCropGuide: true,
    });

    expect(canvas.isDrawingMode).toBe(true);
    expect(canvas.skipTargetFind).toBe(false);
    expect(canvas.freeDrawingBrush).toMatchObject({
      color: '#ffff00:0.4',
      decimate: 0.7,
      width: 12,
    });
    expect(object.set).toHaveBeenCalledWith({ evented: false, selectable: false });
    expect(clearCropSelection).toHaveBeenCalledOnce();
  });
}

function registerFreehandSelectionInteractivityTest() {
  it('keeps freehand tools interactive on the current selection before restoring drawing mode', () => {
    const selectedObject = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
    const otherObject = { sniptaleId: 'other', sniptaleLocked: false, set: vi.fn() };
    const activeObjects = [selectedObject];
    const canvas = {
      defaultCursor: 'crosshair',
      freeDrawingBrush: null,
      getActiveObjects: () => activeObjects,
      getObjects: () => [selectedObject, otherObject],
      isDrawingMode: true,
      selection: false,
      skipTargetFind: false,
    };

    applyEditorToolMode({
      activeTool: 'highlighter' as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: false,
    });

    expect(canvas.isDrawingMode).toBe(false);
    expect(canvas.skipTargetFind).toBe(false);
    expect(selectedObject.set).toHaveBeenCalledWith({ evented: true, selectable: true });
    expect(otherObject.set).toHaveBeenCalledWith({ evented: false, selectable: false });

    activeObjects.splice(0, activeObjects.length);
    applyEditorToolMode({
      activeTool: 'highlighter' as never,
      canvas: canvas as never,
      clearCropSelection: vi.fn(),
      hasCropGuide: false,
    });

    expect(canvas.isDrawingMode).toBe(true);
  });
}

function registerSuspendedToolModeTest() {
  it('suspends drawing and selection without creating a brush', () => {
    const object = { sniptaleId: 'selected', sniptaleLocked: false, set: vi.fn() };
    const canvas = {
      defaultCursor: 'crosshair',
      freeDrawingBrush: null,
      getActiveObjects: () => [object],
      getObjects: () => [object],
      isDrawingMode: true,
      selection: true,
      skipTargetFind: false,
    };
    const clearCropSelection = vi.fn();

    applyEditorToolMode({
      activeTool: 'highlighter' as never,
      canvas: canvas as never,
      clearCropSelection,
      enabled: false,
      hasCropGuide: true,
    });

    expect(canvas.isDrawingMode).toBe(false);
    expect(canvas.selection).toBe(false);
    expect(canvas.skipTargetFind).toBe(true);
    expect(canvas.defaultCursor).toBe('default');
    expect(canvas.freeDrawingBrush).toBeNull();
    expect(object.set).toHaveBeenCalledWith({ evented: false, selectable: false });
    expect(mocks.PencilBrushMock).not.toHaveBeenCalled();
    expect(clearCropSelection).toHaveBeenCalledOnce();
  });

  it('ignores missing canvas while applying a tool mode', () => {
    const clearCropSelection = vi.fn();

    applyEditorToolMode({
      activeTool: 'rough-shape' as never,
      canvas: null,
      clearCropSelection,
      hasCropGuide: true,
    });

    expect(clearCropSelection).not.toHaveBeenCalled();
  });
}

describe('editor-controller tool mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeStoreState();
  });

  registerCropGuideInteractivityTest();
  registerStickySelectionInteractivityTests();
  registerSelectModeInteractivityTest();
  registerFreehandBrushRestoreTest();
  registerFreehandSelectionInteractivityTest();
  registerSuspendedToolModeTest();
});
