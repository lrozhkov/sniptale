import { cleanupJob, sendProgress } from '../runtime';
import { loadImagesForProject } from '../media';
import { translate } from '../../../platform/i18n';
import { canUsePassthroughPath, exportPassthrough, renderCompositeExport } from '../render';
import { resolveProjectRenderScope } from '../scope';
import type { ExportJobState } from '../types';
import {
  VideoProjectExportPhase,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';

function assertProjectExportNotCancelled(jobState: ExportJobState): void {
  if (jobState.cancelled || jobState.exportAbortController?.signal.aborted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

export async function runProjectExport(
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  jobState: ExportJobState
): Promise<void> {
  jobState.exportAbortController = new AbortController();

  await sendProgress(
    jobId,
    VideoProjectExportPhase.PREPARING,
    0,
    translate('offscreenExport.preparingProject')
  );

  assertProjectExportNotCancelled(jobState);

  if (canUsePassthroughPath(project, settings)) {
    await exportPassthrough(jobState, project, settings);
    return;
  }

  const renderProject = resolveProjectRenderScope(project, settings);
  const loadedImages = await loadImagesForProject(
    renderProject,
    jobState,
    jobState.exportAbortController.signal
  );
  await renderCompositeExport(jobState, renderProject, settings, loadedImages, project);
}

export function cancelActiveProjectExportJob(activeJob: ExportJobState): void {
  activeJob.cancelled = true;
  activeJob.exportAbortController?.abort();
  if (activeJob.exportStream) {
    activeJob.exportStream.getTracks().forEach((track) => track.stop());
  }
  if (activeJob.mediaRecorder && activeJob.mediaRecorder.state !== 'inactive') {
    activeJob.mediaRecorder.stop();
  }
}

export function releaseProjectExportJob(jobState: ExportJobState): void {
  cleanupJob(jobState);
}
