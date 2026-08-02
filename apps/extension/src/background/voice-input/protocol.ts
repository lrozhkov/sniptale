import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  VoiceInputPortMessageType,
  type VoiceInputErrorCode,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputConsumerId } from './consumer-policy';

const logger = createLogger({ namespace: 'BackgroundSpeechRecognition' });

export type VoiceInputPortRegistration = {
  consumerId: VoiceInputConsumerId;
  documentId: string;
  port: chrome.runtime.Port;
};

export type ActiveVoiceInputSession = VoiceInputPortRegistration & {
  offscreenObserved: boolean;
  offscreenSessionId: string;
  preferences: VoiceInputPreferences;
  startRollbackPending: boolean;
  sessionId: string;
};

const DEFAULT_PREFERENCES: VoiceInputPreferences = {
  language: 'ru-RU',
  microphoneDeviceId: null,
  mode: 'local-first',
};

export function createIdleVoiceInputSnapshot(
  preferences = DEFAULT_PREFERENCES
): VoiceInputSnapshot {
  return {
    apiFlavor: 'unsupported',
    busyOwner: null,
    effectiveMode: null,
    errorCode: null,
    fallbackReason: null,
    language: preferences.language,
    localAvailability: 'unknown',
    phase: 'idle',
    quality: VOICE_INPUT_LOCAL_QUALITY,
    qualitySupported: false,
    requestedMode: preferences.mode,
    sessionId: null,
  };
}

export function postVoiceInputPortEvent(
  registration: VoiceInputPortRegistration,
  event: VoiceInputServerEvent
): void {
  try {
    registration.port.postMessage(event);
  } catch {
    logger.warn('Failed to deliver voice input event', {
      consumerId: registration.consumerId,
      documentId: registration.documentId,
      eventType: event.type,
    });
  }
}

export function createVoiceInputFailureEvent(args: {
  errorCode: VoiceInputErrorCode;
  preferences?: VoiceInputPreferences;
  requestId?: string;
  sessionId?: string;
}): VoiceInputServerEvent {
  return {
    errorCode: args.errorCode,
    ...(args.requestId === undefined ? {} : { requestId: args.requestId }),
    ...(args.sessionId === undefined ? {} : { sessionId: args.sessionId }),
    snapshot: {
      ...createIdleVoiceInputSnapshot(args.preferences),
      errorCode: args.errorCode,
      phase: 'error',
      sessionId: args.sessionId ?? null,
    },
    type: VoiceInputPortMessageType.FAILURE,
  };
}

export function createVoiceInputSnapshotEvent(
  snapshot: VoiceInputSnapshot,
  requestId: string
): VoiceInputServerEvent {
  if (snapshot.phase === 'error' && snapshot.errorCode) {
    return {
      errorCode: snapshot.errorCode,
      requestId,
      ...(snapshot.sessionId === null ? {} : { sessionId: snapshot.sessionId }),
      snapshot,
      type: VoiceInputPortMessageType.FAILURE,
    };
  }
  return { requestId, snapshot, type: VoiceInputPortMessageType.SNAPSHOT };
}

export function isTerminalVoiceInputSnapshot(snapshot: VoiceInputSnapshot): boolean {
  return snapshot.phase === 'ended' || snapshot.phase === 'error';
}

export function isActiveVoiceInputSnapshot(snapshot: VoiceInputSnapshot): boolean {
  return (
    snapshot.phase === 'checking' ||
    snapshot.phase === 'starting' ||
    snapshot.phase === 'listening' ||
    snapshot.phase === 'stopping'
  );
}

export function translateVoiceInputSnapshot(
  snapshot: VoiceInputSnapshot,
  session: ActiveVoiceInputSession
): VoiceInputSnapshot {
  return {
    ...snapshot,
    sessionId: snapshot.sessionId === null ? null : session.sessionId,
  };
}

export function translateVoiceInputEvent(
  event: VoiceInputServerEvent,
  session: ActiveVoiceInputSession
): VoiceInputServerEvent {
  if (
    event.type === VoiceInputPortMessageType.TRANSCRIPT ||
    event.type === VoiceInputPortMessageType.AUDIO_LEVEL
  ) {
    return { ...event, sessionId: session.sessionId };
  }
  const snapshot = translateVoiceInputSnapshot(event.snapshot, session);
  return event.type === VoiceInputPortMessageType.FAILURE
    ? { ...event, sessionId: session.sessionId, snapshot }
    : { ...event, snapshot };
}
