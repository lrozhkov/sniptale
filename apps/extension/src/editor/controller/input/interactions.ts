import type { BaseBrush, FabricObject, Point } from 'fabric';
import type {
  EditorBrushSettings,
  EditorObjectType,
} from '../../../features/editor/document/types';
import { updateArrowPointOnDoubleClick } from '../../objects/arrow';
import { configureFreehandPath } from '../freehand';

export function configureEditorFreehandPath(options: {
  brush: BaseBrush | null | undefined;
  path: FabricObject;
  tool: Extract<EditorObjectType, 'pencil' | 'highlighter'>;
  labelIndex: number;
  settings: EditorBrushSettings;
}): void {
  configureFreehandPath(options);
}

export function updateEditorArrowOnDoubleClick(
  target: Parameters<typeof updateArrowPointOnDoubleClick>[0],
  point: Point
): void {
  updateArrowPointOnDoubleClick(target, point);
}
