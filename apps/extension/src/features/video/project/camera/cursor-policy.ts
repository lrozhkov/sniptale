import { isPlainRecord as isRecord } from '@sniptale/runtime-contracts/validation/primitives';

type CameraFollowPreset = 'calm' | 'balanced' | 'fast';

/** Camera movement policy is independent of authored focus geometry and nominal zoom. */
export interface CameraFollowSettings {
  /** Explicit legacy motion preset survives unrelated policy edits. */
  legacySensitivity?: number;
  zoneSize: number;
  transitionDuration: number;
  marginFraction: number;
  minimumHoldDuration: number;
  preservePointer: boolean;
  allowExpansion: boolean;
  minimumScale: number;
}

export interface ResolvedCameraFollowPolicy {
  settings: CameraFollowSettings;
  source: 'defaults' | 'override' | 'legacy';
}

/** Admit persisted policy without converting legacy coefficients or accepting partial settings. */
export function parseCameraFollowSettings(value: unknown): CameraFollowSettings | null {
  if (!isRecord(value)) return null;
  const fields = value;
  const bounded = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const {
    zoneSize,
    transitionDuration,
    marginFraction,
    minimumHoldDuration,
    minimumScale,
    preservePointer,
    allowExpansion,
    legacySensitivity,
  } = fields;
  if (
    !bounded(zoneSize, 0.1, 1) ||
    !bounded(transitionDuration, 0.05, 5) ||
    !bounded(marginFraction, 0, 0.3) ||
    !bounded(minimumHoldDuration, 0, 5) ||
    !bounded(minimumScale, 1, 4) ||
    typeof preservePointer !== 'boolean' ||
    typeof allowExpansion !== 'boolean' ||
    (legacySensitivity !== undefined && !bounded(legacySensitivity, 0, 1))
  )
    return null;
  return {
    zoneSize,
    transitionDuration,
    marginFraction,
    minimumHoldDuration,
    minimumScale,
    preservePointer,
    allowExpansion,
    ...(legacySensitivity !== undefined ? { legacySensitivity } : {}),
  };
}

const PRESETS = {
  calm: { transitionDuration: 0.65, marginFraction: 0.12, minimumHoldDuration: 0.6 },
  balanced: { transitionDuration: 0.35, marginFraction: 0.08, minimumHoldDuration: 0.35 },
  fast: { transitionDuration: 0.2, marginFraction: 0.05, minimumHoldDuration: 0.15 },
};

/** Construct independent defaults. Presets change movement, without changing grouping or zoom. */
export function createCameraFollowSettings(
  preset: CameraFollowPreset = 'calm'
): CameraFollowSettings {
  return {
    zoneSize: 0.55,
    ...PRESETS[preset],
    preservePointer: true,
    allowExpansion: true,
    minimumScale: 1,
  };
}

/** Identify retained legacy motion and exact named presets; advanced edits remain custom. */
export function cameraFollowPreset(
  settings: CameraFollowSettings
): CameraFollowPreset | 'legacy' | 'custom' {
  if (settings.legacySensitivity !== undefined) return 'legacy';
  for (const preset of ['calm', 'balanced', 'fast'] as const) {
    const defaults = PRESETS[preset];
    if (
      settings.transitionDuration === defaults.transitionDuration &&
      settings.marginFraction === defaults.marginFraction &&
      settings.minimumHoldDuration === defaults.minimumHoldDuration
    )
      return preset;
  }
  return 'custom';
}

/** Choosing a movement preset leaves grouping, visibility, and expansion settings unchanged. */
export function applyCameraFollowPreset(
  settings: CameraFollowSettings,
  preset: CameraFollowPreset
): CameraFollowSettings {
  const { legacySensitivity: _legacy, ...current } = settings;
  return { ...current, ...PRESETS[preset] };
}

/** Resolve saved custom values; obsolete movement uses Calm without writing project data. */
export function resolveCameraFollowPolicy(input: {
  defaults?: CameraFollowSettings;
  override?: CameraFollowSettings;
  legacySensitivity?: number;
}): ResolvedCameraFollowPolicy {
  const saved = input.override ?? input.defaults;
  return {
    settings: saved
      ? saved.legacySensitivity === undefined
        ? { ...saved }
        : applyCameraFollowPreset(saved, 'calm')
      : createCameraFollowSettings(),
    source: input.override ? 'override' : input.defaults ? 'defaults' : 'legacy',
  };
}

/** Derive coupled screen limits from one transition duration, in output pixels and seconds. */
export function cameraFollowMotionLimits(
  policy: ResolvedCameraFollowPolicy,
  geometry: {
    viewportWidth: number;
    viewportHeight: number;
    windowWidth: number;
    windowHeight: number;
    minimumScale: number;
  }
) {
  const diagonal = Math.hypot(geometry.viewportWidth, geometry.viewportHeight);
  const duration = policy.settings.transitionDuration;
  return {
    speed: (1.875 * diagonal) / duration,
    acceleration: (((10 * Math.sqrt(3)) / 3) * diagonal) / duration ** 2,
    jerk: (60 * diagonal) / duration ** 3,
  };
}
