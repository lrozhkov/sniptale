import type { FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { exportRichShapeDocumentObjectFromGroup } from '../document-export';
import { isRichShapeObject } from '../guards';
import { createRichShapeStylePatch } from '../style/patch';
import { applyRichShapeDocumentObjectToObject } from './apply';

export function updateRichShapeObjectStyle(
  object: FabricObject,
  selectionSettings: EditorToolSettings
): boolean {
  if (!isRichShapeObject(object)) {
    return false;
  }

  const nextShape: EditorRichShapeDocumentObject = {
    ...exportRichShapeDocumentObjectFromGroup(object),
    style: createRichShapeStylePatch(object.sniptaleRichShape, selectionSettings),
  };
  return applyRichShapeDocumentObjectToObject(object, nextShape);
}
