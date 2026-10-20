import {
  createVideoProjectWatermarkRenderer,
  type VideoProjectWatermarkRenderer,
} from '../../features/video/composition/canvas/project-watermark';
import { loadBlobForAsset } from './media-loading/blob';
import {
  createReviewSpatialRenderer,
  type ReviewSpatialRenderer,
} from '../../features/video/composition/canvas/spatial-renderer';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { createLogger } from '@sniptale/platform/observability/logger';
import { VideoProjectExportPhase } from '../../features/video/project/types';
import { VideoWebmCodec } from '../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  getVideoRecordingMimeTypeCandidates,
  VideoOutputContainer,
} from '@sniptale/runtime-contracts/video/types/types';
import { sendRuntimeMessageBestEffort } from '../runtime-messaging/best-effort';
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
  message: string,
  timeEstimate?: VideoProjectExportTimeEstimate | null
): Promise<void> {
  const local = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const bands = {
    PREPARING: [0, 5],
    RENDERING: [5, 90],
    TRANSCODING: [90, 97],
    SAVING: [97, 99],
  } as const;
  const band = phase in bands ? bands[phase as keyof typeof bands] : null;
  const mapped = band ? band[0] + ((band[1] - band[0]) * local) / 100 : local;
  const overall = phase === VideoProjectExportPhase.DONE ? 100 : Math.min(99, mapped);

  sendRuntimeMessageBestEffort({
    context: { jobId, phase },
    logger,
    logMessage: 'Failed to notify runtime about export progress',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_PROGRESS,
      jobId,
      status: {
        phase,
        progress: overall,
        message,
        ...(timeEstimate ? { timeEstimate } : {}),
      },
    },
  });
}

/** The existing export job owns the camera context until cleanup or context loss. */
export function getProjectExportSpatialRenderer(
  job: Pick<ProjectExportRuntimeState, 'cameraSpatialRenderer'> & { cancelled?: boolean },
  signal?: AbortSignal
): ReviewSpatialRenderer {
  if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  if (job.cameraSpatialRenderer) return job.cameraSpatialRenderer;
  const renderer: ReviewSpatialRenderer = createReviewSpatialRenderer(() => {
    if (job.cameraSpatialRenderer !== renderer) return;
    delete job.cameraSpatialRenderer;
    renderer.dispose();
  });
  job.cameraSpatialRenderer = renderer;
  return renderer;
}

/** The export job owns prepared final-canvas watermark resources. */
export function getProjectExportWatermarkRenderer(
  job: Pick<ProjectExportRuntimeState, 'watermarkRenderer'> & { cancelled?: boolean },
  signal?: AbortSignal
): VideoProjectWatermarkRenderer {
  if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  job.watermarkRenderer ??= createVideoProjectWatermarkRenderer(loadBlobForAsset);
  return job.watermarkRenderer;
}

export function cleanupJob(job: ProjectExportRuntimeState): void {
  const spatialRenderer = job.cameraSpatialRenderer;
  delete job.cameraSpatialRenderer;
  spatialRenderer?.dispose();
  job.watermarkRenderer?.clear();
  delete job.watermarkRenderer;
  job.captionRenderer?.clear();
  delete job.captionRenderer;
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
