import type {
  VideoExportFormat,
  VideoProjectExportSettings,
  VideoProjectExportStatus,
} from '../../../features/video/project/types/export';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ProjectExportInputReference } from './project-export-input';

export type { ProjectExportInputReference } from './project-export-input';

export interface StartProjectExportMessage {
  type: typeof VideoMessageType.START_PROJECT_EXPORT;
  capabilityToken: string;
  input: ProjectExportInputReference;
  jobId: string;
  settings: VideoProjectExportSettings;
}

export interface CancelProjectExportMessage {
  type: typeof VideoMessageType.CANCEL_PROJECT_EXPORT;
  capabilityToken: string;
  jobId: string;
}

export interface GetProjectExportCapabilitiesMessage {
  type: typeof VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES;
  jobId?: string;
  settings: VideoProjectExportSettings;
}

export interface ProjectExportProgressMessage {
  type: typeof VideoMessageType.PROJECT_EXPORT_PROGRESS;
  jobId: string;
  status: VideoProjectExportStatus;
  targetDocumentId?: string;
  targetSenderUrl?: string;
}

export interface ProjectExportCompletedMessage {
  type: typeof VideoMessageType.PROJECT_EXPORT_COMPLETED;
  jobId: string;
  projectId: string;
  recordingId: string;
  exportId: string;
  filename: string;
  format: VideoExportFormat;
  targetDocumentId?: string;
  targetSenderUrl?: string;
}

export interface ProjectExportFailedMessage {
  type: typeof VideoMessageType.PROJECT_EXPORT_FAILED;
  jobId: string;
  error: string;
  targetDocumentId?: string;
  targetSenderUrl?: string;
}

export interface ProjectExportCancelledMessage {
  type: typeof VideoMessageType.PROJECT_EXPORT_CANCELLED;
  jobId: string;
  targetDocumentId?: string;
  targetSenderUrl?: string;
}
