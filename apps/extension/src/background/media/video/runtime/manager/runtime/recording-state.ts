import { createLogger } from '@sniptale/platform/observability/logger';
import { stopDiagnostics } from '../../../../../diagnostics/public/session';
import {
  getVideoRecordingId,
  getVideoRecordingTabId,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from '../../../session-state';

const logger = createLogger({ namespace: 'BackgroundVideoRuntime' });

export function getRecordingTabId(): number | null {
  return getVideoRecordingTabId();
}

export function resetRecordingTabId(): void {
  setVideoRecordingTabId(null);
  logger.log('Recording tab ID reset');
}

export function isRecording(): boolean {
  return getVideoRecordingTabId() !== null;
}

export function getCurrentRecordingId(): string | null {
  return getVideoRecordingId();
}

export function resetRecordingId(): void {
  setVideoRecordingId(null);
  logger.log('Recording ID reset');
}

export async function finalizeRecordingDiagnostics(recordingId?: string): Promise<void> {
  const currentRecordingId = getVideoRecordingId();
  const idToFinalize = recordingId || currentRecordingId;

  if (!idToFinalize) {
    return;
  }

  try {
    logger.log('Finalizing diagnostics', idToFinalize);
    await stopDiagnostics(idToFinalize);
    logger.log('Diagnostics finalized');
  } catch (error) {
    logger.error('Failed to finalize diagnostics', error);
  }

  if (getVideoRecordingId() === idToFinalize) {
    setVideoRecordingId(null);
  }
}
