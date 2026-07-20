import type { Point } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { isBlurObject } from '../../../objects/annotation/blur/object/identity';
import { updateBlurObject } from '../../../objects/annotation/blur/object/update';
import type { DrawSession } from '../../core/types';
import { createRectDraftBounds } from '../shape-updates/bounds';

export function updateBlurDraft(
  drawSession: DrawSession,
  point: Point,
  blurSettings: EditorToolSettings['blur']
): null {
  const { object, start } = drawSession;
  if (!object || !isBlurObject(object)) {
    return null;
  }

  updateBlurObject(object, {
    bounds: createRectDraftBounds(start, point),
    settings: blurSettings,
  });
  return null;
}
