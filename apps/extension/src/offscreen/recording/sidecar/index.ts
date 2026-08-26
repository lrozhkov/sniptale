import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { WebcamActualSettings } from '@sniptale/runtime-contracts/video/types/types';
import { pickNumericWebcamActualSettings } from '@sniptale/runtime-contracts/video/types/webcam-actual-settings';
import { createWebcamSidecarRecorder } from './webcam';
import type { RecordingSidecarRecorder, RecordingSidecarSession } from './types';
import type {
  FinalizedRecordingStagingArtifact,
  RecordingStagingCoordinator,
} from '../../../composition/persistence/recordings/staging';
export { createWebcamSidecarRecorder };

const logger = createLogger({ namespace: 'OffscreenRecordingSidecar' });
let activeSidecarSession: RecordingSidecarSession | null = null;

function getActiveSidecarSession(): RecordingSidecarSession | null {
  return activeSidecarSession;
}

function setActiveSidecarSession(session: RecordingSidecarSession | null): void {
  activeSidecarSession = session;
}

export function hasActiveSidecarSession(): boolean {
  return activeSidecarSession !== null;
}

function stopSidecarStreams(recorders: RecordingSidecarRecorder[]): void {
  recorders.forEach((sidecar) => sidecar.release());
}

export async function initializeSidecarRecorders(params: {
  baseRecordingId: string;
  captureMode?: CaptureMode;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
}): Promise<void> {
  if (params.captureMode === CaptureMode.CAMERA) {
    setActiveSidecarSession(null);
    return;
  }

  const recorders: RecordingSidecarRecorder[] = [];

  try {
    const webcam = await createWebcamSidecarRecorder(params);
    if (webcam) {
      recorders.push(webcam);
    }
  } catch (error) {
    stopSidecarStreams(recorders);
    throw error;
  }

  if (recorders.length === 0) {
    setActiveSidecarSession(null);
    return;
  }

  setActiveSidecarSession({
    recorders,
    stopPromise: null,
  });
}

export function startActiveSidecarRecorders(onUnexpectedFailure: (error: Error) => void): void {
  getActiveSidecarSession()?.recorders.forEach((sidecar) => {
    sidecar.artifactSession.setLifecycleCallbacks({
      onFailure: onUnexpectedFailure,
      onStop: (artifact) => {
        sidecar.artifact = artifact;
        if (!getActiveSidecarSession()?.stopPromise) {
          onUnexpectedFailure(new Error('A sidecar recorder stopped unexpectedly.'));
        }
      },
    });
    try {
      sidecar.artifactSession.start();
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  });
}

export function pauseActiveSidecarRecorders(): void {
  getActiveSidecarSession()?.recorders.forEach((sidecar) => {
    if (sidecar.recorder.state === 'recording') {
      sidecar.recorder.pause();
    }
  });
}

export function resumeActiveSidecarRecorders(): void {
  getActiveSidecarSession()?.recorders.forEach((sidecar) => {
    if (sidecar.recorder.state === 'paused') {
      sidecar.recorder.resume();
    }
  });
}

export function setActiveSidecarWebcamEnabled(enabled: boolean): void {
  getActiveSidecarSession()?.recorders.forEach((sidecar) => {
    if (sidecar.kind === 'webcam') {
      sidecar.stream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  });
}

export function getActiveSidecarWebcamSettings(): WebcamActualSettings | null {
  const webcam = getActiveSidecarSession()?.recorders.find((sidecar) => sidecar.kind === 'webcam');
  if (!webcam) {
    return null;
  }

  return pickNumericWebcamActualSettings(webcam.trackSettings);
}

export function getActiveSidecarVideoProfiles(): Array<{
  dimensions: { height: number; width: number };
  frameRate: number;
}> {
  return (getActiveSidecarSession()?.recorders ?? []).map((sidecar) => {
    const { frameRate, height, width } = sidecar.trackSettings;
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      typeof frameRate !== 'number' ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      !Number.isFinite(frameRate) ||
      width <= 0 ||
      height <= 0 ||
      frameRate <= 0
    ) {
      throw new Error(`Webcam recording profile is unavailable for ${sidecar.recordingId}.`);
    }
    return { dimensions: { height, width }, frameRate };
  });
}

export function getActiveSidecarRecordingMetadata(): Array<{
  dimensions: { height: number; width: number };
  recordingId: string;
  role: 'webcam';
  sourceLabel: string | null;
}> {
  return (getActiveSidecarSession()?.recorders ?? []).map((sidecar) => {
    const { height, width } = sidecar.trackSettings;
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error(`Webcam recording dimensions are unavailable for ${sidecar.recordingId}.`);
    }
    return {
      dimensions: { height, width },
      recordingId: sidecar.recordingId,
      role: sidecar.kind,
      sourceLabel: sidecar.sourceLabel,
    };
  });
}

async function createSidecarStopPromise(
  session: RecordingSidecarSession
): Promise<FinalizedRecordingStagingArtifact[]> {
  return Promise.all(
    session.recorders.map(async (sidecar) => {
      const artifact = await sidecar.artifactSession.stop();
      sidecar.artifact = artifact;
      return artifact;
    })
  );
}

export function stopActiveSidecarRecordersWithFlush(): Promise<
  FinalizedRecordingStagingArtifact[]
> {
  const session = getActiveSidecarSession();
  if (!session) {
    return Promise.resolve([]);
  }

  if (!session.stopPromise) {
    session.stopPromise = createSidecarStopPromise(session);
  }

  return session.stopPromise;
}

export function cleanupActiveSidecarRecorders(): void {
  const session = getActiveSidecarSession();
  if (!session) {
    return;
  }

  session.recorders.forEach((sidecar) => {
    void sidecar.artifactSession.abort().catch((error) => {
      logger.debug('Failed to abort sidecar artifact during cleanup', error);
    });
  });
  stopSidecarStreams(session.recorders);
  setActiveSidecarSession(null);
}
