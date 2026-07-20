import {
  WebcamFrameRatePreset,
  WebcamResolutionPreset,
  type VideoRecordingSettings,
  type WebcamQualitySettings,
} from './types';

export const WEBCAM_RESOLUTION_PRESETS = [
  {
    height: 720,
    value: WebcamResolutionPreset.P720,
    width: 1280,
  },
  {
    height: 1080,
    value: WebcamResolutionPreset.P1080,
    width: 1920,
  },
  {
    height: 1440,
    value: WebcamResolutionPreset.P1440,
    width: 2560,
  },
  {
    height: 2160,
    value: WebcamResolutionPreset.P4K,
    width: 3840,
  },
] as const;

export const WEBCAM_FRAME_RATE_PRESETS = [
  {
    fps: 30,
    value: WebcamFrameRatePreset.FPS30,
  },
  {
    fps: 60,
    value: WebcamFrameRatePreset.FPS60,
  },
] as const;

export const DEFAULT_WEBCAM_QUALITY_SETTINGS: WebcamQualitySettings = {
  frameRate: WebcamFrameRatePreset.AUTO,
  resolution: WebcamResolutionPreset.AUTO,
};

export function resolveWebcamQualitySettings(
  settings: Pick<VideoRecordingSettings, 'webcamQuality'>
): WebcamQualitySettings {
  return settings.webcamQuality ?? DEFAULT_WEBCAM_QUALITY_SETTINGS;
}

export function resolveWebcamResolutionPresetSize(preset: WebcamResolutionPreset): {
  height: number;
  width: number;
} | null {
  return WEBCAM_RESOLUTION_PRESETS.find((entry) => entry.value === preset) ?? null;
}

export function resolveWebcamFrameRatePresetValue(preset: WebcamFrameRatePreset): number | null {
  return WEBCAM_FRAME_RATE_PRESETS.find((entry) => entry.value === preset)?.fps ?? null;
}

export function buildWebcamQualityConstraints(
  quality: WebcamQualitySettings
): MediaTrackConstraints {
  const resolution = resolveWebcamResolutionPresetSize(quality.resolution);
  const frameRate = resolveWebcamFrameRatePresetValue(quality.frameRate);

  return {
    ...(resolution
      ? { height: { ideal: resolution.height }, width: { ideal: resolution.width } }
      : {}),
    ...(frameRate ? { frameRate: { ideal: frameRate } } : {}),
  };
}

function supportsNumberRange(range: MediaSettingsRange | undefined, target: number): boolean {
  if (typeof range?.min !== 'number' || typeof range.max !== 'number') {
    return false;
  }

  return range.min <= target && range.max >= target;
}

export function isWebcamResolutionPresetSupported(
  capabilities: MediaTrackCapabilities | null,
  preset: WebcamResolutionPreset
): boolean {
  if (preset === WebcamResolutionPreset.AUTO) {
    return true;
  }

  const resolution = resolveWebcamResolutionPresetSize(preset);
  if (!resolution || !capabilities) {
    return false;
  }

  return (
    supportsNumberRange(capabilities.width, resolution.width) &&
    supportsNumberRange(capabilities.height, resolution.height)
  );
}

export function isWebcamFrameRatePresetSupported(
  capabilities: MediaTrackCapabilities | null,
  preset: WebcamFrameRatePreset
): boolean {
  if (preset === WebcamFrameRatePreset.AUTO) {
    return true;
  }

  const frameRate = resolveWebcamFrameRatePresetValue(preset);
  if (!frameRate || !capabilities) {
    return false;
  }

  return supportsNumberRange(capabilities.frameRate, frameRate);
}
