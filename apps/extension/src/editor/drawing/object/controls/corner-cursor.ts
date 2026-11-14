import { type Control } from 'fabric';
import { resolveDrawingResizeCursorFromAngle } from '../../../../features/drawing/public';

export function createCornerCursorStyleHandler(
  fallback: Control['cursorStyleHandler']
): Control['cursorStyleHandler'] {
  return (event, control, object, coordinate) => {
    const defaultCursor = fallback.call(control, event, control, object, coordinate);
    if (
      defaultCursor === 'not-allowed' ||
      control.getActionName(event, control, object).startsWith('skew')
    )
      return defaultCursor;

    // Fabric projects a control box independently of object flips and aspect ratio.
    const coords = object.calcOCoords();
    const xStart = coords['tl'] ?? coords['ml'];
    const xEnd = coords['tr'] ?? coords['mr'];
    const yStart = coords['tl'] ?? coords['mt'];
    const yEnd = coords['bl'] ?? coords['mb'];
    const angle =
      ((object.getTotalAngle() - (object.group && object.flipX ? 180 : 0)) * Math.PI) / 180;
    const axis = (start: typeof xStart, end: typeof xEnd, fallbackX: number, fallbackY: number) => {
      const x = start && end ? end.x - start.x : fallbackX;
      const y = start && end ? end.y - start.y : fallbackY;
      const length = Math.hypot(x, y);
      return length > 0 ? { x: x / length, y: y / length } : { x: fallbackX, y: fallbackY };
    };
    const horizontal = axis(xStart, xEnd, Math.cos(angle), Math.sin(angle));
    const vertical = axis(yStart, yEnd, -horizontal.y, horizontal.x);
    const x = control.x * horizontal.x + control.y * vertical.x;
    const y = control.x * horizontal.y + control.y * vertical.y;
    return resolveDrawingResizeCursorFromAngle((Math.atan2(y, x) * 180) / Math.PI);
  };
}
