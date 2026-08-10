import type { EditorRichShapeToolSelection } from '../../../state/types';

export function resolveActiveRichShapeToolSelection(
  selection: EditorRichShapeToolSelection | null
): EditorRichShapeToolSelection | null {
  return selection;
}
