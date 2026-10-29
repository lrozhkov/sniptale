import type { MessageType } from '../messaging/message-types/index';
import type { RuntimeMessageResponse } from '../messaging/contracts/response';

export const VOICE_INPUT_PORT_NAME = 'sniptale:voice-input:v1';
export const VOICE_INPUT_TELEMETRY_PORT_NAME = 'sniptale:voice-input-telemetry:v1';
export const VOICE_INPUT_LOCAL_QUALITY = 'dictation' as const;
export const VOICE_INPUT_DEVICE_ID_MAX_CHARS = 512;
export const VOICE_INPUT_LEVEL_PEAK_COUNT = 16;
export const VOICE_INPUT_TRANSCRIPT_MAX_CHARS = 100_000;
export const VOICE_INPUT_TEST_SESSION_DURATION_MS = 30_000;

export const VoiceInputPortMessageType = {
  STATUS: 'VOICE_INPUT_STATUS',
  START: 'VOICE_INPUT_START',
  STOP: 'VOICE_INPUT_STOP',
  CANCEL: 'VOICE_INPUT_CANCEL',
  SNAPSHOT: 'VOICE_INPUT_SNAPSHOT',
  TRANSCRIPT: 'VOICE_INPUT_TRANSCRIPT',
  AUDIO_LEVEL: 'VOICE_INPUT_AUDIO_LEVEL',
  FAILURE: 'VOICE_INPUT_FAILURE',
} as const;

export type VoiceInputLanguage = 'ru-RU' | 'en-US';
export type VoiceInputMode = 'local-first' | 'browser-managed';
export type VoiceInputApiFlavor = 'standard' | 'prefixed' | 'unsupported';
export type VoiceInputLocalAvailability =
  | 'available'
  | 'downloadable'
  | 'downloading'
  | 'unavailable'
  | 'unsupported'
  | 'unknown';
export type VoiceInputEffectiveMode = 'local' | 'browser-managed' | 'legacy' | 'model';
export type VoiceInputPhase =
  | 'idle'
  | 'checking'
  | 'installing'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'processing-asr'
  | 'processing-text'
  | 'ended'
  | 'error';
export type VoiceInputBusyOwner = 'speech-recognition' | 'video-recording' | 'privacy-erasure';
export type VoiceInputFallbackReason =
  | 'local-api-unsupported'
  | 'local-unavailable'
  | 'dictation-unsupported'
  | 'dictation-unavailable'
  | 'local-install-failed'
  | 'local-check-failed'
  | 'local-start-failed';
const voiceInputErrorCodes = [
  'unsupported',
  'permission-denied',
  'microphone-unavailable',
  'microphone-busy',
  'no-speech',
  'language-not-supported',
  'network',
  'service-not-allowed',
  'local-install-failed',
  'offscreen-unavailable',
  'busy-video',
  'busy-speech',
  'privacy-erasure-in-progress',
  'timeout',
  'aborted',
  'stopped',
  'unexpected',
  'model-unavailable',
  'storage-failed',
  'provider-failed',
  'provider-invalid-credential',
  'provider-permission-denied',
  'provider-quota-exceeded',
  'provider-rate-limited',
  'provider-service-error',
  'provider-host-permission-required',
  'provider-secret-locked',
  'provider-unavailable',
  'too-large',
  'stale',
] as const;

export type VoiceInputErrorCode = (typeof voiceInputErrorCodes)[number];

/** Checks the canonical fixed error-code vocabulary at receiving boundaries. */
export function isVoiceInputErrorCode(value: unknown): value is VoiceInputErrorCode {
  return typeof value === 'string' && voiceInputErrorCodes.some((code) => code === value);
}

export function isVoiceInputLanguage(value: unknown): value is VoiceInputLanguage {
  return value === 'ru-RU' || value === 'en-US';
}

/** Explicit provider approval binding. Credentials and endpoint URLs never enter this DTO. */
export interface VoiceProviderSelection {
  modelId: string;
  approvedProviderId: string;
  approvedDestination: string;
  approvedModelCode: string;
}

export interface VoiceInputPreferences {
  enabled?: boolean;
  language: VoiceInputLanguage;
  microphoneDeviceId: string | null;
  mode: VoiceInputMode;
  backend?: 'browser' | 'model';
  transcription?: VoiceProviderSelection | null;
  correction?: { enabled: boolean; model: VoiceProviderSelection | null };
}

export interface VoiceInputSnapshot {
  delivery?: 'live' | 'final';
  apiFlavor: VoiceInputApiFlavor;
  busyOwner: VoiceInputBusyOwner | null;
  effectiveMode: VoiceInputEffectiveMode | null;
  errorCode: VoiceInputErrorCode | null;
  fallbackReason: VoiceInputFallbackReason | null;
  language: VoiceInputLanguage;
  localAvailability: VoiceInputLocalAvailability;
  phase: VoiceInputPhase;
  quality: typeof VOICE_INPUT_LOCAL_QUALITY;
  qualitySupported: boolean;
  requestedMode: VoiceInputMode;
  sessionId: string | null;
}

export type VoiceInputPortRequest =
  | {
      type: typeof VoiceInputPortMessageType.STATUS;
      requestId: string;
    }
  | {
      type: typeof VoiceInputPortMessageType.START;
      preferences: VoiceInputPreferences;
      requestId: string;
      sessionId: string;
    }
  | {
      type: typeof VoiceInputPortMessageType.STOP;
      requestId: string;
      sessionId: string;
    }
  | {
      type: typeof VoiceInputPortMessageType.CANCEL;
      requestId: string;
      sessionId: string;
    };

