import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { getEditorShapeSettings } from '../../../../features/editor/document/shape-settings';
import { applyShapeSettings } from '../../../objects/shape-style';

export function applyShapeSelectionSettings(
  objects: FabricObject[],
  selectedType: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>,
  selectionToolSettings: EditorToolSettings
): void {
  const shape = getEditorShapeSettings(selectionToolSettings, selectedType);
  objects.forEach((object) => {
    applyShapeSettings(object, selectedType, shape);
  });
}
