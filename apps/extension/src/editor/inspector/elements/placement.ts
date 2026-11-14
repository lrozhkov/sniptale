import type { EditorVectorDefinition } from '../../../features/editor/document/vector-element';
import { getEditorVectorPresentation, type EditorVectorPresentation } from './presentation';

interface PlacementCanvas {
  getScenePoint(event: MouseEvent): { x: number; y: number };
}
interface EditorVectorPlacementTarget {
  canvas: PlacementCanvas | null;
  source: object | null;
  layerMutationToken: number;
  insertVectorElement(
    definition: EditorVectorDefinition,
    point: { x: number; y: number },
    colors?: Readonly<Record<string, string>>,
    style?: { opacity: number; strokeScale: number }
  ): Promise<boolean>;
}
export interface EditorVectorPlacementGhost {
  x: number;
  y: number;
  definition: EditorVectorDefinition;
  presentation: EditorVectorPresentation;
}

/** A prepared card owns one pointer lifetime; canceled or stale placement never inserts. */
export function beginEditorVectorPlacement(options: {
  event: Pick<PointerEvent, 'button' | 'pointerId' | 'clientX' | 'clientY'>;
  definition: EditorVectorDefinition;
  presentation?: EditorVectorPresentation;
  controller: EditorVectorPlacementTarget;
  boundary: HTMLElement;
  onGhost(ghost: EditorVectorPlacementGhost | null): void;
  onInserted(): void;
  onFailure(): void;
}): () => void {
  const { event, controller, boundary, definition } = options;
  const presentation = options.presentation ?? getEditorVectorPresentation(definition);
  const canvas = controller.canvas,
    source = controller.source,
    token = controller.layerMutationToken;
  if (event.button !== 0 || !canvas || !source) return () => undefined;
  let moved = false,
    closed = false;
  const document = boundary.ownerDocument,
    view = document.defaultView;
  const current = () =>
    controller.canvas === canvas &&
    controller.source === source &&
    controller.layerMutationToken === token;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancel);
    document.removeEventListener('keydown', key);
    view?.removeEventListener('blur', cancel);
    options.onGhost(null);
  };
  const cancel = () => cleanup();
  function key(keyEvent: KeyboardEvent) {
    if (keyEvent.key === 'Escape') {
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cleanup();
    }
  }
  function move(pointer: PointerEvent) {
    if (pointer.pointerId !== event.pointerId || closed) return;
    if (!current()) {
      cleanup();
      return;
    }
    if (Math.hypot(pointer.clientX - event.clientX, pointer.clientY - event.clientY) < 4 && !moved)
      return;
    moved = true;
    pointer.preventDefault();
    options.onGhost({ x: pointer.clientX, y: pointer.clientY, definition, presentation });
  }
  function up(pointer: PointerEvent) {
    if (pointer.pointerId !== event.pointerId || closed) return;
    const shouldInsert = moved && current();
    cleanup();
    if (!shouldInsert) return;
    const rect = boundary.getBoundingClientRect();
    if (
      pointer.clientX < rect.left ||
      pointer.clientX > rect.right ||
      pointer.clientY < rect.top ||
      pointer.clientY > rect.bottom
    )
      return;
    const target = document.elementFromPoint(pointer.clientX, pointer.clientY);
    if (
      !target ||
      target.closest(
        [
          '[data-floating-ui-root="true"]',
          '[data-ui^="editor.floating."]',
          '[data-ui="editor.floating.layers-panel"]',
          '[data-ui="editor.floating.tool-rail"]',
          '[data-ui="editor.floating.tool-properties"]',
          '[role="dialog"]',
        ].join(', ')
      )
    )
      return;
    pointer.preventDefault();
    pointer.stopPropagation();
    const point = canvas!.getScenePoint(pointer);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    void controller
      .insertVectorElement(definition, point, presentation.colors, presentation)
      .then((accepted) => {
        if (accepted) options.onInserted();
      })
      .catch(options.onFailure);
  }
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancel);
  document.addEventListener('keydown', key);
  view?.addEventListener('blur', cancel);
  return cleanup;
}
