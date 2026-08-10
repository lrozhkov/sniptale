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
      draft?.kind === 'move-selection'
        ? (draft.objects.find((candidate) => candidate.id === object.id) ?? object)
        : draft &&
            draft.kind !== 'create' &&
            draft.kind !== 'marquee' &&
            draft.object.id === object.id
          ? draft.object
          : object,
    preview: false,
  }));
  return draft?.kind === 'create'
    ? [...committed, { object: draft.object, preview: true }]
    : committed;
}
