import {
  VoiceInputPortMessageType,
  type VoiceInputCaptureEvent,
} from '@sniptale/runtime-contracts/voice-input';
import type { VoiceInputHistory } from '../../composition/persistence/voice-input-history';
import {
  createVoiceInputFailureEvent,
  postVoiceInputPortEvent,
  type ActiveVoiceInputSession,
} from './protocol';
import type { VoiceInputSessionAuthority } from './session-authority';
import {
  VoiceProcessingError,
  voiceProcessingErrorCode,
  type VoiceInputProcessingOperations,
} from './processing-operation';

/** Validates a completed private capture before it can start processing or deliver text. */
export function createVoiceInputCaptureCompletion(deps: {
  sessions: VoiceInputSessionAuthority;
  history: VoiceInputHistory;
  processing: VoiceInputProcessingOperations;
}) {
  async function handle(event: VoiceInputCaptureEvent): Promise<void> {
    const session = deps.sessions.active;
    if (!session || event.sessionId !== session.offscreenSessionId || session.cancelled) return;
    if (event.type === 'VOICE_INPUT_CAPTURE_RELEASED') {
      session.captureReleased = true;
      session.stopCleanupPending = false;
      return;
    }
    if (
      session.preferences.backend !== 'model' ||
      !session.captureReleased ||
      session.processing ||
      !session.captureToken
    )
      return;
    session.processing = true;
    try {
      const entry = await deps.history.get(event.scope);
      const token = session.captureToken;
      if (
        entry.entryId !== token.entryId ||
        entry.incarnation !== token.incarnation ||
        entry.epoch !== token.epoch ||
        entry.sequence !== token.sequence ||
        entry.createdAt !== token.createdAt ||
        entry.backend !== (session.preferences.backend ?? 'browser') ||
        entry.language !== session.preferences.language ||
        (entry.backend === 'model' ? event.rawTranscript !== null : event.rawTranscript === null) ||
        Math.abs(entry.durationSeconds - event.durationSeconds) >
          1 / 16_000 + Number.EPSILON * entry.durationSeconds
      )
        throw new VoiceProcessingError('stale', event.scope);
      if (!deps.sessions.owns(session) || session.cancelled) return;
      const result = await deps.processing.run({
        owner: session,
        scope: event.scope,
        preferences: session.preferences,
        ...(event.rawTranscript === null ? {} : { browserTranscript: event.rawTranscript }),
        onPhase: (phase) => {
          if (!deps.sessions.owns(session) || session.cancelled) return;
          deps.sessions.replaceSnapshot({ ...deps.sessions.snapshot, phase, busyOwner: null });
          postVoiceInputPortEvent(session, {
            type: VoiceInputPortMessageType.SNAPSHOT,
            snapshot: deps.sessions.snapshot,
          });
        },
      });
      if (!deps.sessions.owns(session) || session.cancelled) return;
      completeProcessing(session, result.transcript ?? result.rawTranscript ?? '');
    } catch (error) {
      if (!deps.sessions.owns(session) || session.cancelled) return;
      if (error instanceof VoiceProcessingError && error.rawTranscript !== undefined) {
        completeProcessing(session, error.rawTranscript);
        return;
      }
      const failure = createVoiceInputFailureEvent({
        errorCode: voiceProcessingErrorCode(error),
        preferences: session.preferences,
        sessionId: session.sessionId,
      });
      if ('snapshot' in failure) deps.sessions.replaceSnapshot(failure.snapshot);
      postVoiceInputPortEvent(session, failure);
      deps.sessions.clearIf(session);
    }
  }

  function completeProcessing(session: ActiveVoiceInputSession, text: string): void {
    if (session.preferences.backend === 'model') {
      postVoiceInputPortEvent(session, {
        type: VoiceInputPortMessageType.TRANSCRIPT,
        sessionId: session.sessionId,
        sequence: 1,
        confidence: null,
        isFinal: true,
        text,
      });
    }
    const snapshot = {
      ...deps.sessions.snapshot,
      phase: 'ended' as const,
      busyOwner: null,
      errorCode: null,
    };
    deps.sessions.replaceSnapshot(snapshot);
    postVoiceInputPortEvent(session, { type: VoiceInputPortMessageType.SNAPSHOT, snapshot });
    deps.sessions.clearIf(session);
  }

  return { handle };
}
