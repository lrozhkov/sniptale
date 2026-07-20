import type { Canvas, FabricObject } from 'fabric';
import { isEditorRasterTargetActionableStatus } from '../../../state/raster-tools';
import { useEditorStore } from '../../../state/useEditorStore';
import { resolveRasterTargetState } from '../../raster/target';
import { resolveBrushCursorStatus } from '../brush';
import type { RasterInteractionTool } from './tool';

export function syncRasterPointerTarget(
  canvas: Canvas,
  activeTool: RasterInteractionTool,
  fallbackTarget?: FabricObject
): void {
  if (activeTool === 'brush') {
    const status = resolveBrushCursorStatus({
      canvas,
      ...(fallbackTarget === undefined ? {} : { fallbackTarget }),
    });
    useEditorStore.setState({
      rasterTarget:
        status === 'ready'
          ? {
              layerId: null,
              layerName: null,
              status: 'ready',
            }
          : {
              layerId: fallbackTarget?.sniptaleId ?? null,
              layerName: fallbackTarget?.sniptaleLabel ?? null,
              status,
            },
    });
    canvas.defaultCursor = status === 'ready' ? 'crosshair' : 'not-allowed';
    return;
  }

  const targetState = resolveRasterTargetState({ canvas, fallbackTarget });
  useEditorStore.setState({ rasterTarget: targetState.summary });
  canvas.defaultCursor = isEditorRasterTargetActionableStatus(targetState.summary.status)
    ? activeTool === 'eraser'
      ? 'none'
      : 'crosshair'
    : 'not-allowed';
}
