import type { VideoProjectExportSettings } from '../../../../../../features/video/project/types';
import type { ProjectExportInputReference } from '../../../../../../contracts/video/types/project-export-input';
import {
  cancelProjectExportUseCase,
  getProjectExportCapabilitiesUseCase,
  startProjectExportUseCase,
  type ProjectExportOwnerIdentity,
} from '../../../application/export/use-case';

export function handleStartProjectExport(
  message: {
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  },
  owner: ProjectExportOwnerIdentity
) {
  return startProjectExportUseCase(message, owner);
}

export function handleGetProjectExportCapabilities(
  message: { jobId?: string; settings: VideoProjectExportSettings },
  owner: ProjectExportOwnerIdentity
) {
  return getProjectExportCapabilitiesUseCase(message, owner);
}

export function handleCancelProjectExport(message: { jobId: string }) {
  return cancelProjectExportUseCase(message);
}
