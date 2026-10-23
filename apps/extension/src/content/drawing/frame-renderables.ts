import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';

interface DrawingFrameRenderable {
  readonly object: DrawingObject;
}

export type DrawingVisualLayer =
  | { kind: 'ink'; objects: DrawingObject[] }
  | { kind: 'text'; object: Extract<DrawingObject, { kind: 'text' }> }
  | { kind: 'blur'; object: Extract<DrawingObject, { kind: 'blur' }> };

export function resolveDrawingVisualLayers(
  objects: readonly DrawingObject[],
  draft: PointerDraft | null
): DrawingVisualLayer[] {
  const layers: DrawingVisualLayer[] = [{ kind: 'ink', objects: [] }];
  for (const { object } of resolveDrawingFrameRenderables(objects, draft)) {
    if (object.kind === 'text') {
      layers.push({ kind: 'text', object });
    } else if (object.kind === 'blur') {
      layers.push({ kind: 'blur', object });
    } else {
      const previous = layers.at(-1);
      if (previous?.kind === 'ink') previous.objects.push(object);
      else layers.push({ kind: 'ink', objects: [object] });
    }
  }
  return layers;
}

export function resolveDrawingFrameRenderables(
  objects: readonly DrawingObject[],
  draft: PointerDraft | null
): DrawingFrameRenderable[] {
  let movedById: Map<string, DrawingObject> | null = null;
  if (draft?.kind === 'move-selection' || draft?.kind === 'rotate-selection') {
    movedById = new Map();
    for (const object of draft.objects) {
      if (!movedById.has(object.id)) movedById.set(object.id, object);
    }
  }
  const committed = objects.map((object) => ({
    object:
      draft?.kind === 'move-selection' || draft?.kind === 'rotate-selection'
        ? (movedById?.get(object.id) ?? object)
        : draft &&
            draft.kind !== 'create' &&
            draft.kind !== 'marquee' &&
            draft.object.id === object.id
          ? draft.object
          : object,
  }));
  return draft?.kind === 'create' ? [...committed, { object: draft.object }] : committed;
}
