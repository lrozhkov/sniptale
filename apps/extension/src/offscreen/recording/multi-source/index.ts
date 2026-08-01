import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import { pauseSessionRecorders, resumeSessionRecorders, setSessionMediaEnabled } from './controls';
import { consumeDesktopStreams, disposeMultiSourceDesktopMedia } from '../setup/desktop-media';
import { RECORDER_TIMESLICE_MS, initializeDurationPublishing } from './duration';
import { finalizeSession } from './finalize';
import { notifyMultiSourceRuntimeFailure, notifyMultiSourceStarted } from './messages';
import { createMicrophoneRecorder, createSourceRecorders, stopRecorderStreams } from './recorders';
import {
  createMultiSourceLifecycle,
  getActiveMultiSourceSession,
  setActiveMultiSourceSession,
  type MultiSourceRecorder,
  type MultiSourceSession,
} from './state';
import { failMultiSourceSession, stopMultiSourceSession } from './stop';
import { createMultiSourceWebcamRecorder, stopWebcamRecorderStream } from './webcam';
import { getMediaRecorderError } from '../recorder-error';

let startSequence = 0;

type PreparedMultiSourceRecorders = {
  audioRecorder: MultiSourceRecorder | null;
  recorders: MultiSourceRecorder[];
  webcamRecorder: RecordingSidecarRecorder | null;
};

export function hasActiveMultiSourceRecording(): boolean {
  return getActiveMultiSourceSession() !== null;
}

export function getActiveMultiSourceRecordingId(): string | null {
  return getActiveMultiSourceSession()?.recordingId ?? null;
}

export async function startMultiSourceRecording(params: {
  recordingId: string;
  settings: VideoRecordingSettings;
}): Promise<void> {
  await orchestrateMultiSourceRecordingStart(params);
}

async function orchestrateMultiSourceRecordingStart(params: {
  recordingId: string;
  settings: VideoRecordingSettings;
}): Promise<void> {
  if (getActiveMultiSourceSession()) {
    throw new Error('A multi-source recording is already active.');
  }

  const sequence = (startSequence += 1);
  const sources = consumeDesktopStreams();
  if (sources.length < 2) {
    disposeMultiSourceDesktopMedia();
    throw new Error('Multi-source recording requires at least two prepared sources.');
  }

  const prepared = await prepareMultiSourceRecorders({
    baseRecordingId: params.recordingId,
    sequence,
    settings: params.settings,
    sources,
  });
  if (!prepared) {
    return;
  }
  const session = createMultiSourceSession({
    ...prepared,
    recordingId: params.recordingId,
    settings: params.settings,
  });
  setActiveMultiSourceSession(session);
  startSessionRecorders(session);
  await session.lifecycle.startPromise;
}

async function prepareMultiSourceRecorders(params: {
  baseRecordingId: string;
  sequence: number;
  settings: VideoRecordingSettings;
  sources: ReturnType<typeof consumeDesktopStreams>;
}): Promise<PreparedMultiSourceRecorders | null> {
  let recorders: MultiSourceRecorder[] = [];
  let audioRecorder: MultiSourceRecorder | null = null;
  let webcamRecorder: RecordingSidecarRecorder | null = null;
  try {
    recorders = await createSourceRecorders({
      baseRecordingId: params.baseRecordingId,
      settings: params.settings,
      sources: params.sources,
    });
    audioRecorder = await createMicrophoneRecorder(params.baseRecordingId, params.settings);
    webcamRecorder = await createMultiSourceWebcamRecorder({
      baseRecordingId: params.baseRecordingId,
      settings: params.settings,
    });
    if (params.sequence !== startSequence || getActiveMultiSourceSession()) {
      disposePreparedMultiSourceRecorders({
        audioRecorder,
        recorders,
        sources: params.sources,
        webcamRecorder,
      });
      return null;
    }
  } catch (error) {
    disposePreparedMultiSourceRecorders({
      audioRecorder,
      recorders,
      sources: params.sources,
      webcamRecorder,
    });
    throw error;
  }

  return { audioRecorder, recorders, webcamRecorder };
}

function disposePreparedMultiSourceRecorders(params: {
  audioRecorder: MultiSourceRecorder | null;
  recorders: MultiSourceRecorder[];
  sources: ReturnType<typeof consumeDesktopStreams>;
  webcamRecorder: RecordingSidecarRecorder | null;
}): void {
  params.sources.forEach((source) => source.stream.getTracks().forEach((track) => track.stop()));
  stopRecorderStreams([...params.recorders, params.audioRecorder]);
  stopWebcamRecorderStream(params.webcamRecorder);
}

export function cancelPendingMultiSourceRecordingStart(): void {
  startSequence += 1;
}

function createMultiSourceSession(
  params: PreparedMultiSourceRecorders & {
    recordingId: string;
    settings: VideoRecordingSettings;
  }
): MultiSourceSession {
  return {
    audioRecorder: params.audioRecorder,
    durationTimer: null,
    lifecycle: createMultiSourceLifecycle(),
    recorders: params.recorders,
    recordingId: params.recordingId,
    settings: params.settings,
    startedAt: Date.now(),
    stopReject: null,
    stopPromise: null,
    stopResolve: null,
    webcamRecorder: params.webcamRecorder,
  };
}

function startSessionRecorders(session: MultiSourceSession): void {
  const sources = [...session.recorders, session.audioRecorder, session.webcamRecorder].filter(
    (source) => source !== null
  );
  const started = new Set<MediaRecorder>();
  const fail = (error: Error) => {
    const phase = session.lifecycle.phase;
    if (failMultiSourceSession(session, error) && phase === 'active') {
      notifyMultiSourceRuntimeFailure(session.recordingId, error);
    }
  };

  sources.forEach((source) => {
    const { recorder } = source;
    recorder.onstart = () => {
      if (session.lifecycle.phase !== 'starting') return;
      started.add(recorder);
      if (started.size !== sources.length || !session.lifecycle.activate()) return;
      sources.forEach((activeSource) => {
        activeSource.recorder.onstart = null;
      });
      session.startedAt = Date.now();
      initializeDurationPublishing(session);
      notifyMultiSourceStarted(session.recordingId);
    };
    recorder.onerror = (event) => {
      fail(getMediaRecorderError(event, 'A multi-source recorder failed.'));
    };
    recorder.onstop = () => {
      fail(
        new Error(
          session.lifecycle.phase === 'starting'
            ? 'A required recorder stopped before multi-source activation.'
            : 'A multi-source recorder stopped unexpectedly.'
        )
      );
    };
  });

  for (const source of sources) {
    if (session.lifecycle.phase === 'terminal') break;
    try {
      source.recorder.start(RECORDER_TIMESLICE_MS);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export function pauseMultiSourceRecording(): void {
  pauseSessionRecorders(getActiveMultiSourceSession());
}

export function resumeMultiSourceRecording(): void {
  resumeSessionRecorders(getActiveMultiSourceSession());
}

export function updateMultiSourceRecordingSettings(patch: {
  microphoneEnabled?: boolean;
  webcamEnabled?: boolean;
}): void {
  setSessionMediaEnabled(getActiveMultiSourceSession(), patch);
}

export function stopMultiSourceRecording(discard = false): Promise<void> {
  const session = getActiveMultiSourceSession();
  if (!session) {
    return Promise.resolve();
  }

  return stopMultiSourceSession({ discard, finalizeSession, session });
}
