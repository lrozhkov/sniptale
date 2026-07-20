import type { Canvas } from 'fabric';
import { hexToRgba } from '../../document/model';
import { getRasterMaskBounds } from '../raster/selection';
import { resolveRasterOverlayObject } from '../raster/object';
import type { EditorRasterToolSessionState } from './types';
import { drawOverlayDashedRect } from './overlay-primitives';

const overlayFill = hexToRgba('#2563eb', 0.18);

export function drawSelectionMask(args: {
  canvas: Canvas | null;
  context: CanvasRenderingContext2D;
  session: EditorRasterToolSessionState;
}) {
  const reference = args.session.selection?.reference;
  if (!reference) {
    return;
  }
  const targetObject = resolveRasterOverlayObject(args.canvas, reference);
  const sceneBounds = targetObject?.getBoundingRect();
  if (!sceneBounds || !args.session.selection) {
    return;
  }

  args.context.save();
  args.context.globalAlpha = 1;
  args.context.drawImage(
    args.session.selection.maskCanvas,
    sceneBounds.left,
    sceneBounds.top,
    sceneBounds.width,
    sceneBounds.height
  );
  args.context.globalCompositeOperation = 'source-in';
  args.context.fillStyle = overlayFill;
  args.context.fillRect(sceneBounds.left, sceneBounds.top, sceneBounds.width, sceneBounds.height);
  args.context.restore();

  const maskBounds = getRasterMaskBounds(args.session.selection.maskCanvas);
  if (!maskBounds) {
    return;
  }

  drawOverlayDashedRect(args.context, {
    left:
      sceneBounds.left +
      (maskBounds.left / args.session.selection.maskCanvas.width) * sceneBounds.width,
    top:
      sceneBounds.top +
      (maskBounds.top / args.session.selection.maskCanvas.height) * sceneBounds.height,
    width: (maskBounds.width / args.session.selection.maskCanvas.width) * sceneBounds.width,
    height: (maskBounds.height / args.session.selection.maskCanvas.height) * sceneBounds.height,
  });
}
