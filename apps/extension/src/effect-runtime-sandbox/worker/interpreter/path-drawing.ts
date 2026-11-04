import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';
import { primitivePointBounds, type PrimitiveGeometry } from '../canvas/primitive-bounds';
import { n, type RenderState } from './model.js';

type PathCommand = Extract<EffectV1Command, { op: 'path' }>;

/** Draw the original native path and retain the hull of the same evaluated operands. */
export function drawCanvasPathSegments(
  command: PathCommand,
  state: RenderState
): PrimitiveGeometry {
  if (!command.segments) return null;
  const points: { x: number; y: number }[] = [];
  const c = state.context;
  const add = (x: number, y: number) => {
    points.push({ x, y });
  };
  c.beginPath();
  for (const segment of command.segments) {
    if (segment.kind === 'moveTo' || segment.kind === 'lineTo') {
      const x = n(segment.x, state),
        y = n(segment.y, state);
      add(x, y);
      if (segment.kind === 'moveTo') c.moveTo(x, y);
      else c.lineTo(x, y);
    } else if (segment.kind === 'quadraticTo') {
      const cx = n(segment.cpx, state),
        cy = n(segment.cpy, state),
        x = n(segment.x, state),
        y = n(segment.y, state);
      add(cx, cy);
      add(x, y);
      c.quadraticCurveTo(cx, cy, x, y);
    } else if (segment.kind === 'cubicTo') {
      const x1 = n(segment.cp1x, state),
        y1 = n(segment.cp1y, state),
        x2 = n(segment.cp2x, state),
        y2 = n(segment.cp2y, state),
        x = n(segment.x, state),
        y = n(segment.y, state);
      add(x1, y1);
      add(x2, y2);
      add(x, y);
      c.bezierCurveTo(x1, y1, x2, y2, x, y);
    } else if (segment.kind === 'arc') {
      const x = n(segment.centerX, state),
        y = n(segment.centerY, state),
        r = n(segment.radius, state),
        start = n(segment.start, state),
        end = n(segment.end, state);
      add(x - r, y - r);
      add(x + r, y + r);
      c.arc(x, y, r, start, end, segment.counterclockwise === true);
    } else if (segment.kind === 'ellipse') {
      const x = n(segment.centerX, state),
        y = n(segment.centerY, state),
        rx = n(segment.radiusX, state),
        ry = n(segment.radiusY, state),
        rotation = n(segment.rotation, state),
        start = n(segment.start, state),
        end = n(segment.end, state);
      const ex = Math.hypot(rx * Math.cos(rotation), ry * Math.sin(rotation)),
        ey = Math.hypot(rx * Math.sin(rotation), ry * Math.cos(rotation));
      add(x - ex, y - ey);
      add(x + ex, y + ey);
      c.ellipse(x, y, rx, ry, rotation, start, end, segment.counterclockwise === true);
    } else if (segment.kind === 'rect' || segment.kind === 'roundRect') {
      const x = n(segment.x, state),
        y = n(segment.y, state),
        w = n(segment.width, state),
        h = n(segment.height, state);
      add(x, y);
      add(x + w, y + h);
      if (segment.kind === 'rect') c.rect(x, y, w, h);
      else c.roundRect(x, y, w, h, n(segment.radius, state));
    }
  }
  if (command.closed) c.closePath();
  return points.length ? primitivePointBounds(points) : null;
}
