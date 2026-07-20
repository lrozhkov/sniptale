import { Rect } from 'fabric';
import type { DrawSession } from '../core/types';

export function getActiveEditorCropRect(
  drawSession: DrawSession | null,
  cropGuide: Rect | null
): Rect | null {
  if (drawSession?.tool === 'crop' && drawSession.object instanceof Rect) {
    return drawSession.object;
  }

  return cropGuide;
}
