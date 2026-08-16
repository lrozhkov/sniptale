import { parsePaint, type Gradient } from '@sniptale/foundation/paint';
import {
  getShowcaseGradient,
  SHOWCASE_GRADIENT_IDS,
} from '../../../features/highlighter/showcase-resources';
import {
  GRADIENT_PRESET_CATALOG_REVISION,
  type GradientPresetCatalog,
  type StoredGradientPreset,
} from './contracts';

export const SYSTEM_GRADIENT_PRESETS: readonly StoredGradientPreset[] = SHOWCASE_GRADIENT_IDS.map(
  (id, order) => ({
    customized: false,
    enabled: true,
    id,
    name: id,
    order,
    origin: 'system',
    gradient: getShowcaseGradient(id),
  })
);

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
    defaultPresetIdBySurface: { 'highlighter-frame-fill': SYSTEM_GRADIENT_PRESETS[0]!.id },
  };
}
export function cloneGradientPresetCatalog(catalog: GradientPresetCatalog): GradientPresetCatalog {
  return {
    revision: catalog.revision,
    presets: catalog.presets.map(cloneGradientPreset),
    favoriteIdsBySurface: Object.fromEntries(
      Object.entries(catalog.favoriteIdsBySurface).map(([key, ids]) => [key, [...(ids ?? [])]])
    ),
    defaultPresetIdBySurface: { ...catalog.defaultPresetIdBySurface },
  };
}
export function normalizeGradientPresetPaint(gradient: Gradient): Gradient | null {
  const paint = parsePaint({ kind: 'gradient', gradient });
  return paint?.kind === 'gradient' ? paint.gradient : null;
}
