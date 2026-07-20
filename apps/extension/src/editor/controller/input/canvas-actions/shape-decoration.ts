import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { getEditorShapeSettings } from '../../../../features/editor/document/shape-settings';
import { type EditorObjectType } from '../../../../features/editor/document/types';
import { applyShapeSettings } from '../../../objects/shape-style';
import { createObjectLabel } from '../../../document/model';

export function decorateEditorShape(
  object: FabricObject,
  type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>,
  nextLabelIndex: (type: Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>) => number
): void {
  const settings = getEditorShapeSettings(useEditorStore.getState().toolSettings, type);
  object.sniptaleId = crypto.randomUUID();
  object.sniptaleType = type;
  object.sniptaleRole = 'annotation';
  object.sniptaleLabel = createObjectLabel(type, nextLabelIndex(type));
  applyShapeSettings(object, type, settings);
}
