import { stopRecorderStreams } from './recorders';
import {
  setActiveMultiSourceSession,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';

type StoppableSessionRecorder =
  | MultiSourceRecorder
  | NonNullable<MultiSourceSession['webcamRecorder']>;

function stopSessionStreams(session: MultiSourceSession): void {
  const allRecorders = [...session.recorders, session.audioRecorder].filter(
    (recorder): recorder is MultiSourceRecorder => recorder !== null
  );
  stopRecorderStreams(allRecorders);
  session.webcamRecorder?.stream.getTracks().forEach((track) => track.stop());
  if (session.durationTimer) {
    clearInterval(session.durationTimer);
  }
}

function getSessionRecorders(session: MultiSourceSession) {
  return [...session.recorders, session.audioRecorder, session.webcamRecorder].filter(
    (source): source is StoppableSessionRecorder => source !== null
  );
}

function stopSessionRecorders(session: MultiSourceSession): void {
  getSessionRecorders(session).forEach((source) => {
    source.recorder.onstop = null;
    source.recorder.onerror = null;
    if (source.recorder.state !== 'inactive') {
      try {
        source.recorder.stop();
      } catch {
        // Stream cleanup below is the terminal owner; recorder stop can throw after a runtime error.
      }
    }
  });
}

function finalizeStoppedSession(params: {
  discard: boolean;
  finalizeSession: (session: MultiSourceSession) => Promise<void>;
  reject: (reason?: unknown) => void;
  resolve: () => void;
  session: MultiSourceSession;
}) {
  setActiveMultiSourceSession(null);
  stopSessionStreams(params.session);
  if (params.discard) {
    params.resolve();
    return;
  }

  params.finalizeSession(params.session).then(params.resolve, params.reject);
}

export function failMultiSourceSession(session: MultiSourceSession, error: Error): void {
  setActiveMultiSourceSession(null);
  stopSessionRecorders(session);
  stopSessionStreams(session);
  session.stopReject?.(error);
}

export function stopMultiSourceSession(params: {
  discard: boolean;
  finalizeSession: (session: MultiSourceSession) => Promise<void>;
  session: MultiSourceSession;
}): Promise<void> {
  const { discard, finalizeSession, session } = params;
  if (session.stopPromise) {
    return session.stopPromise;
  }

  session.stopPromise = new Promise((resolve, reject) => {
    let didFinalize = false;
    const sessionRecorders = getSessionRecorders(session);
    let pendingStops = sessionRecorders.length;
    const finishOne = () => {
      if (didFinalize) {
        return;
      }

      pendingStops -= 1;
      if (pendingStops > 0) {
        return;
      }

      didFinalize = true;
      finalizeStoppedSession({ discard, finalizeSession, reject, resolve, session });
    };

    session.stopResolve = resolve;
    session.stopReject = reject;
    sessionRecorders.forEach((source) => {
      if (source.recorder.state === 'inactive') {
        finishOne();
        return;
      }
      source.recorder.onstop = () => {
        source.recorder.onstop = null;
        finishOne();
      };
      source.recorder.requestData?.();
      source.recorder.stop();
    });
  });
  return session.stopPromise;
}
