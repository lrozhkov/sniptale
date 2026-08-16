import type { SurfaceStylePreset } from '@sniptale/runtime-contracts/highlighter/surface-style';

export const SURFACE_STYLE_PRESET_STORAGE_KEY = 'sniptale_surface_style_presets';
export const SURFACE_STYLE_PRESET_SCHEMA_VERSION = 2;
export const SURFACE_STYLE_PRESET_MAX_BYTES = 7_500;
export const SURFACE_STYLE_PRESET_MAX_USERS = 50;
export const SURFACE_STYLE_PRESET_SURFACE = 'highlighter-callout' as const;

export type StoredUserSurfaceStylePreset = SurfaceStylePreset & {
  customized: false;
  enabled: boolean;
  origin: 'user';
  order: number;
};

export type NewUserSurfaceStylePreset = SurfaceStylePreset & {
  customized?: false;
  enabled?: boolean;
  origin: 'user';
  order: number;
};

export type ManagedSurfaceStylePreset = SurfaceStylePreset & {
  customized: boolean;
  enabled: boolean;
  order: number;
};

export type SurfaceStylePresetCatalog = {
  catalogRevision: number;
  favoriteIds: string[];
  defaultPresetId: string;
  presets: ManagedSurfaceStylePreset[];
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
  defaultPresetIdBySurface: { 'highlighter-callout': string };
  favoriteIdsBySurface: { 'highlighter-callout'?: string[] };
  presets: ManagedSurfaceStylePreset[];
  schemaVersion: 2;
  systemCatalogRevision: 3;
};
