import type { FabricObject, Point } from 'fabric';
import { getEditorBuiltInShapeEntry } from '../../../../features/editor/document/rich-shape';
import { resizeRichShapeObjectToBounds } from '../../../objects/rich-shape';
import type { DrawSession } from '../../core/types';

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

  const deltaX = point.x - drawSession.start.x;
  const deltaY = point.y - drawSession.start.y;
  const ratio = resolveRichShapeDraftAspectRatio(drawSession.object);
  const width = constrainProportions
    ? Math.min(Math.abs(deltaX), Math.abs(deltaY) * ratio)
    : Math.abs(deltaX);
  const height = constrainProportions ? width / ratio : Math.abs(deltaY);
  const bounds = {
    left: deltaX < 0 ? drawSession.start.x - width : drawSession.start.x,
    top: deltaY < 0 ? drawSession.start.y - height : drawSession.start.y,
    width,
    height,
  };
  resizeRichShapeObjectToBounds(drawSession.object, bounds);
  return null;
}
