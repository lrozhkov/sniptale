import { describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import {
  applyRasterInteractionPatch,
  resolveRasterCursor,
  restoreRasterInteractionPatch,
} from './tool-mode';

function createObject() {
  return {
    hasControls: true,
    hoverCursor: 'pointer',
    lockMovementX: false,
    lockMovementY: false,
    lockScalingX: false,
    lockScalingY: false,
    moveCursor: 'grab',
    set: vi.fn(),
  };
}

describe('raster-tools tool-mode interaction patch', () => {
  registerRasterCursorTest();
  registerRasterPatchRestoreTest();
  registerRasterPatchGuardTest();
});

function registerRasterCursorTest() {
  it('resolves raster cursors from active target state and active tool', () => {
    useEditorStore.setState({
      rasterTarget: { status: 'ready', layerId: 'layer-1', layerName: 'Layer 1' },
    });

    expect(resolveRasterCursor('selection')).toBe('crosshair');
    expect(resolveRasterCursor('fill')).toBe('crosshair');
    expect(resolveRasterCursor('eraser')).toBe('none');

    useEditorStore.setState({
      rasterTarget: { status: 'missing', layerId: null, layerName: null },
    });
    expect(resolveRasterCursor('eraser')).toBe('not-allowed');
  });
}

function registerRasterPatchRestoreTest() {
  it('temporarily removes Fabric transform ownership and restores the previous object state', () => {
    useEditorStore.setState({
      rasterTarget: { status: 'ready', layerId: 'layer-1', layerName: 'Layer 1' },
    });
    const object = createObject();

    applyRasterInteractionPatch(object as never, 'eraser', true);
    applyRasterInteractionPatch(object as never, 'fill', true);
    restoreRasterInteractionPatch(object as never);

    expect(object.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        evented: true,
        hasControls: false,
        hoverCursor: 'none',
        lockMovementX: true,
        lockMovementY: true,
        lockScalingX: true,
        lockScalingY: true,
        moveCursor: 'none',
        selectable: false,
      })
    );
    expect(object.set).toHaveBeenNthCalledWith(
      3,
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
  });
}

function registerRasterPatchGuardTest() {
  it('handles missing optional Fabric interaction fields and restore calls without snapshots', () => {
    useEditorStore.setState({
      rasterTarget: { status: 'ready', layerId: 'layer-1', layerName: 'Layer 1' },
    });
    const object = { set: vi.fn() };

    restoreRasterInteractionPatch(object as never);
    applyRasterInteractionPatch(object as never, 'selection', false);
    restoreRasterInteractionPatch(object as never);

    expect(object.set).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        evented: false,
        hasControls: false,
        hoverCursor: 'not-allowed',
        selectable: false,
      })
    );
    expect(object.set).toHaveBeenNthCalledWith(2, {});
  });
}
