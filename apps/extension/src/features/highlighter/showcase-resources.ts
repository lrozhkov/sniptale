import { createSolidPaint, type Gradient, type Paint } from '@sniptale/foundation/paint';

export const SHOWCASE_GRADIENT_IDS = [
  'system-sunset',
  'system-ocean',
  'system-aurora',
  'system-lavender',
  'system-peach',
  'system-mint',
  'system-midnight',
  'system-graphite',
  'system-radial-glow',
  'system-radial-spotlight',
  'system-conic-spectrum',
  'system-conic-halo',
] as const;
type ShowcaseGradientId = (typeof SHOWCASE_GRADIENT_IDS)[number];

const stop = (id: string, color: string, position: number) => ({
  id,
  color,
  position,
  midpoint: 0.5,
});
const linear = (
  id: string,
  colors: readonly string[],
  angle: number,
  interpolation: Gradient['interpolation'] = 'oklab'
): Gradient => ({
  type: 'linear',
  angle,
  interpolation,
  repeat: { enabled: false, span: 1 },
  stops: colors.map((color, index) => stop(`${id}-${index}`, color, index / (colors.length - 1))),
});
const radial = (
  id: string,
  colors: readonly string[],
  center: { x: number; y: number } = { x: 0.5, y: 0.5 }
): Gradient => ({
  type: 'radial',
  center,
  radius: { x: 0.72, y: 0.72 },
  interpolation: 'oklab',
  repeat: { enabled: false, span: 1 },
  stops: colors.map((color, index) => stop(`${id}-${index}`, color, index / (colors.length - 1))),
});
const conic = (id: string, colors: readonly string[], startAngle: number): Gradient => ({
  type: 'conic',
  center: { x: 0.5, y: 0.5 },
  startAngle,
  interpolation: 'oklch',
  repeat: { enabled: false, span: 1 },
  stops: colors.map((color, index) => stop(`${id}-${index}`, color, index / (colors.length - 1))),
});

const gradients: Record<ShowcaseGradientId, Gradient> = {
  'system-sunset': linear('system-sunset', ['#f97316ff', '#ec4899ff'], 135),
  'system-ocean': linear('system-ocean', ['#06b6d4ff', '#2563ebff', '#312e81ff'], 135),
  'system-aurora': linear('system-aurora', ['#22c55eff', '#06b6d4ff', '#8b5cf6ff'], 110, 'oklch'),
  'system-lavender': linear('system-lavender', ['#8b5cf6ff', '#d946efff', '#f0abfcff'], 128),
  'system-peach': linear('system-peach', ['#fb7185ff', '#f97316ff', '#fdba74ff'], 120),
  'system-mint': linear('system-mint', ['#0f766eff', '#2dd4bfff', '#bef264ff'], 145),
  'system-midnight': linear('system-midnight', ['#020617ff', '#1e1b4bff', '#4c1d95ff'], 145),
  'system-graphite': linear('system-graphite', ['#f8fafcff', '#94a3b8ff', '#1e293bff'], 135),
  'system-radial-glow': radial('system-radial-glow', ['#fde68aff', '#f97316b8', '#ec489900']),
  'system-radial-spotlight': radial(
    'system-radial-spotlight',
    ['#ffffffff', '#a5f3fca8', '#312e8100'],
    { x: 0.35, y: 0.3 }
  ),
  'system-conic-spectrum': conic(
    'system-conic-spectrum',
    ['#ef4444ff', '#f59e0bff', '#22c55eff', '#3b82f6ff', '#a855f7ff', '#ef4444ff'],
    24
  ),
  'system-conic-halo': conic(
    'system-conic-halo',
    ['#22d3eeff', '#d946efff', '#f97316ff', '#22d3eeff'],
    36
  ),
};

export function getShowcaseGradient(id: ShowcaseGradientId): Gradient {
  return structuredClone(gradients[id]);
}

export function getShowcaseGradientPaint(id: ShowcaseGradientId, opacityScale = 1): Paint {
  const gradient = getShowcaseGradient(id);
  if (opacityScale < 1) {
    gradient.stops = gradient.stops.map((item) => {
      const alpha = Number.parseInt(item.color.slice(7, 9) || 'ff', 16);
      const scaled = Math.round(alpha * Math.max(0, opacityScale));
      return { ...item, color: `${item.color.slice(0, 7)}${scaled.toString(16).padStart(2, '0')}` };
    });
  }
  return { kind: 'gradient', gradient };
}

