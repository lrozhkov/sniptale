import { parseVoiceCaptureToken, parseVoiceInputHistoryScope } from './history';
import { SHA256_DIGEST_PATTERN } from '../protocol/digest';
import { MessageType } from '../messaging/message-types/index';
import {
  VOICE_HISTORY_MAX_DURATION_SECONDS,
  isVoiceInputErrorCode,
  isVoiceInputLanguage,
  VOICE_INPUT_LEVEL_PEAK_COUNT,
  VOICE_INPUT_DEVICE_ID_MAX_CHARS,
  VOICE_INPUT_LOCAL_QUALITY,
  VOICE_INPUT_TEST_SESSION_DURATION_MS,
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  VoiceInputPortMessageType,
} from './types';

// policyStateIds: [] - these sets are immutable parser allowlists, not mutable authority state.
import type {
  OffscreenVoiceInputRuntimeMessage,
  VoiceInputCaptureEvent,
  VoiceInputApiFlavor,
  VoiceInputBusyOwner,
  VoiceInputEffectiveMode,
  VoiceInputFallbackReason,
  VoiceInputLocalAvailability,
  VoiceInputMode,
  VoiceInputPhase,
  VoiceInputPortRequest,
  VoiceInputPreferences,
  VoiceProviderSelection,
  VoiceInputServerEvent,
  VoiceInputSnapshot,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowedKeys = new Set(keys);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function parseVoiceInputLevelPeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== VOICE_INPUT_LEVEL_PEAK_COUNT) return null;
  const peaks: number[] = [];
  for (const peak of value as unknown[]) {
    if (typeof peak !== 'number' || !Number.isFinite(peak) || peak < 0 || peak > 1) {
      return null;
    }
    peaks.push(peak);
  }
  return peaks;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isVoiceInputMode(value: unknown): value is VoiceInputMode {
  return value === 'local-first' || value === 'browser-managed';
}

export function parseVoiceInputPreferences(value: unknown): VoiceInputPreferences | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'enabled',
      'language',
      'microphoneDeviceId',
      'mode',
      'backend',
      'transcription',
      'correction',
    ]) ||
    (value['enabled'] !== undefined && typeof value['enabled'] !== 'boolean') ||
    !isVoiceInputLanguage(value['language']) ||
    (value['microphoneDeviceId'] !== undefined &&
      value['microphoneDeviceId'] !== null &&
      (!isNonEmptyString(value['microphoneDeviceId']) ||
        value['microphoneDeviceId'].length > VOICE_INPUT_DEVICE_ID_MAX_CHARS)) ||
    !isVoiceInputMode(value['mode']) ||
    (value['backend'] !== undefined &&
      value['backend'] !== 'browser' &&
      value['backend'] !== 'model') ||
    (value['transcription'] !== undefined &&
      value['transcription'] !== null &&
      !parseVoiceProviderSelection(value['transcription'])) ||
    (value['correction'] !== undefined && !parseVoiceCorrection(value['correction']))
  ) {
    return null;
  }
  return {
    ...(value['enabled'] === undefined ? {} : { enabled: value['enabled'] }),
    language: value['language'],
    microphoneDeviceId:
      typeof value['microphoneDeviceId'] === 'string' ? value['microphoneDeviceId'] : null,
    mode: value['mode'],
    ...(value['backend'] === undefined ? {} : { backend: value['backend'] }),
    ...(value['transcription'] === undefined
      ? {}
      : { transcription: parseVoiceProviderSelection(value['transcription']) }),
    ...(value['correction'] === undefined
      ? {}
      : { correction: parseVoiceCorrection(value['correction'])! }),
  };
}

/** Parses a user-approved model identity; this value does not itself authorize a request. */
export function parseVoiceProviderSelection(value: unknown): VoiceProviderSelection | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'modelId',
      'approvedProviderId',
      'approvedDestination',
      'approvedModelCode',
    ])
  )
    return null;
  const { modelId, approvedProviderId, approvedDestination, approvedModelCode } = value;
  if (
    ![modelId, approvedProviderId, approvedModelCode].every(
      (field) => typeof field === 'string' && field.length > 0 && field.length <= 512
    ) ||
    typeof modelId !== 'string' ||
    typeof approvedProviderId !== 'string' ||
    typeof approvedModelCode !== 'string' ||
    typeof approvedDestination !== 'string' ||
    !SHA256_DIGEST_PATTERN.test(approvedDestination)
  )
    return null;
  return { modelId, approvedProviderId, approvedDestination, approvedModelCode };
}

