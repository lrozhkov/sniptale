import { parsePaint, type Gradient } from '@sniptale/foundation/paint';
import {
  GRADIENT_PRESET_CATALOG_REVISION,
  type GradientPresetCatalog,
  type StoredGradientPreset,
} from './contracts';

const stop = (id: string, color: string, position: number) => ({
  id,
  color,
  position,
  midpoint: 0.5,
});
const linear = (
  id: string,
  name: string,
  colors: [string, string],
  angle: number,
  order: number
): StoredGradientPreset => ({
  id,
  name,
  order,
  origin: 'system',
  gradient: {
    type: 'linear',
    angle,
    interpolation: 'oklab',
    repeat: { enabled: false, span: 1 },
    stops: [stop(`${id}-0`, colors[0], 0), stop(`${id}-1`, colors[1], 1)],
  },
});

export const SYSTEM_GRADIENT_PRESETS: readonly StoredGradientPreset[] = [
  linear('system-sunset', 'system-sunset', ['#f97316ff', '#ec4899ff'], 135, 0),
  linear('system-ocean', 'system-ocean', ['#0f172aff', '#2563ebff'], 135, 1),
  linear('system-aurora', 'system-aurora', ['#22c55eff', '#8b5cf6ff'], 110, 2),
  {
    id: 'system-radial-glow',
    name: 'system-radial-glow',
    order: 3,
    origin: 'system',
    gradient: {
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      radius: { x: 0.65, y: 0.65 },
      interpolation: 'oklab',
      repeat: { enabled: false, span: 1 },
      stops: [
        stop('system-radial-glow-0', '#facc15cc', 0),
        stop('system-radial-glow-1', '#f9731600', 1),
      ],
    },
  },
  {
    id: 'system-conic-spectrum',
    name: 'system-conic-spectrum',
    order: 4,
    origin: 'system',
    gradient: {
      type: 'conic',
      center: { x: 0.5, y: 0.5 },
      startAngle: 0,
      interpolation: 'oklch',
      repeat: { enabled: false, span: 1 },
      stops: [
        stop('system-conic-spectrum-0', '#ef4444ff', 0),
        stop('system-conic-spectrum-1', '#22c55eff', 0.5),
        stop('system-conic-spectrum-2', '#3b82f6ff', 1),
      ],
    },
  },
] as const;

function cloneGradient(gradient: Gradient): Gradient {
  return structuredClone(gradient);
}
export function cloneGradientPreset(preset: StoredGradientPreset): StoredGradientPreset {
  return { ...preset, gradient: cloneGradient(preset.gradient) };
}
export function createDefaultGradientPresetCatalog(): GradientPresetCatalog {
  return {
    revision: GRADIENT_PRESET_CATALOG_REVISION,
    presets: SYSTEM_GRADIENT_PRESETS.map(cloneGradientPreset),
    favoriteIdsBySurface: {},
  };
}
export function cloneGradientPresetCatalog(catalog: GradientPresetCatalog): GradientPresetCatalog {
  return {
    revision: catalog.revision,
    presets: catalog.presets.map(cloneGradientPreset),
    favoriteIdsBySurface: Object.fromEntries(
      Object.entries(catalog.favoriteIdsBySurface).map(([key, ids]) => [key, [...(ids ?? [])]])
    ),
  };
}
export function normalizeGradientPresetPaint(gradient: Gradient): Gradient | null {
  const paint = parsePaint({ kind: 'gradient', gradient });
  return paint?.kind === 'gradient' ? paint.gradient : null;
}
