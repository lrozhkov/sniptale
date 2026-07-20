import type { ProjectExportEntry } from '../../../composition/persistence/projects/contracts';
import { resolveProjectExportRange } from '../../../features/video/project/export/range';
import { type VideoProjectExportSettings } from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';
import { getExportFormatDescriptor } from './format';

export function buildProjectExportEntry(params: {
  blob: Blob;
  exportId: string;
  filename: string;
  project: VideoProject;
  recordingId: string;
  settings: VideoProjectExportSettings;
}): ProjectExportEntry {
  const exportRange = resolveProjectExportRange(params.project, params.settings);

  return {
    id: params.exportId,
    projectId: params.project.id,
    recordingId: params.recordingId,
    filename: params.filename,
    createdAt: Date.now(),
    size: params.blob.size,
    duration: exportRange.duration,
    width: params.settings.width,
    height: params.settings.height,
    fps: params.settings.fps,
    format: params.settings.format,
    mimeType: getExportFormatDescriptor(params.settings.format).mimeType,
  };
}
