import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';

interface DrawingFrameRenderable {
  readonly object: DrawingObject;
}

export function resolveDrawingFrameRenderables(
  objects: readonly DrawingObject[],
  draft: PointerDraft | null
): DrawingFrameRenderable[] {
  let movedById: Map<string, DrawingObject> | null = null;
  if (draft?.kind === 'move-selection') {
    movedById = new Map();
    for (const object of draft.objects) {
      if (!movedById.has(object.id)) movedById.set(object.id, object);
    }
  }
  const committed = objects.map((object) => ({
    object:
      draft?.kind === 'move-selection'
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
