import type { EditorShapeSettings } from '../../../features/editor/document/types';
import { restoreRectangleCenter } from './center';
import { clampRectangleGeometry, resolveRectangleScale } from './math';
import { resolveRectangleRenderRadius } from './radius';
import type { RectangleLike, RectangleVisualState } from './types';
import { captureRectangleVisualState } from './visual-state';

export function applyRectangleShapeGeometry(
  object: RectangleLike,
  settings: EditorShapeSettings,
  visualState: RectangleVisualState = captureRectangleVisualState(object)
): void {
  const scaleX = resolveRectangleScale(object.scaleX);
  const scaleY = resolveRectangleScale(object.scaleY);
  const width = clampRectangleGeometry(visualState.outerWidth, settings.strokeWidth, scaleX);
  const height = clampRectangleGeometry(visualState.outerHeight, settings.strokeWidth, scaleY);
  const radius = resolveRectangleRenderRadius(settings.radius, width, height);

  object.set({
    height,
    rx: radius,
    ry: radius,
    strokeUniform: true,
    width,
  });
  restoreRectangleCenter(object, visualState.center);
}