function parseVoiceCorrection(
  value: unknown
): NonNullable<VoiceInputPreferences['correction']> | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['enabled', 'model']) ||
    typeof value['enabled'] !== 'boolean'
  )
    return null;
  const model = value['model'] === null ? null : parseVoiceProviderSelection(value['model']);
  return value['model'] !== null && !model ? null : { enabled: value['enabled'], model };
}

/** Resolves legacy absence without silently changing an explicitly selected model backend. */
export function resolveVoiceInputPreferences(value: VoiceInputPreferences) {
  return {
    ...value,
    enabled: value.enabled ?? true,
    backend: value.backend ?? 'browser',
    transcription: value.transcription ?? null,
    correction: value.correction ?? { enabled: false, model: null },
  };
}

const apiFlavors = new Set<VoiceInputApiFlavor>(['standard', 'prefixed', 'unsupported']);
const busyOwners = new Set<VoiceInputBusyOwner>([
  'speech-recognition',
  'video-recording',
  'privacy-erasure',
]);
const effectiveModes = new Set<VoiceInputEffectiveMode>([
  'local',
  'browser-managed',
  'legacy',
  'model',
]);
const localAvailabilities = new Set<VoiceInputLocalAvailability>([
  'available',
  'downloadable',
  'downloading',
  'unavailable',
  'unsupported',
  'unknown',
]);
const phases = new Set<VoiceInputPhase>([
  'idle',
  'checking',
  'installing',
  'starting',
  'listening',
  'stopping',
  'processing-asr',
  'processing-text',
  'ended',
  'error',
]);
const fallbackReasons = new Set<VoiceInputFallbackReason>([
  'local-api-unsupported',
  'local-unavailable',
  'dictation-unsupported',
  'dictation-unavailable',
  'local-install-failed',
  'local-check-failed',
  'local-start-failed',
]);
function isNullableSetValue<TValue extends string>(
  value: unknown,
  values: ReadonlySet<TValue>
): value is TValue | null {
  return value === null || (typeof value === 'string' && values.has(value as TValue));
}

function isSetValue<TValue extends string>(
  value: unknown,
  values: ReadonlySet<TValue>
): value is TValue {
  return typeof value === 'string' && values.has(value as TValue);
}

export function parseVoiceInputSnapshot(value: unknown): VoiceInputSnapshot | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'delivery',
      'apiFlavor',
      'busyOwner',
      'effectiveMode',
      'errorCode',
      'fallbackReason',
      'language',
      'localAvailability',
      'phase',
      'quality',
      'qualitySupported',
      'requestedMode',
      'sessionId',
    ]) ||
    (value['delivery'] !== undefined &&
      value['delivery'] !== 'live' &&
      value['delivery'] !== 'final') ||
    !isSetValue(value['apiFlavor'], apiFlavors) ||
    !isNullableSetValue(value['busyOwner'], busyOwners) ||
    !isNullableSetValue(value['effectiveMode'], effectiveModes) ||
    (value['errorCode'] !== null && !isVoiceInputErrorCode(value['errorCode'])) ||
    !isNullableSetValue(value['fallbackReason'], fallbackReasons) ||
    !isVoiceInputLanguage(value['language']) ||
    !isSetValue(value['localAvailability'], localAvailabilities) ||
    !isSetValue(value['phase'], phases) ||
    value['quality'] !== VOICE_INPUT_LOCAL_QUALITY ||
    typeof value['qualitySupported'] !== 'boolean' ||
    !isVoiceInputMode(value['requestedMode']) ||
    (value['sessionId'] !== null && !isNonEmptyString(value['sessionId']))
  ) {
    return null;
  }
  return {
    ...(value['delivery'] === undefined ? {} : { delivery: value['delivery'] }),
    apiFlavor: value['apiFlavor'],
    busyOwner: value['busyOwner'],
    effectiveMode: value['effectiveMode'],
    errorCode: value['errorCode'],
    fallbackReason: value['fallbackReason'],
    language: value['language'],
    localAvailability: value['localAvailability'],
    phase: value['phase'],
    quality: value['quality'],
    qualitySupported: value['qualitySupported'],
    requestedMode: value['requestedMode'],
    sessionId: value['sessionId'],
  };
}