export type VoiceInputServerEvent =
  | {
      type: typeof VoiceInputPortMessageType.SNAPSHOT;
      requestId?: string;
      snapshot: VoiceInputSnapshot;
    }
  | {
      type: typeof VoiceInputPortMessageType.TRANSCRIPT;
      confidence: number | null;
      isFinal: boolean;
      sequence: number;
      sessionId: string;
      text: string;
    }
  | {
      type: typeof VoiceInputPortMessageType.AUDIO_LEVEL;
      level: number;
      peaks: number[];
      sessionId: string;
    }
  | {
      type: typeof VoiceInputPortMessageType.FAILURE;
      errorCode: VoiceInputErrorCode;
      requestId?: string;
      sessionId?: string;
      snapshot: VoiceInputSnapshot;
    };

export type OffscreenVoiceInputCommand =
  | {
      capabilityToken: string;
      type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STATUS;
      requestId: string;
    }
  | {
      capabilityToken: string;
      captureToken: VoiceCaptureToken | null;
      maxDurationMs: typeof VOICE_INPUT_TEST_SESSION_DURATION_MS | null;
      type: typeof MessageType.OFFSCREEN_VOICE_INPUT_START;
      preferences: VoiceInputPreferences;
      quality: typeof VOICE_INPUT_LOCAL_QUALITY;
      requestId: string;
      sessionId: string;
    }
  | {
      capabilityToken: string;
      force: boolean;
      type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STOP;
      requestId: string;
      sessionId: string;
    };

/** Trusted offscreen handoff; never forward these events to a public voice Port. */
export type VoiceInputCaptureEvent =
  | { type: 'VOICE_INPUT_CAPTURE_RELEASED'; sessionId: string }
  | {
      type: 'VOICE_INPUT_CAPTURE_READY';
      sessionId: string;
      scope: VoiceHistoryScope;
      rawTranscript: string | null;
      durationSeconds: number;
    };

export type OffscreenVoiceInputEventMessage = {
  event: VoiceInputServerEvent | VoiceInputCaptureEvent;
  type: typeof MessageType.OFFSCREEN_VOICE_INPUT_EVENT;
};

export type OffscreenVoiceInputRuntimeMessage =
  | OffscreenVoiceInputCommand
  | OffscreenVoiceInputEventMessage;

export type OffscreenVoiceInputResponse = RuntimeMessageResponse<{
  result?: 'accepted' | 'stale';
  snapshot?: VoiceInputSnapshot;
}>;

export type VoiceInputRuntimeRequestByType = {
  [MessageType.OFFSCREEN_VOICE_INPUT_STATUS]: Extract<
    OffscreenVoiceInputCommand,
    { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STATUS }
  >;
  [MessageType.OFFSCREEN_VOICE_INPUT_START]: Extract<
    OffscreenVoiceInputCommand,
    { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_START }
  >;
  [MessageType.OFFSCREEN_VOICE_INPUT_STOP]: Extract<
    OffscreenVoiceInputCommand,
    { type: typeof MessageType.OFFSCREEN_VOICE_INPUT_STOP }
  >;
  [MessageType.OFFSCREEN_VOICE_INPUT_EVENT]: OffscreenVoiceInputEventMessage;
};

export type VoiceInputRuntimeResponseByType = {
  [TType in keyof VoiceInputRuntimeRequestByType]: OffscreenVoiceInputResponse;
};

export const VOICE_HISTORY_LIMIT = 20;
export const VOICE_HISTORY_MAX_AUDIO_BYTES = 24 * 1024 * 1024;
export const VOICE_HISTORY_MAX_DURATION_SECONDS =
  Math.floor((VOICE_HISTORY_MAX_AUDIO_BYTES - 44) / 2) / 16_000;
export const VOICE_HISTORY_MIME_TYPES = [
  'audio/wav',
  'audio/webm',
  'audio/webm;codecs=opus',
] as const;

/** Immutable capture admission; an erased epoch cannot publish again. */
export interface VoiceCaptureToken {
  entryId: string;
  incarnation: string;
  epoch: string;
  sequence: number;
  createdAt: number;
}

/** A revision is required for mutations; immutable audio reads may use an older revision. */
export interface VoiceHistoryScope {
  entryId: string;
  incarnation: string;
  epoch: string;
  revision: number;
  audioDigest: string;
}

export interface VoiceHistoryEntry extends VoiceHistoryScope {
  sequence: number;
  createdAt: number;
  backend: 'browser' | 'model';
  language: VoiceInputLanguage;
  durationSeconds: number;
  byteLength: number;
  mimeType: (typeof VOICE_HISTORY_MIME_TYPES)[number];
  rawTranscript: string | null;
  transcript: string | null;
  status: 'recorded' | 'processing' | 'ready' | 'failed' | 'cancelled';
  correctionStatus: 'off' | 'applied' | 'failed';
  /** The latest processing-stage failure. Ready text can retain a failed optional correction reason. */
  failureCode: VoiceInputErrorCode | null;
}

export const VOICE_INPUT_HISTORY_PORT_NAME = 'sniptale:voice-input-history:v1';

export type VoiceHistoryRequest =
  | { type: 'list'; requestId: string }
  | { type: 'retry' | 'delete'; requestId: string; scope: VoiceHistoryScope };

export type VoiceHistoryServerEvent =
  | { type: 'list'; requestId: string; entries: VoiceHistoryEntry[] }
  | { type: 'entry'; requestId: string; entry: VoiceHistoryEntry }
  | { type: 'deleted'; requestId: string; scope: VoiceHistoryScope }
  | {
      type: 'progress';
      requestId: string;
      phase: 'processing-asr' | 'processing-text';
      scope: VoiceHistoryScope;
    }
  | { type: 'failure'; requestId: string; code: VoiceInputErrorCode };
