import { useEditorStore } from '../../../state/useEditorStore';
import {
  createRichShapeToolDraft,
  markRichShapeToolOrigin,
  resolveActiveRichShapeToolSelection,
} from './index';
import type { EditorControllerEventBindings } from '../../events/types';

export function handleRichShapeToolMouseDown(
  bindings: EditorControllerEventBindings,
  point: import('fabric').Point
): void {
  const source = bindings.getSource();
  if (!source) {
    return;
  }

  const selection = resolveActiveRichShapeToolSelection(
    useEditorStore.getState().richShapeToolSelection
  );
  if (!selection) {
    return;
  }

  const draft = createRichShapeToolDraft({
    nextLabelIndex: (type) => bindings.nextLabelIndex(type),
    point,
    prepareObject: (object) => bindings.prepareObject(object),
    selection,
    source,
  });
  if (!draft) {
    return;
  }

  markRichShapeToolOrigin(draft.object, 'shape');
  bindings.startDrawSession(draft.tool, point, draft.object);
}