export const SHOWCASE_SURFACE_IDS = [
  'system-surface-plain',
  'system-surface-ink',
  'system-surface-tonal-warm',
  'system-surface-tonal-cool',
  'system-surface-soft-elevated',
  'system-surface-frosted-light',
  'system-surface-frosted-dark',
  'system-surface-clear-tint',
  'system-surface-acrylic-light',
  'system-surface-acrylic-dark',
  'system-surface-mica',
  'system-surface-liquid-glow',
] as const;
export type ShowcaseSurfaceId = (typeof SHOWCASE_SURFACE_IDS)[number];

const surfaceGradient = (id: string, colors: readonly string[], angle = 135): Paint => ({
  kind: 'gradient',
  gradient: linear(id, colors, angle),
});
const surfaces: Record<ShowcaseSurfaceId, { fillPaint: Paint; surfaceCss: string }> = {
  'system-surface-plain': { fillPaint: createSolidPaint('#ffffffff'), surfaceCss: '' },
  'system-surface-ink': { fillPaint: createSolidPaint('#0f172af5'), surfaceCss: 'color: #f8fafc;' },
  'system-surface-tonal-warm': {
    fillPaint: createSolidPaint('#fff7edfa'),
    surfaceCss: 'color: #7c2d12;',
  },
  'system-surface-tonal-cool': {
    fillPaint: createSolidPaint('#eff6fffa'),
    surfaceCss: 'color: #1e3a8a;',
  },
  'system-surface-soft-elevated': {
    fillPaint: createSolidPaint('#fffaf6fa'),
    surfaceCss: 'box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.1);',
  },
  'system-surface-frosted-light': {
    fillPaint: createSolidPaint('#ffffffb8'),
    surfaceCss: [
      'backdrop-filter: blur(16px) saturate(1.2) brightness(1.04);',
      'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);',
    ].join('\n'),
  },
  'system-surface-frosted-dark': {
    fillPaint: createSolidPaint('#0f172acc'),
    surfaceCss: [
      'backdrop-filter: blur(16px) saturate(1.15) brightness(0.92);',
      'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);',
      'color: #f8fafc;',
    ].join('\n'),
  },
  'system-surface-clear-tint': {
    fillPaint: surfaceGradient('clear-tint', ['#dbeafef5', '#f3e8fff5']),
    surfaceCss:
      'backdrop-filter: blur(10px) saturate(1.25);\nbox-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);',
  },
  'system-surface-acrylic-light': {
    fillPaint: createSolidPaint('#f8fafcd9'),
    surfaceCss: [
      'backdrop-filter: blur(24px) saturate(1.35);',
      'background-image: linear-gradient(135deg, rgba(255,255,255,0.34), rgba(148,163,184,0.12));',
      'box-shadow: 0 16px 40px rgba(15, 23, 42, 0.16);',
    ].join('\n'),
  },
  'system-surface-acrylic-dark': {
    fillPaint: createSolidPaint('#111827dc'),
    surfaceCss: [
      'backdrop-filter: blur(24px) saturate(1.3);',
      'background-image: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(15,23,42,0.24));',
      'box-shadow: 0 18px 44px rgba(2, 6, 23, 0.42);',
      'color: #f8fafc;',
    ].join('\n'),
  },
  'system-surface-mica': {
    fillPaint: surfaceGradient('mica', ['#e0e7ffff', '#f1f5f9ff', '#fae8ffff'], 120),
    surfaceCss:
      'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 10px 30px rgba(71, 85, 105, 0.14);',
  },
  'system-surface-liquid-glow': {
    fillPaint: surfaceGradient('liquid-glow', ['#cffafef5', '#fae8fff5', '#ffedd5f5'], 128),
    surfaceCss: [
      'backdrop-filter: blur(20px) saturate(1.5) brightness(1.05);',
      'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 32px rgba(217, 70, 239, 0.24);',
    ].join('\n'),
  },
};

export function getShowcaseSurface(id: ShowcaseSurfaceId): {
  fillPaint: Paint;
  surfaceCss: string;
} {
  const surface = surfaces[id];
  return { fillPaint: structuredClone(surface.fillPaint), surfaceCss: surface.surfaceCss };
}