export function parseVoiceInputPortRequest(value: unknown): VoiceInputPortRequest | null {
  if (!isRecord(value) || !isNonEmptyString(value['requestId'])) return null;
  if (
    value['type'] === VoiceInputPortMessageType.STATUS &&
    hasOnlyKeys(value, ['requestId', 'type'])
  ) {
    return { requestId: value['requestId'], type: value['type'] };
  }
  if (
    value['type'] === VoiceInputPortMessageType.START &&
    hasOnlyKeys(value, ['preferences', 'requestId', 'sessionId', 'type']) &&
    isNonEmptyString(value['sessionId'])
  ) {
    const preferences = parseVoiceInputPreferences(value['preferences']);
    return preferences
      ? {
          preferences,
          requestId: value['requestId'],
          sessionId: value['sessionId'],
          type: value['type'],
        }
      : null;
  }
  if (
    (value['type'] === VoiceInputPortMessageType.STOP ||
      value['type'] === VoiceInputPortMessageType.CANCEL) &&
    hasOnlyKeys(value, ['requestId', 'sessionId', 'type']) &&
    isNonEmptyString(value['sessionId'])
  ) {
    return { requestId: value['requestId'], sessionId: value['sessionId'], type: value['type'] };
  }
  return null;
}

export function parseVoiceInputServerEvent(value: unknown): VoiceInputServerEvent | null {
  if (!isRecord(value)) return null;
  if (
    value['type'] === VoiceInputPortMessageType.AUDIO_LEVEL &&
    hasOnlyKeys(value, ['level', 'peaks', 'sessionId', 'type']) &&
    typeof value['level'] === 'number' &&
    Number.isFinite(value['level']) &&
    value['level'] >= 0 &&
    value['level'] <= 1 &&
    isNonEmptyString(value['sessionId'])
  ) {
    const peaks = parseVoiceInputLevelPeaks(value['peaks']);
    return peaks
      ? { level: value['level'], peaks, sessionId: value['sessionId'], type: value['type'] }
      : null;
  }
  if (
    value['type'] === VoiceInputPortMessageType.SNAPSHOT &&
    hasOnlyKeys(value, ['requestId', 'snapshot', 'type']) &&
    (value['requestId'] === undefined || isNonEmptyString(value['requestId']))
  ) {
    const snapshot = parseVoiceInputSnapshot(value['snapshot']);
    return snapshot
      ? {
          ...(value['requestId'] === undefined ? {} : { requestId: value['requestId'] as string }),
          snapshot,
          type: value['type'],
        }
      : null;
  }
  if (
    value['type'] === VoiceInputPortMessageType.TRANSCRIPT &&
    hasOnlyKeys(value, ['confidence', 'isFinal', 'sequence', 'sessionId', 'text', 'type']) &&
    (value['confidence'] === null ||
      (typeof value['confidence'] === 'number' &&
        Number.isFinite(value['confidence']) &&
        value['confidence'] >= 0 &&
        value['confidence'] <= 1)) &&
    typeof value['isFinal'] === 'boolean' &&
    Number.isSafeInteger(value['sequence']) &&
    typeof value['sequence'] === 'number' &&
    value['sequence'] >= 0 &&
    isNonEmptyString(value['sessionId']) &&
    typeof value['text'] === 'string' &&
    value['text'].length <= VOICE_INPUT_TRANSCRIPT_MAX_CHARS
  ) {
    return {
      confidence: value['confidence'],
      isFinal: value['isFinal'],
      sequence: value['sequence'],
      sessionId: value['sessionId'],
      text: value['text'],
      type: value['type'],
    };
  }
  if (
    value['type'] === VoiceInputPortMessageType.FAILURE &&
    hasOnlyKeys(value, ['errorCode', 'requestId', 'sessionId', 'snapshot', 'type']) &&
    isVoiceInputErrorCode(value['errorCode']) &&
    (value['requestId'] === undefined || isNonEmptyString(value['requestId'])) &&
    (value['sessionId'] === undefined || isNonEmptyString(value['sessionId']))
  ) {
    const snapshot = parseVoiceInputSnapshot(value['snapshot']);
    return snapshot
      ? {
          errorCode: value['errorCode'],
          ...(value['requestId'] === undefined ? {} : { requestId: value['requestId'] }),
          ...(value['sessionId'] === undefined ? {} : { sessionId: value['sessionId'] }),
          snapshot,
          type: value['type'],
        }
      : null;
  }
  return null;
}

