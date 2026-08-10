import { getColorAlpha, parseColor } from '../color/index';
import type { Gradient, GradientStop, Paint, PaintInterpolationSpace } from './contracts';
import { normalizePaintColor } from './normalize';

type Channels = [number, number, number];
const clampUnit = (value: number) => Math.min(1, Math.max(0, value));
const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const toSrgb = (value: number) =>
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

function rgbToOklab([red, green, blue]: Channels): Channels {
  const r = toLinear(red),
    g = toLinear(green),
    b = toLinear(blue);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([lightness, a, b]: Channels): Channels {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clampUnit(toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clampUnit(toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clampUnit(toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

const toLch = ([l, a, b]: Channels): Channels => [l, Math.hypot(a, b), Math.atan2(b, a)];
const fromLch = ([l, c, h]: Channels): Channels => [l, c * Math.cos(h), c * Math.sin(h)];

function premultipliedMix(
  left: Channels,
  right: Channels,
  leftAlpha: number,
  rightAlpha: number,
  amount: number,
  alpha: number
): Channels {
  if (alpha === 0) return [0, 0, 0];
  return left.map(
    (channel, index) =>
      (channel * leftAlpha +
        ((right[index] ?? channel) * rightAlpha - channel * leftAlpha) * amount) /
      alpha
  ) as Channels;
}

function interpolateColor(
  left: string,
  right: string,
  amount: number,
  space: PaintInterpolationSpace
): string {
  const a = parseColor(left)!;
  const b = parseColor(right)!;
  const alpha = a.alpha + (b.alpha - a.alpha) * amount;
  const leftRgb: Channels = [a.red / 255, a.green / 255, a.blue / 255];
  const rightRgb: Channels = [b.red / 255, b.green / 255, b.blue / 255];
  let rgb: Channels;
  if (space === 'oklch') {
    const leftLch = toLch(rgbToOklab(leftRgb));
    const rightLch = toLch(rgbToOklab(rightRgb));
    let hueDelta = rightLch[2] - leftLch[2];
    if (hueDelta > Math.PI) hueDelta -= Math.PI * 2;
    if (hueDelta < -Math.PI) hueDelta += Math.PI * 2;
    const mixed = premultipliedMix(leftLch, rightLch, a.alpha, b.alpha, amount, alpha);
    mixed[2] = leftLch[2] + hueDelta * amount;
    rgb = oklabToRgb(fromLch(mixed));
  } else {
    const leftChannels =
      space === 'oklab'
        ? rgbToOklab(leftRgb)
        : space === 'srgb-linear'
          ? (leftRgb.map(toLinear) as Channels)
          : leftRgb;
    const rightChannels =
      space === 'oklab'
        ? rgbToOklab(rightRgb)
        : space === 'srgb-linear'
          ? (rightRgb.map(toLinear) as Channels)
          : rightRgb;
    const mixed = premultipliedMix(leftChannels, rightChannels, a.alpha, b.alpha, amount, alpha);
    rgb =
      space === 'oklab'
        ? oklabToRgb(mixed)
        : space === 'srgb-linear'
          ? (mixed.map(toSrgb).map(clampUnit) as Channels)
          : (mixed.map(clampUnit) as Channels);
  }
  return normalizePaintColor(`rgba(${rgb[0] * 255}, ${rgb[1] * 255}, ${rgb[2] * 255}, ${alpha})`)!;
}

function midpointAmount(amount: number, midpoint: number): number {
  if (amount <= midpoint) return (0.5 * amount) / midpoint;
  return 0.5 + (0.5 * (amount - midpoint)) / (1 - midpoint);
}

export function sampleGradient(gradient: Gradient, position: number): string {
  const stops = gradient.stops;
  const target = clampUnit(position);
  let exact: GradientStop | undefined;
  for (const stop of stops) if (stop.position === target) exact = stop;
  if (exact) return exact.color;
  const rightIndex = stops.findIndex((stop) => stop.position > target);
  if (rightIndex <= 0) return (rightIndex === 0 ? stops[0] : stops.at(-1))!.color;
  const left = stops[rightIndex - 1]!;
  const right = stops[rightIndex]!;
  const local = (target - left.position) / (right.position - left.position);
  return interpolateColor(
    left.color,
    right.color,
    midpointAmount(local, left.midpoint),
    gradient.interpolation
  );
}

export function samplePaint(paint: Paint, position: number): string {
  return paint.kind === 'solid' ? paint.color : sampleGradient(paint.gradient, position);
}

export function getRepresentativeColor(paint: Paint): string {
  return samplePaint(paint, 0.5);
}

export function isPaintVisible(paint: Paint): boolean {
  return paint.kind === 'solid'
    ? (getColorAlpha(paint.color) ?? 0) > 0
    : paint.gradient.stops.some((stop) => (getColorAlpha(stop.color) ?? 0) > 0);
}
