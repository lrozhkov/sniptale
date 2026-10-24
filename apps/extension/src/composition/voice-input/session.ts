import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import {
  VoiceInputPortMessageType,
  type VoiceInputErrorCode,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { loadSettings, subscribeToVoiceInputPreferencesChanges } from '../persistence/settings';
import { createVoiceInputClient, type VoiceInputClient } from '../../workflows/voice-input';

type VoiceInputPhase =
  | 'error'
  | 'idle'
  | 'listening'
  | 'starting'
  | 'stopping'
  | 'processing-asr'
  | 'processing-text';

export interface VoiceInputState {
  active: boolean;
  pending: boolean;
  audioLevel: number;
  errorCode: VoiceInputErrorCode | 'runtime' | null;
  phase: VoiceInputPhase;
}

interface SessionState {
  audioLevel: number;
  errorCode: VoiceInputState['errorCode'];
  phase: VoiceInputPhase;
}

type SessionAction =
  | { type: 'error'; value: Exclude<VoiceInputState['errorCode'], null> }
  | { type: 'level'; value: number }
  | { type: 'phase'; value: VoiceInputPhase };

const initialState: SessionState = { audioLevel: 0, errorCode: null, phase: 'idle' };

function reduceState(state: SessionState, action: SessionAction): SessionState {
  if (action.type === 'level') return { ...state, audioLevel: action.value };
  if (action.type === 'error') {
    return { ...state, audioLevel: 0, errorCode: action.value, phase: 'error' };
  }
  return {
    ...state,
    ...(action.value === 'idle' ? { audioLevel: 0 } : {}),
    errorCode: action.value === 'starting' ? null : state.errorCode,
    phase: action.value,
  };
}

function resolveSnapshotPhase(event: VoiceInputServerEvent): VoiceInputPhase | null {
  if (event.type !== VoiceInputPortMessageType.SNAPSHOT) return null;
  if (event.snapshot.phase === 'checking' || event.snapshot.phase === 'starting') return 'starting';
  if (event.snapshot.phase === 'listening') return 'listening';
  if (event.snapshot.phase === 'stopping') return 'stopping';
  if (event.snapshot.phase === 'processing-asr' || event.snapshot.phase === 'processing-text')
    return event.snapshot.phase;
  if (event.snapshot.phase === 'ended' || event.snapshot.phase === 'idle') return 'idle';
  return event.snapshot.phase === 'error' ? 'error' : null;
}

function isEventForSession(event: VoiceInputServerEvent, sessionId: string): boolean {
  if (
    event.type === VoiceInputPortMessageType.TRANSCRIPT ||
    event.type === VoiceInputPortMessageType.AUDIO_LEVEL
  ) {
    return event.sessionId === sessionId;
  }
  const eventSessionId =
    event.type === VoiceInputPortMessageType.FAILURE
      ? (event.sessionId ?? event.snapshot.sessionId)
      : event.snapshot.sessionId;
  return eventSessionId === sessionId;
}

function useClientLifecycle(args: {
  acceptingTranscriptRef: RefObject<boolean>;
  applyServerEvent(event: VoiceInputServerEvent): void;
  cancel(): void;
  client: VoiceInputClient;
  generationRef: RefObject<number>;
  readActiveSessionId(): string | null;
  startPendingRef: RefObject<boolean>;
}): void {
  const {
    acceptingTranscriptRef,
    applyServerEvent,
    cancel,
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  } = args;
  useEffect(() => {
    const unsubscribe = client.subscribe(applyServerEvent);
    const unsubscribePreferences = subscribeToVoiceInputPreferencesChanges((preferences) => {
      if (preferences.enabled === false) cancel();
    });
    return () => {
      unsubscribePreferences();
      const sessionId = readActiveSessionId();
      generationRef.current += 1;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      if (sessionId) {
        try {
          client.cancel(sessionId);
        } catch {
          // Disconnect remains the authoritative cleanup fallback.
        }
      }
      unsubscribe();
      client.disconnect();
    };
  }, [
    acceptingTranscriptRef,
    applyServerEvent,
    cancel,
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  ]);
}

/** Owns one content-runtime voice session while consumers own transcript placement. */
export function useVoiceInputSession(args: {
  createClient?: (() => VoiceInputClient) | undefined;
  onTranscript(event: Extract<VoiceInputServerEvent, { type: 'VOICE_INPUT_TRANSCRIPT' }>): void;
}) {
  const [client] = useState(() => (args.createClient ?? createVoiceInputClient)());
  const [state, dispatch] = useReducer(reduceState, initialState);
  const activeSessionIdRef = useRef<string | null>(null);
  const acceptingTranscriptRef = useRef(false);
  const generationRef = useRef(0);
  const startPendingRef = useRef(false);
  const stoppingRef = useRef(false);
  const lastSequenceRef = useRef(-1);
  const deliveryRef = useRef<'live' | 'final'>('live');
  const onTranscriptRef = useRef(args.onTranscript);
  onTranscriptRef.current = args.onTranscript;
  const readActiveSessionId = useCallback(() => activeSessionIdRef.current, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    startPendingRef.current = false;
    stoppingRef.current = true;
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      dispatch({ type: 'phase', value: 'idle' });
      return;
    }
    try {
      client.stop(sessionId);
      dispatch({ type: 'phase', value: 'stopping' });
    } catch {
      activeSessionIdRef.current = null;
      dispatch({ type: 'error', value: 'runtime' });
    }
  }, [client]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    acceptingTranscriptRef.current = false;
    stoppingRef.current = false;
    startPendingRef.current = false;
    const sessionId = activeSessionIdRef.current;
    activeSessionIdRef.current = null;
    dispatch({ type: 'phase', value: 'idle' });
    if (sessionId) {
      try {
        client.cancel(sessionId);
      } catch {
        dispatch({ type: 'error', value: 'runtime' });
      }
    }
  }, [client]);

  const applyServerEvent = useCallback((event: VoiceInputServerEvent) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || !isEventForSession(event, sessionId)) return;
    if (event.type === VoiceInputPortMessageType.AUDIO_LEVEL) {
      if (acceptingTranscriptRef.current && !stoppingRef.current)
        dispatch({ type: 'level', value: event.level });
      return;
    }
    if (event.type === VoiceInputPortMessageType.TRANSCRIPT) {
      if (!acceptingTranscriptRef.current || event.sequence <= lastSequenceRef.current) return;
      lastSequenceRef.current = event.sequence;
      onTranscriptRef.current(event);
      if (event.isFinal && deliveryRef.current === 'final') acceptingTranscriptRef.current = false;
      return;
    }
    if (event.type === VoiceInputPortMessageType.FAILURE) {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      dispatch({ type: 'error', value: event.errorCode });
      return;
    }
    deliveryRef.current = event.snapshot.delivery ?? 'live';
    const nextPhase = resolveSnapshotPhase(event);
    if (stoppingRef.current && (nextPhase === 'starting' || nextPhase === 'listening')) {
      return;
    }
    if (nextPhase === 'idle') {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      stoppingRef.current = false;
    } else if (nextPhase === 'error') {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      dispatch({ type: 'error', value: event.snapshot.errorCode ?? 'runtime' });
      return;
    }
    if (nextPhase) dispatch({ type: 'phase', value: nextPhase });
  }, []);

  useClientLifecycle({
    acceptingTranscriptRef,
    applyServerEvent,
    cancel,
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  });

  const start = useCallback(async () => {
    if (activeSessionIdRef.current || startPendingRef.current) return;
    startPendingRef.current = true;
    const generation = ++generationRef.current;
    dispatch({ type: 'phase', value: 'starting' });
    try {
      const settings = await loadSettings();
      if (generation !== generationRef.current) return;
      if (settings.voiceInput?.enabled === false) {
        startPendingRef.current = false;
        dispatch({ type: 'phase', value: 'idle' });
        return;
      }
      const sessionId = client.start(
        settings.voiceInput ?? {
          language: 'ru-RU',
          microphoneDeviceId: null,
          mode: 'local-first',
        }
      );
      activeSessionIdRef.current = sessionId;
      acceptingTranscriptRef.current = true;
      stoppingRef.current = false;
      lastSequenceRef.current = -1;
      deliveryRef.current = 'live';
      startPendingRef.current = false;
    } catch {
      if (generation !== generationRef.current) return;
      startPendingRef.current = false;
      dispatch({ type: 'error', value: 'runtime' });
    }
  }, [client]);

  return {
    actions: { start, stop, cancel },
    state: {
      ...state,
      active: state.phase === 'starting' || state.phase === 'listening',
      pending:
        state.phase === 'stopping' ||
        state.phase === 'processing-asr' ||
        state.phase === 'processing-text',
    } satisfies VoiceInputState,
  };
}
