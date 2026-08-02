import { useCallback, useRef, useState } from 'react';
import { resolveSpeechRecognitionApi } from '@sniptale/platform/browser/speech-recognition';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  VoiceInputPortMessageType,
  type VoiceInputLanguage,
  type VoiceInputMode,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient } from '../../../workflows/voice-input';

function createInitialSnapshot(
  language: VoiceInputLanguage,
  mode: VoiceInputMode
): VoiceInputSnapshot {
  const api = resolveSpeechRecognitionApi();
  return {
    apiFlavor: api.flavor,
    busyOwner: null,
    effectiveMode: null,
    errorCode: null,
    fallbackReason: null,
    language,
    localAvailability: 'unknown',
    phase: 'idle',
    quality: VOICE_INPUT_LOCAL_QUALITY,
    qualitySupported: api.qualitySupported,
    requestedMode: mode,
    sessionId: null,
  };
}

export function useVoiceInputSessionState(args: {
  initialLanguage: VoiceInputLanguage;
  initialMode: VoiceInputMode;
  onRuntimeFailure(): void;
}) {
  const { onRuntimeFailure } = args;
  const [snapshot, setSnapshot] = useState(() =>
    createInitialSnapshot(args.initialLanguage, args.initialMode)
  );
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const activeSessionIdRef = useRef<string | null>(null);
  const lastSequenceRef = useRef(-1);

  const applyServerEvent = useCallback(
    (event: VoiceInputServerEvent) => {
      if (event.type === VoiceInputPortMessageType.AUDIO_LEVEL) {
        if (event.sessionId !== activeSessionIdRef.current) return;
        setAudioLevels((current) => [...current.slice(-47), event.level]);
        return;
      }
      if (event.type === VoiceInputPortMessageType.SNAPSHOT) {
        if (
          activeSessionIdRef.current !== null &&
          event.snapshot.sessionId !== null &&
          event.snapshot.sessionId !== activeSessionIdRef.current
        ) {
          return;
        }
        setSnapshot((current) =>
          event.snapshot.localAvailability === 'unknown' && event.snapshot.effectiveMode === null
            ? {
                ...event.snapshot,
                apiFlavor: current.apiFlavor,
                localAvailability: current.localAvailability,
                qualitySupported: current.qualitySupported,
                ...(event.snapshot.sessionId === null
                  ? { language: current.language, requestedMode: current.requestedMode }
                  : {}),
              }
            : event.snapshot
        );
        if (
          (event.snapshot.phase === 'idle' && event.snapshot.sessionId === null) ||
          event.snapshot.phase === 'ended' ||
          event.snapshot.phase === 'error'
        ) {
          activeSessionIdRef.current = null;
          setInterimText('');
        }
        return;
      }
      if (event.type === VoiceInputPortMessageType.FAILURE) {
        const failedSessionId = event.sessionId ?? event.snapshot.sessionId;
        if (
          activeSessionIdRef.current !== null &&
          failedSessionId !== null &&
          failedSessionId !== activeSessionIdRef.current
        ) {
          return;
        }
        setSnapshot(event.snapshot);
        activeSessionIdRef.current = null;
        setInterimText('');
        onRuntimeFailure();
        return;
      }
      if (
        event.sessionId !== activeSessionIdRef.current ||
        event.sequence <= lastSequenceRef.current
      ) {
        return;
      }
      lastSequenceRef.current = event.sequence;
      if (event.isFinal) {
        setFinalText((current) =>
          `${current}${event.text}`.slice(0, VOICE_INPUT_TRANSCRIPT_MAX_CHARS)
        );
        setInterimText('');
      } else {
        setInterimText(event.text);
      }
    },
    [onRuntimeFailure]
  );

  const begin = useCallback(
    (client: VoiceInputClient, preferences: VoiceInputPreferences): string => {
      setFinalText('');
      setInterimText('');
      setAudioLevels([]);
      lastSequenceRef.current = -1;
      const sessionId = client.start(preferences);
      activeSessionIdRef.current = sessionId;
      setSnapshot((current) => ({
        ...current,
        errorCode: null,
        language: preferences.language,
        phase: 'starting',
        requestedMode: preferences.mode,
        sessionId,
      }));
      return sessionId;
    },
    []
  );

  const stop = useCallback((client: VoiceInputClient) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    client.stop(sessionId);
    setSnapshot((current) => ({ ...current, phase: 'stopping' }));
  }, []);

  return {
    connection: { activeSessionIdRef, applyServerEvent, begin, stop },
    snapshotState: { audioLevels, setSnapshot, snapshot },
    transcript: {
      clear: () => {
        setFinalText('');
        setInterimText('');
      },
      finalText,
      interimText,
      setFinalText,
    },
  };
}
