import type { Point } from 'fabric';
import { Rect } from 'fabric';
import type { CropSelection } from '../core/types';
import {
  EDITOR_CANVAS_CROP_GUIDE_FILL,
  EDITOR_CANVAS_CROP_GUIDE_STROKE,
} from '../../color/palette/constants';

export function createCropGuideRect(point: Point): Rect {
  const crop = new Rect({
    left: point.x,
    top: point.y,
    width: 1,
    height: 1,
    fill: EDITOR_CANVAS_CROP_GUIDE_FILL,
    stroke: EDITOR_CANVAS_CROP_GUIDE_STROKE,
    strokeWidth: 2,
    strokeDashArray: [6, 4],
    selectable: false,
    evented: false,
    hasRotatingPoint: false,
    lockRotation: true,
    originX: 'left',
    originY: 'top',
  });
  crop.sniptaleRole = 'crop-guide';
  crop.sniptaleType = 'rectangle';
  crop.sniptaleCropGuideMode = 'selection';
  return crop;
}

export function isEditorCropGuide(object: unknown): object is Rect {
  return object instanceof Rect && object.sniptaleRole === 'crop-guide';
}

export function configureCropGuideForEditing(cropGuide: Rect): void {
  cropGuide.set({
    selectable: true,
    evented: true,
    hasRotatingPoint: false,
    lockRotation: true,
  });
  cropGuide.setControlsVisibility?.({ mtr: false });
  cropGuide.setCoords();
}

export function applyCropGuideSelection(
  cropGuide: Rect,
  crop: CropSelection,
  mode: 'preview' | 'selection'
): void {
  cropGuide.set({
    left: crop.left,
    top: crop.top,
    width: Math.max(1, crop.width),
    height: Math.max(1, crop.height),
    scaleX: 1,
    scaleY: 1,
  });
  cropGuide.sniptaleCropGuideMode = mode;
  configureCropGuideForEditing(cropGuide);
}
