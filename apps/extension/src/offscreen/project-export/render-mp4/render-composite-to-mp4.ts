import { closeEncoderQuietly } from '../codecs';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { LoadedImagesMap } from '../renderer';
import { type VideoProjectExportSettings } from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';
import type { ExportJobState } from '../types';
import { announceMp4PipelineStart } from './announce';
import { createMp4EncoderState } from './encoder-state';
import { normalizeMp4ExportError } from './normalize-error';
import { createMp4Pipeline } from './pipeline/index';
import { runMp4EncodingPipeline } from './pipeline-runner';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

export async function renderCompositeToMp4(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  loadedImages: LoadedImagesMap,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D
): Promise<Blob> {
  const signal = job.exportAbortController?.signal;
  const pipeline = await createMp4Pipeline(project, settings, signal);
  let encoderState: ReturnType<typeof createMp4EncoderState> | null = null;
  let completed = false;

  try {
    if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
    await announceMp4PipelineStart(job.jobId, pipeline.fallbackNotes);
    encoderState = createMp4EncoderState(pipeline);
    const blob = await runMp4EncodingPipeline({
      audioEncoder: encoderState.audioEncoder,
      canvas,
      context,
      job,
      loadedImages,
      pipeline,
      project,
      settings,
      throwIfPipelineFailed: encoderState.throwIfPipelineFailed,
      videoEncoder: encoderState.videoEncoder,
      ...(signal === undefined ? {} : { signal }),
    });
    if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
    completed = true;
    return blob;
  } catch (error) {
    const normalized = normalizeMp4ExportError(error, job.cancelled);
    if (normalized.kind === 'failure') {
      logger.error('MP4 encode failed', error);
    }
    throw normalized.error;
  } finally {
    closeEncoderQuietly(encoderState?.videoEncoder ?? null);
    closeEncoderQuietly(encoderState?.audioEncoder ?? null);
    if (!completed) {
      await pipeline.muxer.cancel().catch((error: unknown) => {
        logger.error('MP4 output cleanup failed', error);
      });
    }
  }
}
