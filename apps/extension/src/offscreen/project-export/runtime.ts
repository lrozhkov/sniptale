import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoProjectExportPhase } from '../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
import {
  loadActiveProjectExportJobLedgerEntry,
  upsertProjectExportJobLedgerEntry,
} from '../../composition/persistence/export-ledger';
import {
  getFirstSupportedMediaRecorderMimeType,
  WEBM_EXPORT_MIME_TYPE_CANDIDATES,
} from '../recording/recorder-mime';
import type { ProjectExportRuntimeState } from './types';
export { waitForDelay } from './timing';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

export function getSupportedWebmExportMimeType(): string {
  return getFirstSupportedMediaRecorderMimeType(WEBM_EXPORT_MIME_TYPE_CANDIDATES);
}

export async function sendProgress(
  jobId: string,
  phase: VideoProjectExportPhase,
  progress: number,
  message: string
): Promise<void> {
  const activeLedgerEntry = await loadActiveProjectExportJobLedgerEntry();
  if (activeLedgerEntry?.jobId === jobId) {
    await upsertProjectExportJobLedgerEntry({
      jobId,
      projectId: activeLedgerEntry.projectId,
      phase,
      progress: Math.max(0, Math.min(100, progress)),
    });
  }

  sendRuntimeMessageBestEffort({
    context: { jobId, phase },
    logger,
    logMessage: 'Failed to notify runtime about export progress',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId,
      status: {
        phase,
        progress: Math.max(0, Math.min(100, progress)),
        message,
      },
    },
  });
}

export function cleanupJob(job: ProjectExportRuntimeState): void {
  for (const audioNode of job.clipAudioNodes.values()) {
    audioNode.source.disconnect();
    audioNode.gain.disconnect();
  }
  job.clipAudioNodes.clear();

  if (job.audioDestination) {
    job.audioDestination.stream.getTracks().forEach((track) => track.stop());
    job.audioDestination = null;
  }

  if (job.audioContext && job.audioContext.state !== 'closed') {
    void job.audioContext.close().catch((error) => {
      logger.warn('Failed to close AudioContext', error);
    });
  }
  job.audioContext = null;
  job.exportAudioSettings = null;

  for (const video of job.clipMediaElements.values()) {
    video.pause();
    video.src = '';
  }
  job.clipMediaElements.clear();

  for (const url of job.assetUrls) {
    URL.revokeObjectURL(url);
  }
  job.assetUrls = [];

  if (job.cleanupNode) {
    job.cleanupNode.remove();
    job.cleanupNode = null;
  }

  if (job.exportStream) {
    job.exportStream.getTracks().forEach((track) => track.stop());
    job.exportStream = null;
  }

  if (job.exportAbortController) {
    job.exportAbortController.abort();
    job.exportAbortController = null;
  }

  job.mediaRecorder = null;
}
