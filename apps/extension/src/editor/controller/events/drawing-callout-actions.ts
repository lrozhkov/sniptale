import { useEditorStore } from '../../state/useEditorStore';
import { createRichShapeCalloutObject } from '../../objects/rich-shape';
import type { EditorControllerEventBindings } from './types';

export function handleCalloutMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const object = createRichShapeCalloutObject({
    id: crypto.randomUUID(),
    labelIndex: bindings.nextLabelIndex('rich-shape'),
    left: point.x,
    settings: useEditorStore.getState().toolSettings.callout,
    top: point.y,
    width: 1,
    height: 1,
  });
  bindings.prepareObject(object);
  bindings.startDrawSession('rich-shape', point, object);
}
