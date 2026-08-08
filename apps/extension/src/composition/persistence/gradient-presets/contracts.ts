import type { Gradient } from '@sniptale/foundation/paint';

export const GRADIENT_PRESET_CATALOG_REVISION = 1;
export const GRADIENT_PRESET_STORAGE_KEY = 'sniptale_gradient_presets';
export const GRADIENT_PRESET_SURFACES = ['highlighter-frame-fill'] as const;
export type GradientPresetSurface = (typeof GRADIENT_PRESET_SURFACES)[number];

export interface StoredGradientPreset {
  id: string;
  name: string;
  order: number;
  origin: 'system' | 'user';
  gradient: Gradient;
}

export interface GradientPresetCatalog {
  revision: number;
  presets: StoredGradientPreset[];
  favoriteIdsBySurface: Partial<Record<GradientPresetSurface, string[]>>;
}

export type GradientPresetMutationOutcome = 'applied' | 'rejected' | 'unchanged';
