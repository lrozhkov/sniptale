import {
  deleteProjectExportSafely,
  deleteOrphanedRawRecordingsSafely,
  saveProjectExportSafely,
  saveRecordingSafely,
} from '../../../../../workflows/media-hub/store';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';
import { buildProjectExportEntry } from '../../entry';
import { getExportFormatDescriptor } from '../../format';
import { buildExportFilename } from './filename';
import { buildSubtitleSidecarFiles } from './subtitle-sidecar';
import { downloadExportRecording, downloadExportSidecar } from './runtime/index';
import { notifyProjectExportCompleted } from './runtime/notify';

interface FinalizeExportOptions {
  isCancelled?: () => boolean;
  signal?: AbortSignal;
}

interface SaveCompletedProjectExportArgs {
  blob: Blob;
  exportId: string;
  filename: string;
  jobId: string;
  options: FinalizeExportOptions;
  project: VideoProject;
  recordingId: string;
  settings: VideoProjectExportSettings;
}

function assertFinalizationNotCancelled(options: FinalizeExportOptions = {}): void {
  if (options.signal?.aborted || options.isCancelled?.()) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

async function saveProjectExportAndAcceptCompletion(
  args: SaveCompletedProjectExportArgs
): Promise<void> {
  let projectExportSaved = false;
  try {
    assertFinalizationNotCancelled(args.options);
    await saveProjectExportSafely(
      buildProjectExportEntry({
        blob: args.blob,
        exportId: args.exportId,
        filename: args.filename,
        project: args.project,
        recordingId: args.recordingId,
        settings: args.settings,
      })
    );
    projectExportSaved = true;
    assertFinalizationNotCancelled(args.options);
    await acceptProjectExportCompletion(args);
  } catch (error) {
    if (projectExportSaved) {
      await deleteProjectExportSafely(args.exportId);
    }
    await deleteOrphanedRawRecordingsSafely([args.recordingId]);
    throw error;
  }
}

async function acceptProjectExportCompletion(args: SaveCompletedProjectExportArgs): Promise<void> {
  const completionAccepted = await notifyProjectExportCompleted(
    {
      exportId: args.exportId,
      filename: args.filename,
      format: args.settings.format,
      jobId: args.jobId,
      projectId: args.project.id,
      recordingId: args.recordingId,
    },
    args.options
  );
  if (!completionAccepted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

/**
 * Finalize a project export by persisting the recording, saving the export entry, and notifying
 * the runtime about the completed export.
 */
export async function finalizeExport(
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  blob: Blob,
  options: FinalizeExportOptions = {}
): Promise<void> {
  assertFinalizationNotCancelled(options);
  const descriptor = getExportFormatDescriptor(settings.format);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = buildExportFilename({
    extension: descriptor.extension,
    projectName: project.name || 'project-export',
    timestamp,
  });
  const subtitleSidecarFiles = buildSubtitleSidecarFiles(project, settings, filename);
  const recordingId = `export-${crypto.randomUUID()}`;
  const exportId = crypto.randomUUID();

  await saveRecordingSafely(recordingId, blob, filename);
  await saveProjectExportAndAcceptCompletion({
    blob,
    exportId,
    filename,
    jobId,
    options,
    project,
    recordingId,
    settings,
  });

  downloadExportRecording(recordingId, filename, settings.downloadAfterExport);
  subtitleSidecarFiles.forEach((file) => downloadExportSidecar(file.blob, file.filename));
}
