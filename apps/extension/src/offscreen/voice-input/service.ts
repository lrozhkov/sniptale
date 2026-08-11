import { resolveSpeechRecognitionApi } from '@sniptale/platform/browser/speech-recognition';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  VoiceInputPortMessageType,
  type VoiceInputErrorCode,
  type VoiceInputBusyOwner,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import {
  acquireOffscreenMediaActivityLease,
  inspectOffscreenMediaActivityOwner,
} from '../media-activity/lease';
import {
  createVoiceInputRecognitionRun,
  type VoiceInputRecognitionDeps,
  type VoiceInputRecognitionRun,
} from './recognition-run';

const logger = createLogger({ namespace: 'OffscreenSpeechRecognition' });

function inspectVoiceInputBusyOwner(): VoiceInputBusyOwner | null {
  const owner = inspectOffscreenMediaActivityOwner();
  return owner === 'desktop-screenshot' ? 'video-recording' : owner;
}

function createSnapshot(
  preferences: VoiceInputPreferences,
  api = resolveSpeechRecognitionApi()
): VoiceInputSnapshot {
  return {
    apiFlavor: api.flavor,
    busyOwner: inspectVoiceInputBusyOwner(),
    effectiveMode: null,
    errorCode: null,
    fallbackReason: null,
    language: preferences.language,
    localAvailability: 'unknown',
    phase: 'idle',
    quality: VOICE_INPUT_LOCAL_QUALITY,
    qualitySupported: api.qualitySupported,
    requestedMode: preferences.mode,
    sessionId: null,
  };
}

function emitEvent(deps: VoiceInputRecognitionDeps, event: VoiceInputServerEvent): void {
  void deps.emit(event).catch(() => {
    logger.warn('Failed to deliver voice input event', {
      eventType: event.type,
      sessionId: 'sessionId' in event ? (event.sessionId ?? null) : event.snapshot.sessionId,
    });
  });
}

export function createOffscreenVoiceInputService(deps: VoiceInputRecognitionDeps) {
  let active: VoiceInputRecognitionRun | null = null;
  let snapshot = createSnapshot(
    { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' },
    deps.resolveApi()
  );

  function emitBusyFailure(args: {
    errorCode: VoiceInputErrorCode;
    preferences: VoiceInputPreferences;
    requestId: string;
    sessionId: string;
  }): VoiceInputSnapshot {
    const failedSnapshot: VoiceInputSnapshot = {
      ...createSnapshot(args.preferences, deps.resolveApi()),
      busyOwner: inspectVoiceInputBusyOwner(),
      errorCode: args.errorCode,
      phase: 'error',
      sessionId: args.sessionId,
    };
    emitEvent(deps, {
      errorCode: args.errorCode,
      requestId: args.requestId,
      sessionId: args.sessionId,
      snapshot: failedSnapshot,
      type: VoiceInputPortMessageType.FAILURE,
    });
    return failedSnapshot;
  }

  function start(args: {
    maxDurationMs: number | null;
    preferences: VoiceInputPreferences;
    requestId: string;
    sessionId: string;
  }): VoiceInputSnapshot {
    if (active) {
      return emitBusyFailure({ ...args, errorCode: 'busy-speech' });
    }
    const acquisition = acquireOffscreenMediaActivityLease('speech-recognition');
    if (!acquisition.acquired) {
      const errorCode: VoiceInputErrorCode =
        acquisition.busyOwner === 'video-recording'
          ? 'busy-video'
          : acquisition.busyOwner === 'desktop-screenshot'
            ? 'busy-video'
            : acquisition.busyOwner === 'privacy-erasure'
              ? 'privacy-erasure-in-progress'
              : 'busy-speech';
      return emitBusyFailure({ ...args, errorCode });
    }
    snapshot = {
      ...createSnapshot(args.preferences, deps.resolveApi()),
      busyOwner: 'speech-recognition',
      phase: 'starting',
      sessionId: args.sessionId,
    };
    const run = createVoiceInputRecognitionRun({
      callbacks: {
        isCurrent: (candidate) => active === candidate,
        onFinished: (candidate, nextSnapshot) => {
          if (active !== candidate) return;
          snapshot = nextSnapshot;
          active = null;
        },
        onSnapshot: (nextSnapshot) => {
          if (active === run) snapshot = nextSnapshot;
        },
      },
      deps,
      initialSnapshot: snapshot,
      lease: acquisition.lease,
      maxDurationMs: args.maxDurationMs,
      preferences: args.preferences,
      requestId: args.requestId,
      sessionId: args.sessionId,
    });
    active = run;
    run.start();
    return snapshot;
  }

  function stop(sessionId: string, force: boolean): 'accepted' | 'stale' {
    if (!active || active.sessionId !== sessionId) return 'stale';
    if (force) {
      const preferences = active.preferences;
      active.abort();
      active = null;
      snapshot = createSnapshot(preferences, deps.resolveApi());
      return 'accepted';
    }
    return active.stop();
  }

  function abortOnUnload(): void {
    active?.abort();
    active = null;
  }

  return {
    abortOnUnload,
    getSnapshot: () => snapshot,
    start,
    stop,
  };
}
