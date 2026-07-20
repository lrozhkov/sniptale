import { useEditorStore } from '../../../state/useEditorStore';
import { createStepGroup } from '../../../objects/annotation/step';
import type { EditorControllerEventBindings } from '../types';

export function handleStepMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const step = createStepGroup({
    id: crypto.randomUUID(),
    labelIndex: bindings.nextLabelIndex('step'),
    left: point.x,
    top: point.y,
    settings: useEditorStore.getState().toolSettings.step,
  });
  bindings.addObject(step);
  bindings.advanceStepValue();
}
