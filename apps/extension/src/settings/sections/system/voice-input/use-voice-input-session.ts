import { useCallback, useRef, useState } from 'react';
import { resolveSpeechRecognitionApi } from '@sniptale/platform/browser/speech-recognition';
import {
  VOICE_INPUT_LOCAL_QUALITY,
  VOICE_INPUT_LEVEL_PEAK_COUNT,
  VOICE_INPUT_TRANSCRIPT_MAX_CHARS,
  VoiceInputPortMessageType,
  type VoiceInputLanguage,
  type VoiceInputMode,
  type VoiceInputPreferences,
  type VoiceInputServerEvent,
  type VoiceInputSnapshot,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputClient } from '../../../../workflows/voice-input';

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
  const { audioLevel, audioPeaks, setAudioLevel, setAudioPeaks, resetMeter } = useVoiceInputMeter();
  const activeSessionIdRef = useRef<string | null>(null);
  const lastSequenceRef = useRef(-1);
  const deliveryRef = useRef<'live' | 'final'>('live');
  const finalAcceptedRef = useRef(false);
  const cancelledSessionRef = useRef<string | null>(null);

  const applyServerEvent = useCallback(
    (event: VoiceInputServerEvent) => {
      if (event.type === VoiceInputPortMessageType.AUDIO_LEVEL) {
        if (event.sessionId !== activeSessionIdRef.current) return;
        setAudioLevel(event.level);
        setAudioPeaks(event.peaks);
        return;
      }
      if (event.type === VoiceInputPortMessageType.SNAPSHOT) {
        if (
          event.snapshot.sessionId !== null &&
          (event.snapshot.sessionId === cancelledSessionRef.current ||
            (activeSessionIdRef.current !== null &&
              event.snapshot.sessionId !== activeSessionIdRef.current))
        ) {
          return;
        }
        deliveryRef.current = event.snapshot.delivery ?? 'live';
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
          resetMeter();
          setInterimText('');
        }
        return;
      }
      if (event.type === VoiceInputPortMessageType.FAILURE) {
        const failedSessionId = event.sessionId ?? event.snapshot.sessionId;
        if (failedSessionId !== null && failedSessionId !== activeSessionIdRef.current) {
          return;
        }
        setSnapshot(event.snapshot);
        activeSessionIdRef.current = null;
        resetMeter();
        setInterimText('');
        onRuntimeFailure();
        return;
      }
      if (
        event.sessionId !== activeSessionIdRef.current ||
        finalAcceptedRef.current ||
        event.sequence <= lastSequenceRef.current
      ) {
        return;
      }
      lastSequenceRef.current = event.sequence;
      if (event.isFinal) {
        if (deliveryRef.current === 'final') finalAcceptedRef.current = true;
        setFinalText((current) =>
          `${current}${event.text}`.slice(0, VOICE_INPUT_TRANSCRIPT_MAX_CHARS)
        );
        setInterimText('');
      } else {
        setInterimText(event.text);
      }
    },
    [onRuntimeFailure, resetMeter, setAudioLevel, setAudioPeaks]
  );

  const begin = useCallback(
    (client: VoiceInputClient, preferences: VoiceInputPreferences): string => {
      setFinalText('');
      setInterimText('');
      resetMeter();
      lastSequenceRef.current = -1;
      deliveryRef.current = 'live';
      finalAcceptedRef.current = false;
      cancelledSessionRef.current = null;
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
    [resetMeter]
  );

  const stop = useCallback((client: VoiceInputClient) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) return;
    client.stop(sessionId);
    setSnapshot((current) => ({ ...current, phase: 'stopping' }));
  }, []);

  const cancel = useCallback(
    (client: VoiceInputClient) => {
      const sessionId = activeSessionIdRef.current;
      cancelledSessionRef.current = sessionId;
      activeSessionIdRef.current = null;
      finalAcceptedRef.current = true;
      setInterimText('');
      resetMeter();
      setSnapshot((current) => ({ ...current, sessionId: null, phase: 'idle' }));
      if (sessionId) client.cancel(sessionId);
    },
    [resetMeter]
  );
  return {
    connection: { activeSessionIdRef, applyServerEvent, begin, stop, cancel },
    snapshotState: { audioLevel, audioPeaks, setSnapshot, snapshot },
    transcript: {
      finalText,
      interimText,
      setFinalText,
    },
  };
}

function useVoiceInputMeter() {
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioPeaks, setAudioPeaks] = useState(() =>
    Array.from({ length: VOICE_INPUT_LEVEL_PEAK_COUNT }, () => 0)
  );
  const resetMeter = useCallback(() => {
    setAudioLevel(0);
    setAudioPeaks(Array.from({ length: VOICE_INPUT_LEVEL_PEAK_COUNT }, () => 0));
  }, []);

  return { audioLevel, audioPeaks, setAudioLevel, setAudioPeaks, resetMeter };
}
