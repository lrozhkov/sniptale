import type { NativeCaptureSettings } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { NATIVE_TRAY_ACTION_KEYS } from '@sniptale/runtime-contracts/video/types/native-settings';
import { isBoolean, isRecord } from '../infrastructure/guards/primitives';

export function mergeNativeTrayActionDefaults(
  value: Record<string, unknown>
): Record<string, unknown> {
  const defaults = DEFAULT_VIDEO_SETTINGS.native?.trayActions ?? {};
  return {
    ...defaults,
    ...value,
    ...(isRecord(value['captureScreenshot'])
      ? { captureScreenScreenshot: value['captureScreenshot'] }
      : {}),
    ...(isRecord(value['startRecording']) ? { startScreenRecording: value['startRecording'] } : {}),
  };
}

export function hasValidTrayActionSettings(trayActions: Record<string, unknown>): boolean {
  return NATIVE_TRAY_ACTION_KEYS.every((key) => isNativeTrayActionSetting(trayActions[key]));
}

function isNativeTrayActionSetting(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoolean(value['enabled']) &&
    isBoolean(value['offlineCapable']) &&
    typeof value['shortcutLabel'] === 'string' &&
    value['shortcutLabel'].length <= 40
  );
}

export function createTrayActionSettings(
  trayActions: Record<string, unknown>
): NativeCaptureSettings['trayActions'] {
  return {
    captureAllScreensScreenshot: createTrayActionSetting(
      trayActions['captureAllScreensScreenshot']
    ),
    captureRegionScreenshot: createTrayActionSetting(trayActions['captureRegionScreenshot']),
    captureScreenScreenshot: createTrayActionSetting(trayActions['captureScreenScreenshot']),
    captureWindowScreenshot: createTrayActionSetting(trayActions['captureWindowScreenshot']),
    openGallery: createTrayActionSetting(trayActions['openGallery']),
    openSettings: createTrayActionSetting(trayActions['openSettings']),
    openVideoEditor: createTrayActionSetting(trayActions['openVideoEditor']),
    pauseRecording: createTrayActionSetting(trayActions['pauseRecording']),
    resumeRecording: createTrayActionSetting(trayActions['resumeRecording']),
    startRegionRecording: createTrayActionSetting(trayActions['startRegionRecording']),
    startScreenRecording: createTrayActionSetting(trayActions['startScreenRecording']),
    startWindowRecording: createTrayActionSetting(trayActions['startWindowRecording']),
    stopRecording: createTrayActionSetting(trayActions['stopRecording']),
  };
}

function createTrayActionSetting(
  value: unknown
): NativeCaptureSettings['trayActions']['openSettings'] {
  const record = value as Record<string, unknown>;
  return {
    enabled: record['enabled'] as boolean,
    offlineCapable: record['offlineCapable'] as boolean,
    shortcutLabel: record['shortcutLabel'] as string,
  };
}
