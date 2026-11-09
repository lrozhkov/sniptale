import type { FabricObject } from 'fabric';

/** The Fabric drag inputs shared by magnet and grid movement handling. */
export interface EditorMoveEvent {
  target?: FabricObject;
  e?: { shiftKey?: boolean };
  pointer?: { x: number; y: number };
  transform?: {
    action?: string;
    ex: number;
    ey: number;
    original: { left: number; top: number };
  };
}

/** Derive the drag position in Fabric's containing plane before any snapping. */
export function getEditorMovePosition(event: EditorMoveEvent) {
  const { pointer, transform } = event;
  if (!pointer || !transform || transform.action !== 'drag') return null;
  const dx = pointer.x - transform.ex;
  const dy = pointer.y - transform.ey;
  const { left, top } = transform.original;
  if (![dx, dy, left, top].every(Number.isFinite)) return null;
  const lockedAxis: 'left' | 'top' | null = event.e?.shiftKey
    ? Math.abs(dx) >= Math.abs(dy)
      ? 'top'
      : 'left'
    : null;
  return {
    left: left + (lockedAxis === 'left' ? 0 : dx),
    top: top + (lockedAxis === 'top' ? 0 : dy),
    lockedAxis,
  };
}
