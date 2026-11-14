import { Group, type Canvas, type FabricObject } from 'fabric';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isEditorVectorDocumentData } from '../../../features/editor/document/vector-document';
import {
  isEditorVectorInstance,
  type EditorVectorDefinition,
} from '../../../features/editor/document/vector-element';
import {
  adoptEditorVectorRuntime,
  createEditorVectorRuntime,
  getEditorVectorDefinition,
} from '../../objects/vector-elements/runtime';
import { validateEditorVectorDefinition } from '../../objects/vector-elements/prepare';

const canvasDefinitions = new WeakMap<Canvas, Record<string, EditorVectorDefinition>>();

function visitObjects(objects: FabricObject[], visit: (object: FabricObject) => void): void {
  for (const object of objects) {
    visit(object);
    if (object instanceof Group && object.sniptaleType !== 'vector-element')
      visitObjects(object.getObjects(), visit);
  }
}

/** Collect the exact resource closure, including nested instances and Fabric clones. */
export function collectEditorVectorDefinitions(
  canvas: Canvas
): Record<string, EditorVectorDefinition> {
  const definitions: Record<string, EditorVectorDefinition> = {};
  const cached = canvasDefinitions.get(canvas);
  const bound = new Map<string, EditorVectorDefinition>();
  const vectors: Group[] = [];
  visitObjects(canvas.getObjects(), (object) => {
    if (object.sniptaleType !== 'vector-element') return;
    const instance = object.sniptaleVectorElement;
    if (!(object instanceof Group) || !isEditorVectorInstance(instance))
      throw new Error('Invalid vector element');
    vectors.push(object);
    const definition = getEditorVectorDefinition(object);
    if (definition) bound.set(definition.id, definition);
  });
  // A clone can precede its bound source in layer order before the first capture.
  for (const object of vectors) {
    const instance = object.sniptaleVectorElement!;
    const definition =
      getEditorVectorDefinition(object) ??
      bound.get(instance.definitionId) ??
      cached?.[instance.definitionId];
    if (!definition || definition.id !== instance.definitionId)
      throw new Error('Missing vector definition');
    definitions[definition.id] = definition;
  }
  // Definitions are immutable; the canvas lifetime also admits subsequently duplicated groups.
  canvasDefinitions.set(canvas, definitions);
  return definitions;
}

/** Validate every resource and build projections before the accepted canvas changes. */
export async function prepareEditorVectorCanvasLoad(
  canvasJson: string,
  definitions: Record<string, EditorVectorDefinition> = {}
): Promise<{ canvasJson: string; definitions: Record<string, EditorVectorDefinition> }> {
  if (!isEditorVectorDocumentData(canvasJson, 4, definitions))
    throw new Error('Invalid vector document');
  const admitted: Record<string, EditorVectorDefinition> = {};
  for (const [id, value] of Object.entries(definitions))
    admitted[id] = await validateEditorVectorDefinition(value);
  const canvas: unknown = JSON.parse(canvasJson);
  async function expand(value: unknown): Promise<void> {
    if (!isRecord(value)) return;
    const instance = value['sniptaleVectorElement'];
    if (isEditorVectorInstance(instance)) {
      const runtime = await createEditorVectorRuntime(admitted[instance.definitionId], instance);
      try {
        const projection = runtime.toObject();
        const original = { ...value };
        // Preserve exact parent-relative geometry; only the derived artwork is rebuilt.
        Object.assign(value, projection, original, {
          objects: projection.objects,
          clipPath: projection.clipPath,
        });
      } finally {
        runtime.dispose();
      }
      return;
    }
    if (Array.isArray(value['objects'])) for (const child of value['objects']) await expand(child);
  }
  await expand(canvas);
  return { canvasJson: JSON.stringify(canvas), definitions: admitted };
}

/** Bind restored palettes and the canvas resource closure after Fabric hydration. */
export async function bindEditorVectorCanvas(
  canvas: Canvas,
  definitions: Record<string, EditorVectorDefinition>
): Promise<void> {
  const pending: Promise<void>[] = [];
  visitObjects(canvas.getObjects(), (object) => {
    if (object.sniptaleType !== 'vector-element') return;
    if (!(object instanceof Group) || !isEditorVectorInstance(object.sniptaleVectorElement))
      throw new Error('Invalid vector element');
    pending.push(
      adoptEditorVectorRuntime(
        object,
        definitions[object.sniptaleVectorElement.definitionId],
        object.sniptaleVectorElement
      )
    );
  });
  await Promise.all(pending);
  canvasDefinitions.set(canvas, definitions);
}
