import { createLogger } from '@sniptale/platform/observability/logger';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { WebcamActualSettings } from '@sniptale/runtime-contracts/video/types/types';
import { pickNumericWebcamActualSettings } from '@sniptale/runtime-contracts/video/types/webcam-actual-settings';
import { createWebcamSidecarRecorder } from './webcam';
import { getActiveSidecarSession, hasActiveSidecarSession, setActiveSidecarSession } from './state';
import type { RecordingSidecarRecorder, RecordingSidecarSession } from './types';
export { finalizeActiveSidecarRecordings } from './finalize';
export { createWebcamSidecarRecorder };
export { hasActiveSidecarSession };

const logger = createLogger({ namespace: 'OffscreenRecordingSidecar' });

function stopSidecarStreams(recorders: RecordingSidecarRecorder[]): void {
  recorders.forEach((sidecar) => {
    sidecar.stream.getTracks().forEach((track) => track.stop());
  });
}

export async function initializeSidecarRecorders(params: {
  baseRecordingId: string;
  captureMode?: CaptureMode;
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

export function startActiveSidecarRecorders(timeslice: number): void {
  getActiveSidecarSession()?.recorders.forEach((sidecar) => {
    sidecar.recorder.start(timeslice);
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

function createSidecarStopPromise(session: RecordingSidecarSession): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pendingStops = session.recorders.length;

    const finishOne = () => {
      if (settled) {
        return;
      }

      pendingStops -= 1;
      if (pendingStops > 0) {
        return;
      }

      settled = true;
      resolve();
    };

    const fail = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    session.recorders.forEach((sidecar) => {
      if (sidecar.recorder.state === 'inactive') {
        finishOne();
        return;
      }

      sidecar.recorder.onstop = () => {
        sidecar.recorder.onstop = null;
        finishOne();
      };
      sidecar.recorder.onerror = (event) => {
        fail((event as ErrorEvent).error ?? new Error('A sidecar recorder failed.'));
      };
      sidecar.recorder.requestData?.();
      sidecar.recorder.stop();
    });
  });
}

export function stopActiveSidecarRecordersWithFlush(): Promise<void> {
  const session = getActiveSidecarSession();
  if (!session) {
    return Promise.resolve();
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
    if (sidecar.recorder.state !== 'inactive') {
      try {
        sidecar.recorder.stop();
      } catch (error) {
        logger.debug('Failed to stop sidecar recorder during cleanup', error);
      }
    }
  });
  stopSidecarStreams(session.recorders);
  setActiveSidecarSession(null);
}
