import type { SerializedSvgVectorPart } from '../../../contracts/effect-runtime/svg-vector';
import { primitivePointBounds, type PrimitiveGeometry } from '../canvas/primitive-bounds';

const boundsCache = new WeakMap<SerializedSvgVectorPart, { value: PrimitiveGeometry }>();

/** GPU-only lazy numeric geometry; Native Path2D remains the validity and rendering authority. */
export function getSvgPartPrimitiveBounds(part: SerializedSvgVectorPart): PrimitiveGeometry {
  const cached = boundsCache.get(part);
  if (cached) return cached.value;
  const value =
    part.type === 'rect'
      ? { x: part.x ?? 0, y: part.y ?? 0, width: part.width ?? 0, height: part.height ?? 0 }
      : deriveSvgPathBounds(part.pathData ?? '');
  boundsCache.set(part, { value });
  return value;
}

/** Read common SVG geometry conservatively. Unknown syntax never changes native admission. */
export function deriveSvgPathBounds(data: string): PrimitiveGeometry {
  let offset = 0,
    command = '',
    x = 0,
    y = 0,
    startX = 0,
    startY = 0;
  let cubic: { x: number; y: number } | undefined, quadratic: { x: number; y: number } | undefined;
  const points: { x: number; y: number }[] = [];
  const skip = () => {
    while (offset < data.length && /[\s,]/u.test(data[offset]!)) offset++;
  };
  const number = (flag = false): number | undefined => {
    skip();
    if (flag) {
      const c = data[offset];
      if (c !== '0' && c !== '1') return undefined;
      offset++;
      return Number(c);
    }
    const start = offset;
    if (data[offset] === '+' || data[offset] === '-') offset++;
    const digits = () => {
      const first = offset;
      while (offset < data.length && data[offset]! >= '0' && data[offset]! <= '9') offset++;
      return offset - first;
    };
    let count = digits();
    if (data[offset] === '.') {
      offset++;
      count += digits();
    }
    if (count === 0) return undefined;
    if (data[offset] === 'e' || data[offset] === 'E') {
      offset++;
      if (data[offset] === '+' || data[offset] === '-') offset++;
      if (digits() === 0) return undefined;
    }
    const n = Number(data.slice(start, offset));
    return Number.isFinite(n) ? n : undefined;
  };
  const add = (px: number, py: number) => points.push({ x: px, y: py });
  while (true) {
    skip();
    if (offset >= data.length) break;
    const next = data[offset]!;
    if (/[a-z]/iu.test(next)) {
      command = next;
      offset++;
    } else if (!command) return undefined;
    const op = command.toUpperCase(),
      relative = command !== op;
    if (op === 'Z') {
      x = startX;
      y = startY;
      if (points.length) add(x, y);
      command = '';
      cubic = quadratic = undefined;
      continue;
    }
    const arity = (
      { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 } as Record<string, number>
    )[op];
    if (!arity) return undefined;
    const values: number[] = [];
    for (let i = 0; i < arity; i++) {
      const n = number(op === 'A' && (i === 3 || i === 4));
      if (n === undefined) return undefined;
      values.push(n);
    }
    const px = (i: number) => values[i]! + (relative ? x : 0),
      py = (i: number) => values[i]! + (relative ? y : 0);
    let endX = x,
      endY = y,
      nextCubic: typeof cubic,
      nextQuadratic: typeof quadratic;
    if (op === 'M' || op === 'L' || op === 'T') {
      endX = px(0);
      endY = py(1);
      if (op === 'T') {
        const control = quadratic ? { x: 2 * x - quadratic.x, y: 2 * y - quadratic.y } : { x, y };
        add(control.x, control.y);
        nextQuadratic = control;
      }
      if (op === 'M') {
        startX = endX;
        startY = endY;
        command = relative ? 'l' : 'L';
      }
    } else if (op === 'H') endX = px(0);
    else if (op === 'V') endY = py(0);
    else if (op === 'C') {
      add(px(0), py(1));
      add(px(2), py(3));
      nextCubic = { x: px(2), y: py(3) };
      endX = px(4);
      endY = py(5);
    } else if (op === 'S') {
      const control = cubic ? { x: 2 * x - cubic.x, y: 2 * y - cubic.y } : { x, y };
      add(control.x, control.y);
      add(px(0), py(1));
      nextCubic = { x: px(0), y: py(1) };
      endX = px(2);
      endY = py(3);
    } else if (op === 'Q') {
      add(px(0), py(1));
      nextQuadratic = { x: px(0), y: py(1) };
      endX = px(2);
      endY = py(3);
    } else if (op === 'A') {
      endX = px(5);
      endY = py(6);
      const ellipse = arcEllipseBounds(
        x,
        y,
        endX,
        endY,
        values[0]!,
        values[1]!,
        values[2]!,
        values[3]!,
        values[4]!
      );
      if (ellipse === undefined) return undefined;
      if (ellipse) {
        add(ellipse.x, ellipse.y);
        add(ellipse.x + ellipse.width, ellipse.y + ellipse.height);
      }
    }
    if (op !== 'M') add(x, y);
    add(endX, endY);
    x = endX;
    y = endY;
    cubic = nextCubic;
    quadratic = nextQuadratic;
  }
  return points.length ? primitivePointBounds(points) : null;
}

function arcEllipseBounds(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  degrees: number,
  large: number,
  sweep: number
): PrimitiveGeometry {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return null;
  const angle = (degrees * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const dx = (x1 - x2) / 2,
    dy = (y1 - y2) / 2,
    px = cos * dx + sin * dy,
    py = -sin * dx + cos * dy;
  const lambda = (px / rx) ** 2 + (py / ry) ** 2;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const denominator = (rx * py) ** 2 + (ry * px) ** 2;
  const numerator = (rx * ry) ** 2 - denominator;
  if (!Number.isFinite(denominator) || denominator === 0 || !Number.isFinite(numerator))
    return undefined;
  const factor = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * py) / ry,
    cyp = (-factor * ry * px) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2,
    cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ex = Math.hypot(rx * cos, ry * sin),
    ey = Math.hypot(rx * sin, ry * cos);
  if (![cx, cy, ex, ey].every(Number.isFinite)) return undefined;
  return { x: cx - ex, y: cy - ey, width: 2 * ex, height: 2 * ey };
}
