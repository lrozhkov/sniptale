import { useEditorStore } from '../../../state/useEditorStore';
import { createBlurObject } from '../../../objects/annotation/blur/object';
import type { EditorControllerEventBindings } from '../types';

export function handleBlurMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const source = bindings.getSource();
  if (!source) {
    return;
  }

  const blur = createBlurObject({
    id: crypto.randomUUID(),
    labelIndex: bindings.nextLabelIndex('blur'),
    left: point.x,
    top: point.y,
    width: 1,
    height: 1,
    settings: useEditorStore.getState().toolSettings.blur,
    source,
  });
  bindings.prepareObject(blur);
  bindings.startDrawSession('blur', point, blur);
}
