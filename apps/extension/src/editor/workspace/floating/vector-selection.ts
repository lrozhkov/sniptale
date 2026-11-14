import { Group } from 'fabric';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import {
  getEditorVectorAcceptedOpacity,
  getEditorVectorDefinition,
} from '../../objects/vector-elements/runtime';

export function useEditorVectorSelection() {
  const controller = useEditorController();
  const layers = useEditorStore((state) => state.layers),
    historyIndex = useEditorStore((state) => state.history.index);
  const objects = (controller.canvas?.getActiveObjects() ?? []).filter(
    (object): object is Group => object instanceof Group && object.sniptaleType === 'vector-element'
  );
  const first = objects[0],
    definition = first ? getEditorVectorDefinition(first) : undefined;
  const selectionKey = layers
    .filter((layer) => layer.selected)
    .map((layer) => layer.id)
    .join(':');
  const same =
    Boolean(definition) &&
    objects.every((object) => object.sniptaleVectorElement?.definitionId === definition?.id);
  return {
    controller,
    objects,
    first,
    definition,
    selectionKey,
    historyIndex,
    same,
    opacity: first ? getEditorVectorAcceptedOpacity(first) : 1,
    strokeScale: first?.sniptaleVectorElement?.overrides.strokeScale ?? 1,
  };
}
