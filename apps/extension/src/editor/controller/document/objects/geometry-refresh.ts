import { applyEditorDrawingSimplifyVisuals } from '../../../drawing/object/simplify';
import type { FabricObject } from 'fabric';
import { isBlurObject, updateBlurObject } from '../../../objects/annotation/blur/object';
import { readEditorDrawingObject } from '../../../drawing/object/metadata';
import { refreshEditorDrawingBlurObject } from '../../../drawing/object/blur';

export function refreshPreparedObjectGeometry(object: FabricObject): void {
  applyEditorDrawingSimplifyVisuals(object);
  if (isBlurObject(object)) {
    if (readEditorDrawingObject(object)?.kind === 'blur') {
      refreshEditorDrawingBlurObject(object);
    } else {
      updateBlurObject(object);
    }
  }
}
