import type { MessageType } from '../messaging/message-types/index';
import type { RuntimeMessageResponse } from '../messaging/contracts/response';

export const VOICE_INPUT_PORT_NAME = 'sniptale:voice-input:v1';
export const VOICE_INPUT_LOCAL_QUALITY = 'dictation' as const;
export const VOICE_INPUT_DEVICE_ID_MAX_CHARS = 512;
export const VOICE_INPUT_TRANSCRIPT_MAX_CHARS = 16_000;

export const VoiceInputPortMessageType = {
  STATUS: 'VOICE_INPUT_STATUS',
  START: 'VOICE_INPUT_START',
  STOP: 'VOICE_INPUT_STOP',
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
export type VoiceInputEffectiveMode = 'local' | 'browser-managed' | 'legacy';
export type VoiceInputPhase =
  | 'idle'
  | 'checking'
  | 'installing'
  | 'starting'
  | 'listening'
  | 'stopping'
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
export type VoiceInputErrorCode =
  | 'unsupported'
  | 'permission-denied'
  | 'microphone-unavailable'
  | 'microphone-busy'
  | 'no-speech'
  | 'language-not-supported'
  | 'network'
  | 'service-not-allowed'
  | 'local-install-failed'
  | 'offscreen-unavailable'
  | 'busy-video'
  | 'busy-speech'
  | 'privacy-erasure-in-progress'
  | 'timeout'
  | 'aborted'
  | 'stopped'
  | 'unexpected';

export interface VoiceInputPreferences {
  language: VoiceInputLanguage;
  microphoneDeviceId: string | null;
  mode: VoiceInputMode;
}

export interface VoiceInputSnapshot {
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

export type OffscreenVoiceInputEventMessage = {
  event: VoiceInputServerEvent;
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
