import type { Point } from 'fabric';
import type {
  EditorArrowSettings,
  EditorShapeSettings,
} from '../../../../features/editor/document/types';
import type { EditorLineSettings } from '../../../../features/editor/document/line-types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import type { CropSelection, DrawSession } from '../../core/types';
import { updateRichShapeDraft } from '../../tools/rich-shape-drawing/resize';
import { updateShapeOrCropDrawSessionObject } from '../shape-updates/dispatch';
import { updateArrowDraft } from './arrow';
import { updateBlurDraft } from './blur';
import { resolveLineDraftSettings, updateLineDraft } from './line';
import { updateTextDraft } from './text';

export function updateEditorDrawSessionObject(
  drawSession: DrawSession,
  point: Point,
  arrowSettings: EditorArrowSettings,
  shapeSettings: EditorShapeSettings,
  blurSettings: EditorToolSettings['blur'],
  constrainProportions = false,
  lineSettings?: EditorLineSettings
): CropSelection | null {
  if (!drawSession.object) {
    return null;
  }

  if (drawSession.tool === 'arrow') {
    return updateArrowDraft(drawSession, point, arrowSettings);
  }

  if (drawSession.tool === 'line') {
    return updateLineDraft(drawSession, point, resolveLineDraftSettings(drawSession, lineSettings));
  }

  if (drawSession.tool === 'text') {
    return updateTextDraft(drawSession, point);
  }

  if (drawSession.tool === 'blur') {
    return updateBlurDraft(drawSession, point, blurSettings);
  }

  if (drawSession.tool === 'rich-shape') {
    return updateRichShapeDraft(drawSession, point, constrainProportions);
  }

  return updateShapeOrCropDrawSessionObject(drawSession, point, shapeSettings);
}
