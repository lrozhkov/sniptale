import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoProjectExportPhase } from '../../features/video/project/types';
import { VideoWebmCodec } from '../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getVideoRecordingMimeTypeCandidates,
  VideoOutputContainer,
} from '@sniptale/runtime-contracts/video/types/types';
import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
import {
  loadActiveProjectExportJobLedgerEntry,
  upsertProjectExportJobLedgerEntry,
} from '../../composition/persistence/export-ledger';
import type { ProjectExportRuntimeState } from './types';
export { waitForDelay } from './timing';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

export function getSupportedWebmExportMimeType(
  codec: VideoWebmCodec = VideoWebmCodec.VP9,
  hasAudioTracks = true
): string {
  const candidates = getVideoRecordingMimeTypeCandidates(
    {
      codec,
      container: VideoOutputContainer.WEBM,
    },
    hasAudioTracks
  );
  const supported = candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
  if (!supported) {
    throw new Error('The selected WebM codec is not supported');
  }
  return supported;
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
