import { Point, type Canvas, type FabricObject } from 'fabric';
import { createCropGuideRect, getEditorFreeCanvasBounds } from '../tools/crop';
import type { EditorControllerEventBindings } from '../events/types';
import type { EditorTool } from '../../../features/editor/document/types';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorCanvas } from '../../document/canvas-surface/render-region';
import { getEditorCanvasWorkspaceInsets } from '../../document/canvas-surface/editing-surface';

export function cropDown(
  bindings: EditorControllerEventBindings,
  canvas: Canvas,
  tool: EditorTool,
  event: { e: import('fabric').TPointerEvent; target?: FabricObject }
): boolean {
  if (tool !== 'crop' || !bindings.getCropSelectionMouseEnabled()) {
    return false;
  }

  if (isCropGuideTarget(bindings, event.target)) return false;
  const rawPoint = canvas.getScenePoint(event.e);
  const mode = useEditorStore.getState().canvasCropMode;
  const size = bindings.getCanvasDocumentSize();
  if (mode === 'expand' && canvas instanceof EditorCanvas) {
    canvas.extendWorkspaceToContain({
      left: rawPoint.x,
      top: rawPoint.y,
      right: rawPoint.x,
      bottom: rawPoint.y,
    });
  }
  const bounds =
    mode === 'crop'
      ? { left: 0, top: 0, right: size.width, bottom: size.height }
      : getEditorFreeCanvasBounds(
          size,
          canvas.getZoom(),
          getEditorCanvasWorkspaceInsets(canvas, size)
        );
  const point = new Point(
    Math.max(bounds.left, Math.min(bounds.right, rawPoint.x)),
    Math.max(bounds.top, Math.min(bounds.bottom, rawPoint.y))
  );
  const pointerId = 'pointerId' in event.e ? event.e.pointerId : null;
  bindings.startDrawSession('crop', point, createCropGuideRect(point), pointerId);
  return true;
}

function isCropGuideTarget(
  bindings: Pick<EditorControllerEventBindings, 'getCropGuide'>,
  target: FabricObject | undefined
): boolean {
  const cropGuide = bindings.getCropGuide();
  return Boolean(cropGuide && target === cropGuide);
}
