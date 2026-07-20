import { loadBlobForAsset, preloadClipVideos } from './media';
import { finalizeExport, isMimeTypeCompatibleWithFormat, prepareOutputBlob } from './persistence';
import { type LoadedImagesMap } from './renderer';
import { sendProgress } from './runtime';
import { getAssetById, isVideoClip } from '../../features/video/project/timeline/basics';
import { isSimplePassthroughProject } from '../../features/video/project/timeline/meta';
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

export function canUsePassthroughPath(
  project: VideoProject,
  settings: VideoProjectExportSettings
): boolean {
  if (!isSimplePassthroughProject(project, settings)) {
    return false;
  }

  const clip = project.clips[0];
  if (!clip || !isVideoClip(clip)) {
    return false;
  }

  const asset = getAssetById(project, clip.assetId);
  return isMimeTypeCompatibleWithFormat(asset?.metadata.mimeType ?? '', settings.format);
}

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

export async function exportPassthrough(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings
): Promise<void> {
  assertExportNotCancelled(job);
  const clip = project.clips[0];
  if (!clip || !isVideoClip(clip)) {
    throw new Error(translate('offscreenExport.passthroughSingleClipOnly'));
  }

  const asset = getAssetById(project, clip.assetId);
  if (!asset) {
    throw new Error(translate('offscreenExport.passthroughAssetMissing'));
  }

  const blob = await loadBlobForAsset(asset);
  assertExportNotCancelled(job);
  const outputBlob = await prepareOutputBlob(settings, blob);
  await finalizeCompletedExport(job, project, settings, outputBlob);
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

  const outputBlob =
    settings.format === VideoExportFormat.MP4
      ? await renderCompositeToMp4(job, project, settings, loadedImages, canvas, context)
      : await renderCompositeToWebm(job, project, settings, loadedImages, context, canvas);

  await finalizeCompletedExport(job, sourceProject ?? project, settings, outputBlob);
}
