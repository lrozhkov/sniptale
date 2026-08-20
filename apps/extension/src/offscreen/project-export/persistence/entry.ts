import type { SaveProjectExportInput } from '../../../composition/persistence/projects/index.exports';
import { resolveProjectExportRange } from '../../../features/video/project/export/range';
import { type VideoProjectExportSettings } from '../../../features/video/project/types/export';
import { type VideoProject } from '../../../features/video/project/types/model';
import { getExportFormatDescriptor } from './format';

export function buildProjectExportEntry(params: {
  blob: Blob;
  exportId: string;
  filename: string;
  project: VideoProject;
  settings: VideoProjectExportSettings;
}): SaveProjectExportInput {
  const exportRange = resolveProjectExportRange(params.project, params.settings);

  return {
    id: params.exportId,
    projectId: params.project.id,
    blob: params.blob,
    filename: params.filename,
    createdAt: Date.now(),
    duration: exportRange.duration,
    width: params.settings.width,
    height: params.settings.height,
    fps: params.settings.fps,
    format: params.settings.format,
    mimeType: getExportFormatDescriptor(params.settings.format).mimeType,
  };
}
