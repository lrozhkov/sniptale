import { Group, type Canvas, type FabricObject } from 'fabric';
import type { EditorVectorDefinition } from '../../../../../features/editor/document/vector-element';
import { collectEditorVectorDefinitions } from '../../../document/vector-elements';
import {
  adoptEditorVectorRuntime,
  getEditorVectorDefinition,
} from '../../../../objects/vector-elements/runtime';

/** Capture the selected resource closure before cloning can outlive its source objects. */
export function collectSelectionVectorDefinitions(
  canvas: Canvas,
  objects: readonly FabricObject[]
): Record<string, EditorVectorDefinition> {
  const definitions: Record<string, EditorVectorDefinition> = {};
  let cached: Record<string, EditorVectorDefinition> | undefined;
  function visit(object: FabricObject): void {
    if (!(object instanceof Group)) return;
    if (object.sniptaleType === 'vector-element') {
      const instance = object.sniptaleVectorElement;
      if (!instance) throw new Error('Missing vector instance');
      let definition = getEditorVectorDefinition(object);
      if (!definition) {
        cached ??= collectEditorVectorDefinitions(canvas);
        definition = cached[instance.definitionId];
      }
      if (!definition) throw new Error('Missing vector definition');
      definitions[definition.id] = definition;
    } else object.getObjects().forEach(visit);
  }
  objects.forEach(visit);
  return definitions;
}

/** Restore cached paint bindings on explicit clone preparation, including grouped instances. */
export async function bindClonedVectorResources(
  objects: readonly FabricObject[],
  definitions: Record<string, EditorVectorDefinition>
): Promise<void> {
  for (const object of objects) {
    if (!(object instanceof Group)) continue;
    if (object.sniptaleType === 'vector-element') {
      const instance = object.sniptaleVectorElement;
      if (!instance) throw new Error('Missing vector instance');
      if (!getEditorVectorDefinition(object))
        await adoptEditorVectorRuntime(object, definitions[instance.definitionId], instance);
    } else await bindClonedVectorResources(object.getObjects(), definitions);
  }
}
