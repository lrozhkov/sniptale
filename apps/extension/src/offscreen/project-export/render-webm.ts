import { sendProgress } from './runtime';
import { translate } from '../../platform/i18n';
import {
  VideoProjectExportPhase,
  type VideoProject,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
import { renderOfflineAudioMix } from './offline-audio';
import { runFrameDrivenCompositeRenderLoop } from './render-loop/frame-driven';
import type { LoadedImagesMap } from './renderer';
import type { ExportJobState } from './types';
import { createWebmEncoding } from './webm-encoding';

export async function renderCompositeToWebm(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  loadedImages: LoadedImagesMap,
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): Promise<Blob> {
  const signal = job.exportAbortController?.signal;
  const mixedAudio = await renderOfflineAudioMix(project, settings, signal);
  const pipeline = await createWebmEncoding(settings, Boolean(mixedAudio));
  const check = () => {
    if (job.cancelled || signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
    pipeline.check();
  };
  try {
    check();
    await runFrameDrivenCompositeRenderLoop(
      job,
      project,
      settings,
      canvas,
      context,
      loadedImages,
      pipeline.videoEncoder,
      check,
      signal
    );
    check();
    await sendProgress(
      job.jobId,
      VideoProjectExportPhase.TRANSCODING,
      0,
      translate('videoEditor.progress.transcoding')
    );
    const blob = await pipeline.finish(mixedAudio?.buffer);
    check();
    return blob;
  } finally {
    await pipeline.dispose();
  }
}
