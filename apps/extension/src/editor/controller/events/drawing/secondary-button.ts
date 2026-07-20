import type { TPointerEvent as PointerEvent } from 'fabric';

export function isSecondaryButton(event: PointerEvent): boolean {
  return (
    ('button' in event && event.button === 2) ||
    ('which' in event && typeof event.which === 'number' && event.which === 3)
  );
}
