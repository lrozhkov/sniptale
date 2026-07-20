import type { EditorRichShapeStyle } from '../../../../features/editor/document/rich-shape';
import { DEFAULT_RICH_SHAPE_STYLE } from '../../../../features/editor/document/rich-shape';

export function createDefaultRichShapeStyle(): EditorRichShapeStyle {
  return {
    ...DEFAULT_RICH_SHAPE_STYLE,
    fill: { ...DEFAULT_RICH_SHAPE_STYLE.fill },
    line: { ...DEFAULT_RICH_SHAPE_STYLE.line },
  };
}
