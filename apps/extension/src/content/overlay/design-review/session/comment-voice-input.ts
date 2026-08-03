import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import {
  VoiceInputPortMessageType,
  type VoiceInputErrorCode,
  type VoiceInputServerEvent,
} from '@sniptale/runtime-contracts/voice-input';
import { loadSettings } from '../../../../composition/persistence/settings';
import { createVoiceInputClient, type VoiceInputClient } from '../../../../workflows/voice-input';
import {
  createCommentTranscriptInsertion,
  type CommentTranscriptInsertion,
} from './comment-transcript';

type CommentVoiceInputPhase = 'error' | 'idle' | 'listening' | 'starting' | 'stopping';

interface CommentVoiceInputState {
  audioLevel: number;
  caretPosition: number | null;
  errorCode: VoiceInputErrorCode | 'runtime' | null;
  phase: CommentVoiceInputPhase;
}

type CommentVoiceInputAction =
  | { type: 'caret'; value: number }
  | { type: 'error'; value: VoiceInputErrorCode | 'runtime' }
  | { type: 'level'; value: number }
  | { type: 'phase'; value: CommentVoiceInputPhase };

const initialState: CommentVoiceInputState = {
  audioLevel: 0,
  caretPosition: null,
  errorCode: null,
  phase: 'idle',
};

function reduceCommentVoiceInputState(
  state: CommentVoiceInputState,
  action: CommentVoiceInputAction
): CommentVoiceInputState {
  if (action.type === 'caret') return { ...state, caretPosition: action.value };
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

function resolveSnapshotPhase(event: VoiceInputServerEvent): CommentVoiceInputPhase | null {
  if (event.type !== VoiceInputPortMessageType.SNAPSHOT) return null;
  if (event.snapshot.phase === 'checking' || event.snapshot.phase === 'starting') return 'starting';
  if (event.snapshot.phase === 'listening') return 'listening';
  if (event.snapshot.phase === 'stopping') return 'stopping';
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

function useVoiceInputClientLifecycle(args: {
  acceptingTranscriptRef: RefObject<boolean>;
  applyServerEvent(event: VoiceInputServerEvent): void;
  client: VoiceInputClient;
  generationRef: RefObject<number>;
  readActiveSessionId(): string | null;
  startPendingRef: RefObject<boolean>;
}): void {
  const {
    acceptingTranscriptRef,
    applyServerEvent,
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  } = args;
  useEffect(() => {
    const unsubscribe = client.subscribe(applyServerEvent);
    return () => {
      const sessionId = readActiveSessionId();
      generationRef.current += 1;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      if (sessionId) {
        try {
          client.stop(sessionId);
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
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  ]);
}

export function useDesignReviewCommentVoiceInput(args: {
  updateDraft(value: string): void;
  createClient?: () => VoiceInputClient;
}) {
  const [client] = useState(() => (args.createClient ?? createVoiceInputClient)());
  const [state, dispatch] = useReducer(reduceCommentVoiceInputState, initialState);
  const activeSessionIdRef = useRef<string | null>(null);
  const acceptingTranscriptRef = useRef(false);
  const generationRef = useRef(0);
  const insertionRef = useRef<CommentTranscriptInsertion | null>(null);
  const startPendingRef = useRef(false);
  const updateDraftRef = useRef(args.updateDraft);
  updateDraftRef.current = args.updateDraft;
  const readActiveSessionId = useCallback(() => activeSessionIdRef.current, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    acceptingTranscriptRef.current = false;
    startPendingRef.current = false;
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

  const applyServerEvent = useCallback((event: VoiceInputServerEvent) => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || !isEventForSession(event, sessionId)) return;
    if (event.type === VoiceInputPortMessageType.AUDIO_LEVEL) {
      if (acceptingTranscriptRef.current) dispatch({ type: 'level', value: event.level });
      return;
    }
    if (event.type === VoiceInputPortMessageType.TRANSCRIPT) {
      if (!acceptingTranscriptRef.current) return;
      const update = insertionRef.current?.apply(event);
      if (!update) return;
      dispatch({ type: 'caret', value: update.caretPosition });
      updateDraftRef.current(update.value);
      return;
    }
    if (event.type === VoiceInputPortMessageType.FAILURE) {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      dispatch({ type: 'error', value: event.errorCode });
      return;
    }
    const nextPhase = resolveSnapshotPhase(event);
    if (
      !acceptingTranscriptRef.current &&
      (nextPhase === 'starting' || nextPhase === 'listening')
    ) {
      return;
    }
    if (nextPhase === 'idle') {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
    } else if (nextPhase === 'error') {
      activeSessionIdRef.current = null;
      acceptingTranscriptRef.current = false;
      startPendingRef.current = false;
      dispatch({ type: 'error', value: event.snapshot.errorCode ?? 'runtime' });
      return;
    }
    if (nextPhase) dispatch({ type: 'phase', value: nextPhase });
  }, []);

  useVoiceInputClientLifecycle({
    acceptingTranscriptRef,
    applyServerEvent,
    client,
    generationRef,
    readActiveSessionId,
    startPendingRef,
  });

  const start = useCallback(
    async (draft: string, caret: number) => {
      if (activeSessionIdRef.current || startPendingRef.current) return;
      startPendingRef.current = true;
      const generation = ++generationRef.current;
      insertionRef.current = createCommentTranscriptInsertion(draft, caret);
      dispatch({ type: 'caret', value: caret });
      dispatch({ type: 'phase', value: 'starting' });
      try {
        const settings = await loadSettings();
        if (generation !== generationRef.current) return;
        const sessionId = client.start(
          settings.voiceInput ?? {
            language: 'ru-RU',
            microphoneDeviceId: null,
            mode: 'local-first',
          }
        );
        activeSessionIdRef.current = sessionId;
        acceptingTranscriptRef.current = true;
        startPendingRef.current = false;
      } catch {
        if (generation !== generationRef.current) return;
        insertionRef.current = null;
        startPendingRef.current = false;
        dispatch({ type: 'error', value: 'runtime' });
      }
    },
    [client]
  );

  return {
    actions: { start, stop },
    state: {
      ...state,
      active: state.phase === 'starting' || state.phase === 'listening',
    },
  };
}
