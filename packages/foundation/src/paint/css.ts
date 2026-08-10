import type { Gradient, Paint } from './contracts';
import { parsePaint } from './normalize';

const percent = (value: number) => `${Number((value * 100).toFixed(3))}%`;
const interpolation = (gradient: Gradient) =>
  gradient.interpolation === 'srgb' ? '' : ` in ${gradient.interpolation}`;

function colorStops(gradient: Gradient): string {
  const span = gradient.repeat.enabled ? gradient.repeat.span : 1;
  return gradient.stops
    .flatMap((stop, index) => {
      const current = `${stop.color} ${percent(stop.position * span)}`;
      const next = gradient.stops[index + 1];
      if (!next || stop.midpoint === 0.5) return [current];
      const hint = stop.position + (next.position - stop.position) * stop.midpoint;
      return [current, percent(hint * span)];
    })
    .join(', ');
}

export function serializePaintToCss(paint: Paint): string {
  const canonical = parsePaint(paint);
  if (!canonical) return 'transparent';
  if (canonical.kind === 'solid') return canonical.color;
  const gradient = canonical.gradient;
  const prefix = gradient.repeat.enabled ? 'repeating-' : '';
  const stops = colorStops(gradient);
  if (gradient.type === 'linear') {
    return `${prefix}linear-gradient(${gradient.angle}deg${interpolation(gradient)}, ${stops})`;
  }
  const center = `${percent(gradient.center.x)} ${percent(gradient.center.y)}`;
  if (gradient.type === 'radial') {
    const radius = `${percent(gradient.radius.x)} ${percent(gradient.radius.y)}`;
    return `${prefix}radial-gradient(ellipse ${radius} at ${center}${interpolation(gradient)}, ${stops})`;
  }
  return `${prefix}conic-gradient(from ${gradient.startAngle}deg at ${center}${interpolation(gradient)}, ${stops})`;
}
