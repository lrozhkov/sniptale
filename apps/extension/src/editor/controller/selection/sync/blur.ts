import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { getBlurSettings, isBlurObject } from '../../../objects/annotation/blur/object';

export function syncBlurSelectionSettings(object: FabricObject): void {
  if (!isBlurObject(object)) {
    return;
  }

  useEditorStore.getState().updateSelectionBlurSettings(getBlurSettings(object));
}