/** Only the trusted offscreen runtime receives this scoped handoff protocol. */
export function parseVoiceInputCaptureEvent(value: unknown): VoiceInputCaptureEvent | null {
  if (!isRecord(value) || !isNonEmptyString(value['sessionId'])) return null;
  if (
    value['type'] === 'VOICE_INPUT_CAPTURE_RELEASED' &&
    hasOnlyKeys(value, ['type', 'sessionId'])
  ) {
    return { type: value['type'], sessionId: value['sessionId'] };
  }
  if (
    value['type'] !== 'VOICE_INPUT_CAPTURE_READY' ||
    !hasOnlyKeys(value, ['type', 'sessionId', 'scope', 'rawTranscript', 'durationSeconds']) ||
    (value['rawTranscript'] !== null &&
      (typeof value['rawTranscript'] !== 'string' ||
        value['rawTranscript'].length > VOICE_INPUT_TRANSCRIPT_MAX_CHARS)) ||
    typeof value['durationSeconds'] !== 'number' ||
    !Number.isFinite(value['durationSeconds']) ||
    value['durationSeconds'] <= 0 ||
    value['durationSeconds'] > VOICE_HISTORY_MAX_DURATION_SECONDS
  )
    return null;
  const scope = parseVoiceInputHistoryScope(value['scope']);
  return scope
    ? {
        type: value['type'],
        sessionId: value['sessionId'],
        scope,
        rawTranscript: value['rawTranscript'],
        durationSeconds: value['durationSeconds'],
      }
    : null;
}

export function parseOffscreenVoiceInputRuntimeMessage(
  value: unknown
): OffscreenVoiceInputRuntimeMessage | null {
  if (!isRecord(value)) return null;
  if (
    value['type'] === MessageType.OFFSCREEN_VOICE_INPUT_EVENT &&
    hasOnlyKeys(value, ['event', 'type'])
  ) {
    const event =
      parseVoiceInputCaptureEvent(value['event']) ?? parseVoiceInputServerEvent(value['event']);
    return event ? { event, type: value['type'] } : null;
  }
  if (!isNonEmptyString(value['capabilityToken']) || !isNonEmptyString(value['requestId'])) {
    return null;
  }
  if (
    value['type'] === MessageType.OFFSCREEN_VOICE_INPUT_STATUS &&
    hasOnlyKeys(value, ['capabilityToken', 'requestId', 'type'])
  ) {
    return {
      capabilityToken: value['capabilityToken'],
      requestId: value['requestId'],
      type: value['type'],
    };
  }
  if (
    value['type'] === MessageType.OFFSCREEN_VOICE_INPUT_START &&
    value['quality'] === VOICE_INPUT_LOCAL_QUALITY &&
    (value['maxDurationMs'] === null ||
      value['maxDurationMs'] === VOICE_INPUT_TEST_SESSION_DURATION_MS) &&
    isNonEmptyString(value['sessionId']) &&
    hasOnlyKeys(value, [
      'capabilityToken',
      'maxDurationMs',
      'captureToken',
      'preferences',
      'quality',
      'requestId',
      'sessionId',
      'type',
    ]) &&
    parseVoiceInputPreferences(value['preferences']) !== null
  ) {
    const preferences = parseVoiceInputPreferences(value['preferences']);
    const captureToken = parseVoiceCaptureToken(value['captureToken']);
    if (
      !preferences ||
      (preferences.backend === 'model' ? !captureToken : value['captureToken'] !== null)
    )
      return null;
    return {
      captureToken,
      capabilityToken: value['capabilityToken'],
      maxDurationMs: value['maxDurationMs'],
      preferences,
      quality: value['quality'],
      requestId: value['requestId'],
      sessionId: value['sessionId'],
      type: value['type'],
    };
  }
  if (
    value['type'] === MessageType.OFFSCREEN_VOICE_INPUT_STOP &&
    typeof value['force'] === 'boolean' &&
    isNonEmptyString(value['sessionId']) &&
    hasOnlyKeys(value, ['capabilityToken', 'force', 'requestId', 'sessionId', 'type'])
  ) {
    return {
      capabilityToken: value['capabilityToken'],
      force: value['force'],
      requestId: value['requestId'],
      sessionId: value['sessionId'],
      type: value['type'],
    };
  }
  return null;
}
