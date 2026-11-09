import type { DrawingObject } from '../../features/drawing/public';
import type { PointerDraft } from './interaction';

interface DrawingFrameRenderable {
  readonly object: DrawingObject;
}

export type DrawingVisualLayer =
  | { kind: 'ink'; objects: DrawingObject[] }
  | { kind: 'text'; object: Extract<DrawingObject, { kind: 'text' }> }
  | {
      kind: 'simplify';
      object: Extract<DrawingObject, { kind: 'simplify' }>;
      previewFill?: boolean;
    }
  | { kind: 'blur'; object: Extract<DrawingObject, { kind: 'blur' }> };

function resolveVisualPreview(
  candidate: DrawingObject,
  original: DrawingObject | undefined,
  draft: PointerDraft | null
): { object: DrawingObject; previewFill: boolean } {
  let object = candidate;

  const previewFill =
    object.kind === 'simplify' &&
    original?.kind === 'simplify' &&
    draft !== null &&
    !object.settings.automatic &&
    object.settings.manualKind === 'image' &&
    (object.bounds.width !== original.bounds.width ||
      object.bounds.height !== original.bounds.height);
  if (
    object.kind === 'simplify' &&
    draft &&
    draft.kind !== 'create' &&
    (object.settings.automatic || object.settings.manualKind === 'text') &&
    original !== object
  ) {
    const { result, ...preview } = object;
    void result;
    object = preview;
  }
  return { object, previewFill };
}

export function resolveDrawingVisualLayers(
  objects: readonly DrawingObject[],
  draft: PointerDraft | null
): DrawingVisualLayer[] {
  const layers: DrawingVisualLayer[] = [{ kind: 'ink', objects: [] }];
  for (const entry of resolveDrawingFrameRenderables(objects, draft)) {
    const { object, previewFill } = resolveVisualPreview(
      entry.object,
      objects.find((candidate) => candidate.id === entry.object.id),
      draft
    );
    if (object.kind === 'text') {
      layers.push({ kind: 'text', object });
    } else if (object.kind === 'simplify') {
      layers.push({ kind: 'simplify', object, ...(previewFill ? { previewFill: true } : {}) });
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
