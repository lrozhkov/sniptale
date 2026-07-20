import { NATIVE_APP_SETTINGS_SCHEMA_VERSION } from '../../../contracts/native-app';
import type {
  NativeAppCapabilities,
  NativeRequestedQualitySettings,
  NativeTrayActionRegistry,
} from '../../../contracts/native-app';
import { getQuickActions } from '../../../composition/persistence/quick-actions';
import { loadVideoSettings } from '../../../composition/persistence/capture-settings';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type NativeCaptureSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { createNativeCanonicalRevision } from './revision';
import { createNativeTrayActionRegistry } from './tray-action-registry';

const QUALITY_AUDIO_BITRATE = {
  [VideoQuality.LOW]: 96,
  [VideoQuality.MEDIUM]: 128,
  [VideoQuality.HIGH]: 160,
  [VideoQuality.ULTRA]: 192,
} as const;

export function normalizeNativeCaptureSettings(
  settings: NativeCaptureSettings | undefined,
  quality: VideoQuality
): NativeCaptureSettings {
  const defaults = DEFAULT_VIDEO_SETTINGS.native as NativeCaptureSettings;
  const audioBitrateKbps = QUALITY_AUDIO_BITRATE[quality];

  return {
    screenshots: settings?.screenshots ?? defaults.screenshots,
    trayActions: settings?.trayActions ?? defaults.trayActions,
    video: {
      advanced: {
        ...defaults.video.advanced,
        audioBitrateKbps,
        ...(settings?.video.advanced ?? {}),
      },
      codec: settings?.video.codec ?? defaults.video.codec,
      enabled: settings?.video.enabled ?? defaults.video.enabled,
      telemetry: settings?.video.telemetry ?? defaults.video.telemetry,
    },
  };
}

export function createNativeRequestedQualitySettings(
  native: NativeCaptureSettings,
  quality: VideoQuality
): NativeRequestedQualitySettings {
  return {
    audioBitrateKbps: native.video.advanced.audioBitrateKbps,
    audioSourceMode: native.video.advanced.audioSourceMode,
    frameRate: native.video.advanced.frameRate,
    quality,
    videoBitrateMbpsOverride: native.video.advanced.videoBitrateMbpsOverride,
  };
}

async function createSettingsRevision(args: {
  native: NativeCaptureSettings;
  quality: VideoQuality;
  schemaVersion: number;
  trayActions: NativeTrayActionRegistry;
}): Promise<string> {
  return createNativeCanonicalRevision('settings', args);
}

export async function loadNativeSettingsSnapshot(
  capabilities: NativeAppCapabilities | null = null
): Promise<{
  native: NativeCaptureSettings;
  quality: VideoQuality;
  revision: string;
  schemaVersion: number;
  trayActions: NativeTrayActionRegistry;
}> {
  const [settings, quickActions] = await Promise.all([loadVideoSettings(), getQuickActions()]);
  const native = normalizeNativeCaptureSettings(settings.native, settings.quality);
  const schemaVersion = NATIVE_APP_SETTINGS_SCHEMA_VERSION;
  const trayActions = await createNativeTrayActionRegistry(native, capabilities, quickActions);
  return {
    native,
    quality: settings.quality,
    revision: await createSettingsRevision({
      native,
      quality: settings.quality,
      schemaVersion,
      trayActions,
    }),
    schemaVersion,
    trayActions,
  };
}
