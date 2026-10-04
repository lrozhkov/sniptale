import { getMediaLibraryEntry } from '../../../../../composition/persistence/media-library';
import { createRecordingMediaId } from '../../../../../features/media-hub/media-id';
import { getRecordingTelemetry } from '../../../../../composition/persistence/recordings/telemetry';
import { summarizeRecordingMetadata } from '../../../../../features/media-hub/recording-metadata';
import {
  createOutputFilename,
  createFilenameSession,
} from '../../../../../workflows/file-naming/index';
import {
  deleteProjectExportSafely,
  saveProjectExportSafely,
} from '../../../../../workflows/media-hub/store';
import { type VideoProjectExportSettings } from '../../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../../features/video/project/types/model';
import { buildProjectExportEntry } from '../../entry';
import { getExportFormatDescriptor } from '../../format';
import { buildSubtitleSidecarFiles } from './subtitle-sidecar';
import { downloadProjectExport, downloadExportSidecar } from './runtime/index';
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
  settings: VideoProjectExportSettings;
}

function assertFinalizationNotCancelled(options: FinalizeExportOptions = {}): void {
  if (options.signal?.aborted || options.isCancelled?.()) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

async function readPrimaryRecordingMetadata(project: VideoProject) {
  const recordingId =
    project.source.kind === 'recording' ? project.source.recordingId : project.baseRecordingId;
  if (!recordingId) return undefined;
  const media = await getMediaLibraryEntry(createRecordingMediaId(recordingId));
  if (media?.recordingMetadata) return media.recordingMetadata;
  const telemetry = await getRecordingTelemetry(recordingId);
  return telemetry ? summarizeRecordingMetadata(telemetry) : undefined;
}

async function saveProjectExportAndAcceptCompletion(
  args: SaveCompletedProjectExportArgs
): Promise<void> {
  let projectExportSaved = false;
  try {
    assertFinalizationNotCancelled(args.options);
    const recordingMetadata = await readPrimaryRecordingMetadata(args.project);
    assertFinalizationNotCancelled(args.options);
    await saveProjectExportSafely({
      ...buildProjectExportEntry({
        blob: args.blob,
        exportId: args.exportId,
        filename: args.filename,
        project: args.project,
        settings: args.settings,
      }),
      ...(recordingMetadata ? { recordingMetadata } : {}),
    });
    projectExportSaved = true;
    assertFinalizationNotCancelled(args.options);
    await acceptProjectExportCompletion(args);
  } catch (error) {
    if (projectExportSaved) {
      await deleteProjectExportSafely(args.exportId);
    }
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
    },
    args.options
  );
  if (!completionAccepted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }
}

/**
 * Finalize a project export by publishing its durable asset and notifying the runtime.
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
  const exportId = crypto.randomUUID();
  const filename = await createOutputFilename(
    {
      category: 'recordings',
      type: 'video-export',
      title: project.name,
      extension: descriptor.extension,
    },
    await createFilenameSession(exportId)
  );
  const subtitleSidecarFiles = buildSubtitleSidecarFiles(project, settings, filename);
  await saveProjectExportAndAcceptCompletion({
    blob,
    exportId,
    filename,
    jobId,
    options,
    project,
    settings,
  });

  downloadProjectExport(exportId, filename, settings.downloadAfterExport);
  subtitleSidecarFiles.forEach((file) => downloadExportSidecar(file.blob, file.filename));
}
