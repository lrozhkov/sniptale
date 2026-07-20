import { useEditorStore } from '../../../state/useEditorStore';
import {
  createRichShapeToolDraft,
  markRichShapeToolOrigin,
  resolveActiveRichShapeToolSelection,
} from '../../tools/rich-shape-drawing';
import type { EditorControllerEventBindings } from '../types';

export function handleRichShapeToolMouseDown(
  bindings: EditorControllerEventBindings,
  activeTool: 'shapes-and-lines' | 'rough-shape' | 'shape-library',
  point: import('fabric').Point
): void {
  const source = bindings.getSource();
  if (!source) {
    return;
  }

  const selection = resolveActiveRichShapeToolSelection(
    activeTool,
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

  markRichShapeToolOrigin(draft.object, activeTool);
  bindings.startDrawSession(draft.tool, point, draft.object);
}
