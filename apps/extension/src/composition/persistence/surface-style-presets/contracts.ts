import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';

export const SURFACE_STYLE_PRESET_STORAGE_KEY = 'sniptale_surface_style_presets';
export const SURFACE_STYLE_PRESET_SCHEMA_VERSION = 1;
export const SURFACE_STYLE_PRESET_MAX_BYTES = 7_500;
export const SURFACE_STYLE_PRESET_MAX_USERS = 50;
export const SURFACE_STYLE_PRESET_SURFACE = 'highlighter-callout' as const;

export type StoredUserSurfaceStylePreset = SurfaceStylePreset & {
  origin: 'user';
  order: number;
};

export type SurfaceStylePresetCatalog = {
  catalogRevision: number;
  favoriteIds: string[];
  presets: Array<SurfaceStylePreset & { order: number }>;
  systemCatalogRevision: number;
  unsafeForWrite: boolean;
};

export type SurfaceStylePresetMutationOutcome =
  | { outcome: 'applied' | 'unchanged'; catalog: SurfaceStylePresetCatalog }
  | { outcome: 'stale-revision'; catalog: SurfaceStylePresetCatalog }
  | { outcome: 'quota' | 'unsafe-storage' | 'write-failed'; catalog: SurfaceStylePresetCatalog }
  | { outcome: 'rejected'; catalog: SurfaceStylePresetCatalog };

export type StoredSurfaceStylePresetState = {
  catalogRevision: number;
  favoriteIdsBySurface: { 'highlighter-callout'?: string[] };
  schemaVersion: 1;
  systemCatalogRevision: 1;
  userPresets: StoredUserSurfaceStylePreset[];
};
