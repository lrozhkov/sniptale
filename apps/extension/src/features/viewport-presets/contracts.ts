export const VIEWPORT_PRESET_CATALOG_REVISION = 2 as const;
export const VIEWPORT_PRESET_MAX_DIMENSION = 16_384;
export const VIEWPORT_PRESET_MAX_NAME_LENGTH = 80;

export type ViewportPresetTarget = 'viewport' | 'window';

export type SystemViewportPresetKey =
  | 'viewportMobilePortrait'
  | 'viewportMobileLandscape'
  | 'viewportTabletPortrait'
  | 'viewportTabletLandscape'
  | 'viewportHd'
  | 'viewportFullHd'
  | 'windowHd'
  | 'windowLaptop'
  | 'windowDesktop'
  | 'windowFullHd';

interface ViewportPresetBase {
  id: string;
  target: ViewportPresetTarget;
  width: number;
  height: number;
  enabled: boolean;
  order: number;
}

export interface SystemViewportPreset extends ViewportPresetBase {
  kind: 'system';
  systemKey: SystemViewportPresetKey;
  catalogRevision: typeof VIEWPORT_PRESET_CATALOG_REVISION;
  customized: boolean;
  nameOverride?: string;
}

export interface UserViewportPreset extends ViewportPresetBase {
  kind: 'user';
  name: string;
}

export type ViewportPreset = SystemViewportPreset | UserViewportPreset;

export type ViewportPresetAvailabilityReason =
  | 'disabled'
  | 'missing'
  | 'unsupported-context'
  | 'viewport-too-large'
  | 'window-too-large'
  | 'window-not-normal'
  | 'zoom-not-100'
  | 'surface-busy'
  | 'permission-denied'
  | 'platform-rejected'
  | 'verification-failed';

export type ViewportPresetAvailability =
  | {
      status: 'available';
      presetId: string;
      target: ViewportPresetTarget;
      required: { width: number; height: number };
    }
  | {
      status: 'requires-start-validation';
      presetId: string;
      target: 'viewport';
      required: { width: number; height: number };
    }
  | {
      status: 'unavailable';
      presetId: string;
      target: ViewportPresetTarget | null;
      reason: ViewportPresetAvailabilityReason;
      required?: { width: number; height: number };
      available?: { width: number; height: number };
    };
