import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { createProjectExportService } from './service';
import { type VideoProjectExportSettings } from '../../features/video/project/types/export';
import { type VideoProject } from '../../features/video/project/types/model';
import { getProjectExportCapabilities as resolveProjectExportCapabilities } from './capabilities';

const defaultProjectExportService = createLazyDefaultOwner(createProjectExportService);

export async function startProjectExport(
  jobId: string,
  project: VideoProject,
  settings: VideoProjectExportSettings
): Promise<void> {
  return defaultProjectExportService.getOwner().startProjectExport(jobId, project, settings);
}

export function cancelProjectExport(jobId: string): Promise<void> {
  return defaultProjectExportService.getOwner().cancelProjectExport(jobId);
}

export function reconcileProjectExportJobs(): Promise<void> {
  return defaultProjectExportService.getOwner().reconcileProjectExportJobs();
}

export async function getProjectExportCapabilities(settings: VideoProjectExportSettings) {
  return resolveProjectExportCapabilities(settings);
}
