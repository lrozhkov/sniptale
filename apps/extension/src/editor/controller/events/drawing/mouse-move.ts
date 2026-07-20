import type { TPointerEvent as PointerEvent } from 'fabric';
import { handleEditorDrawMouseMove } from '../../draw-workflow';
import { handleRasterToolMouseMove } from '../../raster-tools/interactions/move';
import type { DrawingEventBindings } from './types';

export function createMouseMoveHandler(bindings: DrawingEventBindings) {
  return (event: { e: PointerEvent }) => {
    const canvas = bindings.getCanvas();
    if (canvas && handleRasterToolMouseMove(bindings, { canvas, event })) {
      return;
    }

    const drawSession = bindings.getDrawSession();
    if (!canvas || !drawSession?.object) {
      return;
    }

    const point = canvas.getScenePoint(event.e);
    drawSession.lastPoint = point;
    bindings.setCropState(
      bindings.getCropGuide(),
      handleEditorDrawMouseMove({
        canvas,
        drawSession,
        cropSelection: bindings.getCropSelection(),
        point,
        constrainProportions: Boolean(event.e.shiftKey),
      })
    );
  };
}
