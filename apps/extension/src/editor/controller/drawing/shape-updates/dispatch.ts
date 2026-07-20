import type { Point } from 'fabric';
import type { EditorShapeSettings } from '../../../../features/editor/document/types';
import type { CropSelection, DrawSession } from '../../core/types';
import { updateDiamondDraft } from './diamond';
import { updateEllipseDraft } from './ellipse';
import { updateCropDraft, updateRectangleDraft } from './rect';

export function updateShapeOrCropDrawSessionObject(
  drawSession: DrawSession,
  point: Point,
  shapeSettings: EditorShapeSettings
): CropSelection | null {
  switch (drawSession.tool) {
    case 'rectangle':
      return updateRectangleDraft(drawSession, point, shapeSettings);
    case 'arrow':
      return null;
    case 'line':
      return null;
    case 'blur':
      return null;
    case 'crop':
      return updateCropDraft(drawSession, point);
    case 'ellipse':
      return updateEllipseDraft(drawSession, point);
    case 'diamond':
      return updateDiamondDraft(drawSession, point);
    case 'text':
      return null;
    case 'rich-shape':
      return null;
  }
}
