import { stopRecorderStreams } from './recorders';
import { notifyMultiSourceStopped } from './messages';
import {
  getActiveMultiSourceSession,
  setActiveMultiSourceSession,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';
import { releaseVideoRecordingMediaActivityLease } from '../../media-activity/video-recording-lease';

type SessionRecorder = MultiSourceRecorder | NonNullable<MultiSourceSession['webcamRecorder']>;

function getSessionRecorders(session: MultiSourceSession): SessionRecorder[] {
  return [...session.recorders, session.audioRecorder, session.webcamRecorder].filter(
    (source): source is SessionRecorder => source !== null
  );
}

function stopSessionStreams(session: MultiSourceSession): void {
  stopRecorderStreams([...session.recorders, session.audioRecorder]);
  session.webcamRecorder?.release();
  if (session.durationTimer) clearInterval(session.durationTimer);
}

function retireMultiSourceSession(session: MultiSourceSession): void {
  session.audioRecorder?.microphoneActivity?.dispose();
  setActiveMultiSourceSession(null);
  stopSessionStreams(session);
  releaseVideoRecordingMediaActivityLease();
}

async function abortSession(session: MultiSourceSession, discard = false): Promise<void> {
  await (discard
    ? (session.staging.discard?.() ?? session.staging.abort())
    : session.staging.abort());
}

export function failMultiSourceSession(session: MultiSourceSession, error: Error): boolean {
  if (getActiveMultiSourceSession() !== session) return false;
  const transitioned = session.lifecycle.fail(error);
  if (!transitioned && !session.stopReject) return false;
  getSessionRecorders(session).forEach((source) => {
    void source.artifactSession.abort().catch(() => undefined);
  });
  retireMultiSourceSession(session);
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
    retireMultiSourceSession(session);
    if (discard) {
      await abortSession(session, discard);
      await notifyMultiSourceStopped(session.recordingId);
      return;
    }
    await finalizeSession(session);
  } catch (error) {
    retireMultiSourceSession(session);
    try {
      await abortSession(session, discard);
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
  session.audioRecorder?.microphoneActivity?.dispose();
  if (previousPhase === null) return Promise.resolve();
  if (previousPhase === 'starting') {
    session.stopPromise = cancelStartingSession(session, params.discard);
    return session.stopPromise;
  }

  session.stopPromise = stopAndFinalizeSession(params);
  return session.stopPromise;
}

async function cancelStartingSession(session: MultiSourceSession, discard: boolean): Promise<void> {
  const aborts = getSessionRecorders(session).map(async (source) => source.artifactSession.abort());
  retireMultiSourceSession(session);
  const results = await Promise.allSettled([...aborts, abortSession(session, discard)]);
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Failed to cancel multi-source recording cleanup.');
  }
  await notifyMultiSourceStopped(session.recordingId);
}
