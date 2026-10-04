import { type Control } from 'fabric';

const CORNER_CURSOR_DIRECTIONS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

export function createCornerCursorStyleHandler(
  fallback: Control['cursorStyleHandler']
): Control['cursorStyleHandler'] {
  return (event, control, object, coordinate) => {
    const defaultCursor = fallback.call(control, event, control, object, coordinate);
    if (defaultCursor === 'not-allowed') return defaultCursor;

    const x = control.x * (object.flipX ? -1 : 1);
    const y = control.y * (object.flipY ? -1 : 1);
    const angle = Math.atan2(y, x) + (object.angle * Math.PI) / 180;
    const octant = Math.round(angle / (Math.PI / 4));
    return CORNER_CURSOR_DIRECTIONS[((octant % 4) + 4) % 4] ?? 'ew-resize';
  };
}
