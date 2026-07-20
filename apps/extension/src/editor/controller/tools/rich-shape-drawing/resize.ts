import type { FabricObject, Point } from 'fabric';
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import { resizeRichShapeObjectToBounds } from '../../../objects/rich-shape';
import type { DrawSession } from '../../core/types';
import {
  createProportionalRectDraftBounds,
  createRectDraftBounds,
} from '../../drawing/shape-updates/bounds';

type RichShapeDraftObject = FabricObject & {
  sniptaleRichShape?: {
    geometry?: { viewBox?: { width: number; height: number } };
    source?: { itemId?: string | null };
  };
};

function resolveRichShapeDraftAspectRatio(object: FabricObject): number {
  const richShape = object as RichShapeDraftObject;
  const geometry =
    richShape.sniptaleRichShape?.geometry ??
    getEditorBuiltInShapeEntry(richShape.sniptaleRichShape?.source?.itemId ?? '')?.geometry;
  const viewBox = geometry?.viewBox;
  return viewBox && viewBox.width > 0 && viewBox.height > 0 ? viewBox.width / viewBox.height : 1;
}

export function updateRichShapeDraft(
  drawSession: DrawSession,
  point: Point,
  constrainProportions = false
): null {
  if (drawSession.tool !== 'rich-shape' || !drawSession.object) {
    return null;
  }

  const bounds = constrainProportions
    ? createProportionalRectDraftBounds(
        drawSession.start,
        point,
        resolveRichShapeDraftAspectRatio(drawSession.object)
      )
    : createRectDraftBounds(drawSession.start, point);
  resizeRichShapeObjectToBounds(drawSession.object, bounds);
  return null;
}
