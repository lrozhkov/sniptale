import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingSidecarRecorder } from '../sidecar/types';
import { pauseSessionRecorders, resumeSessionRecorders, setSessionMediaEnabled } from './controls';
import { consumeDesktopStreams, disposeMultiSourceDesktopMedia } from '../setup/desktop-media';
import { initializeDurationPublishing } from './duration';
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
import { createRecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import { assertRecordingResourceBudget } from '../encoding/resource-budget';

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

function requireVideoDimensions(source: {
  recordingId: string;
  trackSettings: MediaTrackSettings;
}): { height: number; width: number } {
  const { height, width } = source.trackSettings;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(`Recording dimensions are unavailable for ${source.recordingId}.`);
  }
  return { height, width };
}

function assertMultiSourceResourceBudget(
  prepared: PreparedMultiSourceRecorders,
  settings: VideoRecordingSettings
): void {
  assertRecordingResourceBudget({
    dimensions: [
      ...prepared.recorders.map(requireVideoDimensions),
      ...(prepared.webcamRecorder ? [requireVideoDimensions(prepared.webcamRecorder)] : []),
    ],
    frameRate: settings.outputProfile.frameRate,
    resolution: settings.outputProfile.resolution,
  });
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

  const coordinator = await createRecordingStagingCoordinator();
  let prepared: PreparedMultiSourceRecorders | null;
  try {
    prepared = await prepareMultiSourceRecorders({
      baseRecordingId: params.recordingId,
      coordinator,
      sequence,
      settings: params.settings,
      sources,
    });
  } catch (error) {
    await coordinator.abort();
    throw error;
  }
  if (!prepared) {
    await coordinator.abort();
    return;
  }
  try {
    assertMultiSourceResourceBudget(prepared, params.settings);
  } catch (error) {
    disposePreparedMultiSourceRecorders({ ...prepared, sources });
    await coordinator.abort();
    throw error;
  }
  const session = createMultiSourceSession({
    ...prepared,
    recordingId: params.recordingId,
    settings: params.settings,
    staging: coordinator,
  });
  setActiveMultiSourceSession(session);
  startSessionRecorders(session);
  await session.lifecycle.startPromise;
}

async function prepareMultiSourceRecorders(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
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
      coordinator: params.coordinator,
      settings: params.settings,
      sources: params.sources,
    });
    audioRecorder = await createMicrophoneRecorder(
      params.baseRecordingId,
      params.settings,
      params.coordinator
    );
    webcamRecorder = await createMultiSourceWebcamRecorder({
      baseRecordingId: params.baseRecordingId,
      coordinator: params.coordinator,
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
    staging: RecordingStagingCoordinator;
  }
): MultiSourceSession {
  return {
    audioRecorder: params.audioRecorder,
    durationTimer: null,
    lifecycle: createMultiSourceLifecycle(),
    recorders: params.recorders,
    recordingId: params.recordingId,
    settings: params.settings,
    staging: params.staging,
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
    source.artifactSession.setLifecycleCallbacks({
      onFailure: fail,
      onStart: () => {
        if (session.lifecycle.phase !== 'starting') return;
        started.add(recorder);
        if (started.size !== sources.length || !session.lifecycle.activate()) return;
        session.startedAt = Date.now();
        initializeDurationPublishing(session);
        notifyMultiSourceStarted(session.recordingId);
      },
      onStop: (artifact) => {
        source.artifact = artifact;
        if (session.lifecycle.phase === 'terminal') return;
        fail(
          new Error(
            session.lifecycle.phase === 'starting'
              ? 'A required recorder stopped before multi-source activation.'
              : 'A multi-source recorder stopped unexpectedly.'
          )
        );
      },
    });
  });

  for (const source of sources) {
    if (session.lifecycle.phase === 'terminal') break;
    try {
      source.artifactSession.start();
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
