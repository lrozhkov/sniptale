import { useEditorStore } from '../../../state/useEditorStore';
import { createTextObject } from '../../../objects/annotation/text/object';
import { resizeTextCallout } from '../../../objects/annotation/text/callout/resize';
import type { EditorControllerEventBindings } from '../types';

function createTextCreationSettings() {
  const { toolSettings } = useEditorStore.getState();

  return {
    ...toolSettings.text,
    calloutFormat: 'plain' as const,
    layoutMode: 'fixed-width' as const,
  };
}

export function handleTextMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const text = createTextObject({
    id: crypto.randomUUID(),
    initialInsertPending: true,
    labelIndex: bindings.nextLabelIndex('text'),
    left: point.x,
    top: point.y,
    settings: createTextCreationSettings(),
  });
  resizeTextCallout(text, 1, 1);
  bindings.startDrawSession('text', point, text);
}
