/* eslint-disable max-lines-per-function --
   exact tool-mode proof keeps raster and adjacent free-draw branches in one matrix */
import { describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { applyEditorToolMode } from './tool-mode';

function createCanvas() {
  return {
    getActiveObjects: vi.fn(() => []),
    getObjects: vi.fn(() => []),
    isDrawingMode: true,
    selection: true,
    skipTargetFind: true,
    defaultCursor: 'default',
  };
}

describe('editor-controller/tool-mode raster tools', () => {
  it('keeps raster tools on canonical active-layer cursors without hover-target fallback', () => {
    const editable = {
      hasControls: true,
      hoverCursor: 'move',
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      moveCursor: 'move',
      sniptaleId: 'layer-1',
      sniptaleLocked: false,
      set: vi.fn(),
      visible: true,
    };
    const canvas = {
      ...createCanvas(),
      getObjects: vi.fn(() => [editable]),
    };
    const clearCropSelection = vi.fn();
    useEditorStore.setState({
      rasterTarget: {
        status: 'ready',
        layerId: 'layer-1',
        layerName: 'Layer 1',
      },
    });

    canvas.getActiveObjects = vi.fn(() => [editable]) as never;
    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'selection',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.selection).toBe(false);
    expect(canvas.skipTargetFind).toBe(false);
    expect(canvas.defaultCursor).toBe('crosshair');
    expect(editable.set).toHaveBeenCalledWith(
      expect.objectContaining({
        evented: true,
        hasControls: false,
        hoverCursor: 'crosshair',
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        moveCursor: 'crosshair',
        selectable: false,
      })
    );

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'brush',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.defaultCursor).toBe('crosshair');
    expect(editable.set).toHaveBeenCalledWith(
      expect.objectContaining({ hoverCursor: 'crosshair' })
    );

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'eraser',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.defaultCursor).toBe('none');
    expect(editable.set).toHaveBeenCalledWith(expect.objectContaining({ hoverCursor: 'none' }));

    useEditorStore.setState({
      rasterTarget: {
        status: 'missing',
        layerId: null,
        layerName: null,
      },
    });
    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'fill',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.defaultCursor).toBe('not-allowed');
  });

  it('keeps unlocked raster hover targets actionable when no active layer is selected', () => {
    const editable = {
      hasControls: true,
      hoverCursor: 'move',
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      moveCursor: 'move',
      sniptaleId: 'source-image-layer',
      sniptaleLocked: false,
      set: vi.fn(),
      visible: true,
    };
    const canvas = {
      ...createCanvas(),
      getActiveObjects: vi.fn(() => []),
      getObjects: vi.fn(() => [editable]),
    };
    useEditorStore.setState({
      rasterTarget: {
        status: 'missing',
        layerId: null,
        layerName: null,
      },
    });

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'fill',
      hasCropGuide: false,
      clearCropSelection: vi.fn(),
    });

    expect(canvas.defaultCursor).toBe('not-allowed');
    expect(editable.set).toHaveBeenCalledWith(
      expect.objectContaining({
        evented: true,
        hoverCursor: 'crosshair',
        moveCursor: 'crosshair',
        selectable: false,
      })
    );
  });

  it('restores transform ownership after leaving a raster tool', () => {
    const editable = {
      hasControls: true,
      hoverCursor: 'pointer',
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      moveCursor: 'grab',
      sniptaleId: 'layer-1',
      sniptaleLocked: false,
      set: vi.fn(),
      visible: true,
    };
    const canvas = {
      ...createCanvas(),
      getActiveObjects: vi.fn(() => [editable]),
      getObjects: vi.fn(() => [editable]),
    };

    useEditorStore.setState({
      rasterTarget: {
        status: 'ready',
        layerId: 'layer-1',
        layerName: 'Layer 1',
      },
    });

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'eraser',
      hasCropGuide: false,
      clearCropSelection: vi.fn(),
    });
    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'select',
      hasCropGuide: false,
      clearCropSelection: vi.fn(),
    });

    expect(editable.set).toHaveBeenCalledWith(
      expect.objectContaining({
        hasControls: true,
        hoverCursor: 'pointer',
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: false,
        lockScalingY: false,
        moveCursor: 'grab',
      })
    );
    expect(editable.set).toHaveBeenLastCalledWith({ evented: true, selectable: true });
  });

  it('covers disabled, select, text, and free-drawing tool branches', () => {
    const editable = {
      sniptaleId: 'layer-1',
      sniptaleLocked: false,
      set: vi.fn(),
      visible: true,
    };
    const canvas = {
      ...createCanvas(),
      freeDrawingBrush: null,
      getActiveObjects: vi.fn(() => []),
      getObjects: vi.fn(() => [editable]),
    } as ReturnType<typeof createCanvas> & {
      freeDrawingBrush: null;
      getActiveObjects: ReturnType<typeof vi.fn>;
      getObjects: ReturnType<typeof vi.fn>;
    };
    const clearCropSelection = vi.fn();

    useEditorStore.setState({
      toolSettings: {
        ...useEditorStore.getState().toolSettings,
        pencil: { ...useEditorStore.getState().toolSettings.pencil, color: '#111111' },
      },
    });

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'pencil',
      hasCropGuide: true,
      clearCropSelection,
    });
    expect(canvas.isDrawingMode).toBe(true);

    canvas.getActiveObjects = vi.fn(() => [editable]) as never;
    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'text',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.defaultCursor).toBe('text');

    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'select',
      hasCropGuide: false,
      clearCropSelection,
    });
    expect(canvas.selection).toBe(true);

    clearCropSelection.mockClear();
    applyEditorToolMode({
      canvas: canvas as never,
      activeTool: 'crop',
      enabled: false,
      hasCropGuide: true,
      clearCropSelection,
    });
    expect(canvas.skipTargetFind).toBe(true);
    expect(clearCropSelection).not.toHaveBeenCalled();
  });
});
