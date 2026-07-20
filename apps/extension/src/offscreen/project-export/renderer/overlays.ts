import {
  type VideoProjectShapeClip,
  type VideoProjectTextClip,
} from '../../../features/video/project/types/model';
import { drawTextCompositionLayer } from '../../../features/video/composition/draw/overlays';
import { drawShapeCompositionLayer } from '../../../features/video/composition/draw/shape';

export function drawTextClip(
  context: CanvasRenderingContext2D,
  clip: VideoProjectTextClip,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  drawTextCompositionLayer(context, clip, x, y, width, height);
}

export function drawShapeClip(
  context: CanvasRenderingContext2D,
  clip: VideoProjectShapeClip,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  drawShapeCompositionLayer(context, clip, x, y, width, height);
}
