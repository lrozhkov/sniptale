import type {
  EditorRichShapeArrowhead,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import type { RichShapePoint as Point } from './render-primitives';
import { createArrowheadObject } from './arrowhead-primitives';
import { createRoughArrowheadObjects } from './arrowhead-rough';
import type { RichShapeRenderableStyle } from './style/renderable';

export { createArrowheadObject } from './arrowhead-primitives';

export function createArrowheadObjects(
  arrowhead: EditorRichShapeArrowhead,
  tip: Point,
  from: Point,
  style: RichShapeRenderableStyle,
  shape: EditorRichShapeDocumentObject,
  seedOffset: number
) {
  if (!shape.rough.enabled) {
    const object = createArrowheadObject(arrowhead, tip, from, style);
    return object ? [object] : [];
  }
  if (arrowhead === 'none') {
    return [];
  }

  return createRoughArrowheadObjects(arrowhead, tip, from, style, shape, seedOffset);
}
