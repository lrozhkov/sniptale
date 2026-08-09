import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';

interface DrawingFrameRenderable {
  readonly object: DrawingObject;
  readonly preview: boolean;
}

export function resolveDrawingFrameRenderables(
  objects: readonly DrawingObject[],
  draft: PointerDraft | null
): DrawingFrameRenderable[] {
  const committed = objects.map((object) => ({
    object:
      draft && draft.kind !== 'create' && draft.object.id === object.id ? draft.object : object,
    preview: false,
  }));
  return draft?.kind === 'create'
    ? [...committed, { object: draft.object, preview: true }]
    : committed;
}
