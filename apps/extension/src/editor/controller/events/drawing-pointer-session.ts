import type { TPointerEvent } from 'fabric';

import type { DrawSession } from '../core/types';

export function readEditorDrawingPointerId(event?: TPointerEvent): number | null {
  return event && 'pointerId' in event ? event.pointerId : null;
}

export function isEditorDrawingSessionPointer(
  session: DrawSession,
  event?: TPointerEvent
): boolean {
  const ownerPointerId = session.pointerId ?? null;
  const pointerId = readEditorDrawingPointerId(event);
  return ownerPointerId === null || pointerId === null || pointerId === ownerPointerId;
}
