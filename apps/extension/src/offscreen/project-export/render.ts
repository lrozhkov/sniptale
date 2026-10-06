import { createExportTimeHistory } from '../../composition/persistence/export-time-history';
import {
  createExportTimeCalibration,
  createExportTimeProfile,
} from '../../features/video/project/export/time-calibration';
import { createExportTimeEstimator } from '../../features/video/project/export/time-estimate';
import { planProjectExportTime } from '../../features/video/project/export/time-estimate-plan';
import { preloadClipVideos } from './media';
import { finalizeExport } from './persistence';
import { type LoadedImagesMap } from './renderer';
import { sendProgress } from './runtime';
import {
  VideoExportFormat,
  VideoProjectExportPhase,
  type VideoProjectExportSettings,
} from '../../features/video/project/types/export';
import { type VideoProject } from '../../features/video/project/types/model';
import { translate } from '../../platform/i18n';
import { type ExportJobState } from './types';
import { renderCompositeToMp4 } from './render-mp4';
import { renderCompositeToWebm } from './render-webm';

function assertExportNotCancelled(job: ExportJobState): void {
  if (job.cancelled || job.exportAbortController?.signal.aborted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

function createFinalizeExportOptions(job: ExportJobState) {
  const options = {
    isCancelled: () => job.cancelled,
  };
  return job.exportAbortController
    ? { ...options, signal: job.exportAbortController.signal }
    : options;
}

async function finalizeCompletedExport(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  outputBlob: Blob
): Promise<void> {
  assertExportNotCancelled(job);
  await sendProgress(
    job.jobId,
    VideoProjectExportPhase.SAVING,
    100,
    translate('offscreenExport.savingFinishedFile')
  );
  assertExportNotCancelled(job);
  await finalizeExport(job.jobId, project, settings, outputBlob, createFinalizeExportOptions(job));
}

/** Advisory timing has no authority over rendering or publication. */
function createProjectExportTiming(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  signal: AbortSignal
) {
  const work = planProjectExportTime(project, settings);
  const calibration = createExportTimeCalibration();
  const history = createExportTimeHistory();
  const codec =
    settings.format === VideoExportFormat.MP4 ? settings.mp4VideoCodec : settings.webmVideoCodec;
  const codecs = { AVC: 'avc', HEVC: 'hevc', VP8: 'vp8', VP9: 'vp9' } as const;
  const profile = createExportTimeProfile({
    editor: 'project',
    route: 'render',
    container: settings.format === VideoExportFormat.MP4 ? 'mp4' : 'webm',
    codec: codecs[codec],
    width: settings.width,
    height: settings.height,
    fps: settings.fps,
    quality: settings.quality,
    complexity:
      work.reduce((sum, item) => sum + (item.end - item.start) * item.cost, 0) /
      Math.max(
        0.001,
        work.reduce((sum, item) => sum + item.end - item.start, 0)
      ),
  });
  void history
    .read(profile, signal)
    .then((ratios) => {
      if (!signal.aborted) calibration.setHistory(ratios);
    })
    .catch(() => undefined);
  return {
    estimator: createExportTimeEstimator(work, undefined, calibration.estimate),
    finish: () => {
      void history.record(profile, calibration.finish(), signal).catch(() => undefined);
    },
  };
}

export async function renderCompositeExport(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  loadedImages: LoadedImagesMap,
  sourceProject?: VideoProject
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(translate('offscreenExport.canvasContextError'));
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '1px';
  container.style.height = '1px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);
  container.appendChild(canvas);
  job.cleanupNode = container;

  const abortController = job.exportAbortController ?? new AbortController();
  job.exportAbortController = abortController;
  await preloadClipVideos(project, job, container, abortController.signal);

  const timing = createProjectExportTiming(project, settings, abortController.signal);
  job.timeEstimator = timing.estimator;
  const outputBlob =
    settings.format === VideoExportFormat.MP4
      ? await renderCompositeToMp4(job, project, settings, loadedImages, canvas, context)
      : await renderCompositeToWebm(job, project, settings, loadedImages, context, canvas);

  assertExportNotCancelled(job);
  timing.finish();
  await finalizeCompletedExport(job, sourceProject ?? project, settings, outputBlob);
}
