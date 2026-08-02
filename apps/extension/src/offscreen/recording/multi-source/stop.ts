import { stopRecorderStreams } from './recorders';
import {
  getActiveMultiSourceSession,
  setActiveMultiSourceSession,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';

type SessionRecorder = MultiSourceRecorder | NonNullable<MultiSourceSession['webcamRecorder']>;

function getSessionRecorders(session: MultiSourceSession): SessionRecorder[] {
  return [...session.recorders, session.audioRecorder, session.webcamRecorder].filter(
    (source): source is SessionRecorder => source !== null
  );
}

function stopSessionStreams(session: MultiSourceSession): void {
  stopRecorderStreams([...session.recorders, session.audioRecorder]);
  session.webcamRecorder?.stream.getTracks().forEach((track) => track.stop());
  if (session.durationTimer) clearInterval(session.durationTimer);
}

async function abortSession(session: MultiSourceSession): Promise<void> {
  await session.staging.abort();
}

export function failMultiSourceSession(session: MultiSourceSession, error: Error): boolean {
  if (getActiveMultiSourceSession() !== session) return false;
  const transitioned = session.lifecycle.fail(error);
  if (!transitioned && !session.stopReject) return false;
  setActiveMultiSourceSession(null);
  getSessionRecorders(session).forEach((source) => {
    void source.artifactSession.abort().catch(() => undefined);
  });
  stopSessionStreams(session);
  session.stopReject?.(error);
  return true;
}

async function stopAndFinalizeSession(params: {
  discard: boolean;
  finalizeSession: (session: MultiSourceSession) => Promise<void>;
  session: MultiSourceSession;
}): Promise<void> {
  const { discard, finalizeSession, session } = params;
  try {
    await Promise.all(
      getSessionRecorders(session).map(async (source) => {
        source.artifact = await source.artifactSession.stop();
      })
    );
    setActiveMultiSourceSession(null);
    stopSessionStreams(session);
    if (discard) {
      await abortSession(session);
      return;
    }
    await finalizeSession(session);
  } catch (error) {
    setActiveMultiSourceSession(null);
    stopSessionStreams(session);
    try {
      await abortSession(session);
    } catch (abortError) {
      throw new AggregateError(
        [error, abortError],
        'Multi-source stop failed and recording staging abort also failed.',
        { cause: abortError }
      );
    }
    throw error;
  }
}

export function stopMultiSourceSession(params: {
  discard: boolean;
  finalizeSession: (session: MultiSourceSession) => Promise<void>;
  session: MultiSourceSession;
}): Promise<void> {
  const { session } = params;
  if (session.stopPromise) return session.stopPromise;

  const previousPhase = session.lifecycle.beginStop();
  if (previousPhase === null) return Promise.resolve();
  if (previousPhase === 'starting') {
    setActiveMultiSourceSession(null);
    getSessionRecorders(session).forEach((source) => {
      void source.artifactSession.abort().catch(() => undefined);
    });
    stopSessionStreams(session);
    session.stopPromise = abortSession(session);
    return session.stopPromise;
  }

  session.stopPromise = stopAndFinalizeSession(params);
  return session.stopPromise;
}
