import type { Gradient, GradientStop, GradientType, Paint, PaintStopIdFactory } from './contracts';
import { MAX_GRADIENT_STOPS, MIN_GRADIENT_STOPS } from './contracts';
import { getRepresentativeColor, sampleGradient } from './interpolate';
import { clonePaint, normalizePaintColor } from './normalize';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const base = (stops: GradientStop[]) => ({
  stops,
  interpolation: 'srgb' as const,
  repeat: { enabled: false, span: 1 },
});

export function createGradientPaint(
  color: string,
  createId: PaintStopIdFactory,
  type: GradientType = 'linear'
): Paint {
  const normalized = normalizePaintColor(color) ?? '#000000ff';
  const stops = [0, 1].map((position) => ({
    id: createId(),
    color: normalized,
    position,
    midpoint: 0.5,
  }));
  const common = base(stops);
  if (type === 'radial')
    return {
      kind: 'gradient',
      gradient: { ...common, type, center: { x: 0.5, y: 0.5 }, radius: { x: 0.5, y: 0.5 } },
    };
  if (type === 'conic')
    return {
      kind: 'gradient',
      gradient: { ...common, type, center: { x: 0.5, y: 0.5 }, startAngle: 0 },
    };
  return { kind: 'gradient', gradient: { ...common, type, angle: 90 } };
}

export function instantiatePaint(paint: Paint, createId: PaintStopIdFactory): Paint {
  const next = clonePaint(paint);
  if (next.kind === 'gradient')
    next.gradient.stops = next.gradient.stops.map((stop) => ({ ...stop, id: createId() }));
  return next;
}

export function convertPaintType(
  paint: Paint,
  type: GradientType,
  createId: PaintStopIdFactory
): Paint {
  const source =
    paint.kind === 'gradient' ? paint : createGradientPaint(paint.color, createId, type);
  if (source.kind !== 'gradient' || source.gradient.type === type) return clonePaint(source);
  const common = {
    stops: source.gradient.stops.map((stop) => ({ ...stop })),
    interpolation: source.gradient.interpolation,
    repeat: { ...source.gradient.repeat },
  };
  if (type === 'radial')
    return {
      kind: 'gradient',
      gradient: { ...common, type, center: { x: 0.5, y: 0.5 }, radius: { x: 0.5, y: 0.5 } },
    };
  if (type === 'conic')
    return {
      kind: 'gradient',
      gradient: { ...common, type, center: { x: 0.5, y: 0.5 }, startAngle: 0 },
    };
  return { kind: 'gradient', gradient: { ...common, type, angle: 90 } };
}

export function addGradientStop(
  gradient: Gradient,
  position: number,
  createId: PaintStopIdFactory
): Gradient {
  if (gradient.stops.length >= MAX_GRADIENT_STOPS) return structuredClone(gradient);
  const stop = {
    id: createId(),
    color: sampleGradient(gradient, position),
    position: clamp(position, 0, 1),
    midpoint: 0.5,
  };
  return {
    ...structuredClone(gradient),
    stops: [...gradient.stops, stop].sort((a, b) => a.position - b.position),
  };
}

export function updateGradientStop(
  gradient: Gradient,
  id: string,
  patch: Partial<Omit<GradientStop, 'id'>>
): Gradient {
  const stops = gradient.stops.map((stop) =>
    stop.id === id
      ? {
          ...stop,
          ...patch,
          ...(patch.color ? { color: normalizePaintColor(patch.color) ?? stop.color } : {}),
          ...(patch.position === undefined ? {} : { position: clamp(patch.position, 0, 1) }),
          ...(patch.midpoint === undefined ? {} : { midpoint: clamp(patch.midpoint, 0.01, 0.99) }),
        }
      : { ...stop }
  );
  stops.sort((a, b) => a.position - b.position);
  return { ...structuredClone(gradient), stops };
}

export function removeGradientStop(gradient: Gradient, id: string): Gradient {
  return gradient.stops.length <= MIN_GRADIENT_STOPS
    ? structuredClone(gradient)
    : { ...structuredClone(gradient), stops: gradient.stops.filter((stop) => stop.id !== id) };
}

export function reverseGradient(gradient: Gradient): Gradient {
  return {
    ...structuredClone(gradient),
    stops: gradient.stops.map((stop) => ({ ...stop, position: 1 - stop.position })).reverse(),
  };
}

export function distributeGradientStops(gradient: Gradient): Gradient {
  const last = gradient.stops.length - 1;
  return {
    ...structuredClone(gradient),
    stops: gradient.stops.map((stop, index) => ({ ...stop, position: index / last })),
  };
}

export function paintToSolid(paint: Paint): Paint {
  return { kind: 'solid', color: getRepresentativeColor(paint) };
}
