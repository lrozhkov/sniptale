import type {
  NativeCaptureSettings,
  NativeVideoAdvancedSettings,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { isBoolean, isNumber, isRecord } from '../infrastructure/guards/primitives';
import { INVALID_FIELD, type ParsedFieldValue } from './field-parser';
import {
  createTrayActionSettings,
  hasValidTrayActionSettings,
  mergeNativeTrayActionDefaults,
} from './native-tray-guards';

function isNativeFrameRate(value: unknown): value is NativeVideoAdvancedSettings['frameRate'] {
  return value === 'auto' || value === 24 || value === 30 || value === 60;
}

function isNativeAudioBitrate(
  value: unknown
): value is NativeVideoAdvancedSettings['audioBitrateKbps'] {
  return value === 96 || value === 128 || value === 160 || value === 192;
}

function isNativeAudioSourceMode(
  value: unknown
): value is NativeVideoAdvancedSettings['audioSourceMode'] {
  return value === 'microphone' || value === 'system' || value === 'mixed';
}

function isNativeHardwareAcceleration(
  value: unknown
): value is NativeCaptureSettings['video']['codec']['hardwareAcceleration'] {
  return value === 'prefer' || value === 'force-software';
}

function parseNativeBitrateOverride(value: unknown): number | null | typeof INVALID_FIELD {
  if (value === null) {
    return null;
  }

  if (!isNumber(value) || value < 2 || value > 80) {
    return INVALID_FIELD;
  }

  return value;
}

interface NativeSettingsRecords {
  advanced: Record<string, unknown>;
  codec: Record<string, unknown>;
  screenshots: Record<string, unknown>;
  telemetry: Record<string, unknown>;
  trayActions: Record<string, unknown>;
  video: Record<string, unknown>;
}

function readNativeSettingsRecords(value: unknown): NativeSettingsRecords | typeof INVALID_FIELD {
  if (!isRecord(value) || !isRecord(value['screenshots']) || !isRecord(value['video'])) {
    return INVALID_FIELD;
  }

  const screenshots = value['screenshots'];
  const defaultTrayActions = DEFAULT_VIDEO_SETTINGS.native?.trayActions;
  const trayActions: Record<string, unknown> | undefined = isRecord(value['trayActions'])
    ? mergeNativeTrayActionDefaults(value['trayActions'])
    : defaultTrayActions
      ? { ...defaultTrayActions }
      : undefined;
  const video = value['video'];
  if (!isRecord(video['advanced']) || !isRecord(video['codec']) || !isRecord(video['telemetry'])) {
    return INVALID_FIELD;
  }

  const advanced = video['advanced'];
  const codec = video['codec'];
  const telemetry = video['telemetry'];
  return trayActions
    ? { advanced, codec, screenshots, telemetry, trayActions, video }
    : INVALID_FIELD;
}

function hasValidNativeSettingsFields(records: NativeSettingsRecords): boolean {
  const { advanced, codec, screenshots, telemetry, trayActions, video } = records;
  const bitrateOverride = parseNativeBitrateOverride(advanced['videoBitrateMbpsOverride']);

  return (
    isBoolean(screenshots['includeCursor']) &&
    hasValidTrayActionSettings(trayActions) &&
    isBoolean(video['enabled']) &&
    isNativeAudioBitrate(advanced['audioBitrateKbps']) &&
    isNativeAudioSourceMode(advanced['audioSourceMode']) &&
    isNativeFrameRate(advanced['frameRate']) &&
    isBoolean(advanced['includeCursorInVideo']) &&
    isNumber(advanced['maxDurationMinutes']) &&
    advanced['maxDurationMinutes'] >= 1 &&
    advanced['maxDurationMinutes'] <= 720 &&
    isBoolean(advanced['preferHardwareEncoder']) &&
    bitrateOverride !== INVALID_FIELD &&
    codec['audioCodec'] === 'aac' &&
    codec['container'] === 'mp4' &&
    isNativeHardwareAcceleration(codec['hardwareAcceleration']) &&
    codec['videoCodec'] === 'h264' &&
    isBoolean(telemetry['collectCursor']) &&
    isBoolean(telemetry['collectClicks']) &&
    isBoolean(telemetry['collectKeyEvents']) &&
    isBoolean(telemetry['collectTypingSpans']) &&
    isBoolean(telemetry['collectStaticSignals'])
  );
}

function createNativeSettings(
  records: NativeSettingsRecords
): VideoRecordingSettings['native'] | typeof INVALID_FIELD {
  const { advanced, codec, screenshots, telemetry, trayActions, video } = records;
  const bitrateOverride = parseNativeBitrateOverride(advanced['videoBitrateMbpsOverride']);
  if (bitrateOverride === INVALID_FIELD) {
    return INVALID_FIELD;
  }
  const maxDurationMinutes = advanced['maxDurationMinutes'] as number;

  return {
    screenshots: {
      includeCursor: screenshots['includeCursor'] as boolean,
    },
    trayActions: createTrayActionSettings(trayActions),
    video: {
      advanced: {
        audioBitrateKbps: advanced[
          'audioBitrateKbps'
        ] as NativeVideoAdvancedSettings['audioBitrateKbps'],
        audioSourceMode: advanced[
          'audioSourceMode'
        ] as NativeVideoAdvancedSettings['audioSourceMode'],
        frameRate: advanced['frameRate'] as NativeVideoAdvancedSettings['frameRate'],
        includeCursorInVideo: advanced['includeCursorInVideo'] as boolean,
        maxDurationMinutes: Math.floor(maxDurationMinutes),
        preferHardwareEncoder: advanced['preferHardwareEncoder'] as boolean,
        videoBitrateMbpsOverride: bitrateOverride,
      },
      codec: {
        audioCodec: 'aac',
        container: 'mp4',
        hardwareAcceleration: codec[
          'hardwareAcceleration'
        ] as NativeCaptureSettings['video']['codec']['hardwareAcceleration'],
        videoCodec: 'h264',
      },
      enabled: video['enabled'] as boolean,
      telemetry: {
        collectClicks: telemetry['collectClicks'] as boolean,
        collectCursor: telemetry['collectCursor'] as boolean,
        collectKeyEvents: telemetry['collectKeyEvents'] as boolean,
        collectStaticSignals: telemetry['collectStaticSignals'] as boolean,
        collectTypingSpans: telemetry['collectTypingSpans'] as boolean,
      },
    },
  };
}

export function parseOptionalNativeSettings(
  value: unknown
): ParsedFieldValue<VideoRecordingSettings['native']> {
  if (value === undefined) {
    return undefined;
  }

  const records = readNativeSettingsRecords(value);
  if (records === INVALID_FIELD || !hasValidNativeSettingsFields(records)) {
    return INVALID_FIELD;
  }

  return createNativeSettings(records);
}
