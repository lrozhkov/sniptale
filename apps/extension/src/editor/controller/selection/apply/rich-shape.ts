import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { updateRichShapeObjectStyle } from '../../../objects/rich-shape';

export function applyRichShapeSettings(
  objects: FabricObject[],
  selectionToolSettings: EditorToolSettings
): void {
  objects.forEach((object) => updateRichShapeObjectStyle(object, selectionToolSettings));
}
