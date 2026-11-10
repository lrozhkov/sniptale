import {
  parseEffectRuntimeGpuPaint,
  type EffectRuntimeGpuPaint,
  type EffectRuntimeGpuPaintColor,
  type EffectRuntimeGpuTransform,
} from '../../../contracts/effect-runtime/gpu-plan';
import type { RuntimeCanvasContext } from '../model/types';

/** Records evaluated native operands; unsupported native overloads keep their original raster path. */
export function createEffectRuntimeGpuPaintRecorder(native: RuntimeCanvasContext) {
  let path: EffectRuntimeGpuPaint['path'] = [];
  let painted: EffectRuntimeGpuPaint | null = null;
  let recording = true;
  const gradients = new WeakMap<object, Exclude<EffectRuntimeGpuPaintColor, string>>();
  const methods = new Map<PropertyKey, unknown>();
  const matrix = (): EffectRuntimeGpuTransform => {
    const m = (native as OffscreenCanvasRenderingContext2D).getTransform();
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  };
  const color = (value: unknown) =>
    typeof value === 'string'
      ? value
      : value && typeof value === 'object'
        ? gradients.get(value)
        : undefined;
  const style = () => {
    const context = native as OffscreenCanvasRenderingContext2D;
    return {
      fill: color(context.fillStyle),
      stroke: color(context.strokeStyle),
      font: context.font,
      lineWidth: context.lineWidth,
      lineCap: context.lineCap,
      lineJoin: context.lineJoin,
      miterLimit: context.miterLimit ?? 10,
      textAlign: context.textAlign,
      textBaseline: context.textBaseline,
      direction: context.direction ?? 'inherit',
    };
  };
  const pathNames = new Set([
    'moveTo',
    'lineTo',
    'quadraticCurveTo',
    'bezierCurveTo',
    'rect',
    'roundRect',
    'arc',
    'arcTo',
    'ellipse',
    'closePath',
  ]);
  const context = new Proxy(native, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      if (methods.has(key)) return methods.get(key);
      const method = (...args: unknown[]) => {
        if (key === 'beginPath') path = [];
        if (typeof key === 'string' && pathNames.has(key)) {
          const operands = [...args];
          if (
            (key === 'arc' && operands.length === 5) ||
            (key === 'ellipse' && operands.length === 7)
          )
            operands.push(false);
          path.push({ op: key, args: operands as (number | boolean)[], transform: matrix() });
        }
        if (
          recording &&
          (key === 'fill' || key === 'stroke' || key === 'fillRect' || key === 'fillText')
        ) {
          const operands = key === 'fill' ? [args[0] ?? 'nonzero'] : [...args];
          if (key === 'fillText' && operands.at(-1) === undefined) operands.pop();
          const candidate = parseEffectRuntimeGpuPaint({
            path: key === 'fill' || key === 'stroke' ? [...path] : [],
            draw: { op: key, args: operands },
            transform: matrix(),
            style: style(),
          });
          if (candidate) {
            painted = candidate;
            return;
          }
          painted = null;
        }
        const result: unknown = Reflect.apply(value, target, args);
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          const gradient = result as CanvasGradient;
          const description = {
            kind: key === 'createLinearGradient' ? ('linear' as const) : ('radial' as const),
            args: args as number[],
            transform: matrix(),
            stops: [] as [number, string][],
          };
          gradients.set(gradient, description);
          const add = gradient.addColorStop;
          gradient.addColorStop = (offset, stop) => {
            add.call(gradient, offset, stop);
            description.stops.push([offset, stop]);
          };
        }
        return result;
      };
      methods.set(key, method);
      return method;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  return {
    context,
    raster(draw: () => void) {
      recording = false;
      try {
        draw();
      } finally {
        recording = true;
      }
    },
    resetPaint() {
      painted = null;
    },
    take(region: { x: number; y: number }) {
      if (!painted) return null;
      const translate = (m: EffectRuntimeGpuTransform): EffectRuntimeGpuTransform => [
        m[0],
        m[1],
        m[2],
        m[3],
        m[4] - region.x,
        m[5] - region.y,
      ];
      const moveColor = (value: EffectRuntimeGpuPaintColor): EffectRuntimeGpuPaintColor =>
        typeof value === 'string' ? value : { ...value, transform: translate(value.transform) };
      return {
        ...painted,
        transform: translate(painted.transform),
        path: painted.path.map((item) => ({ ...item, transform: translate(item.transform) })),
        style: {
          ...painted.style,
          fill: moveColor(painted.style.fill),
          stroke: moveColor(painted.style.stroke),
        },
      };
    },
  };
}
