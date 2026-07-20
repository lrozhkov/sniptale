import type {
  RuntimeAckResponse,
  RuntimeMessageResponse,
} from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  RuntimeGetProjectExportCapabilitiesMessage,
  RuntimeAreaSelectedMessage,
  RuntimeDiagnosticEventMessage,
  RuntimeDownloadRecordingMessage,
  RuntimeDownloadRecordingSidecarMessage,
  RuntimeOffscreenGetProjectExportCapabilitiesMessage,
  RuntimeProjectExportCompletedMessage,
  RuntimeProjectExportProgressMessage,
  RuntimeRegionCaptureErrorMessage,
  RuntimeRegionCaptureStartedMessage,
  RuntimeRegionCaptureStoppedMessage,
  RuntimeStartProjectExportMessage,
  RuntimeVideoSavedToIdbMessage,
} from '../contracts/types';
import type {
  DownloadRecordingResponse,
  ProjectExportCapabilitiesResponse,
  StartProjectExportResponse,
} from '../contracts/response-types';
import type { VideoProjectExportSettings } from '../../../features/video/project/types';
import type { ProjectExportInputReference } from '../../video/types/project-export-input';

export type RuntimeProjectExportLifecycleResponse = RuntimeMessageResponse<{ result?: string }>;

export type RuntimeVideoExportRequestByType = {
  [VideoMessageType.START_PROJECT_EXPORT]: RuntimeStartProjectExportMessage;
  [VideoMessageType.CANCEL_PROJECT_EXPORT]: {
    type: typeof VideoMessageType.CANCEL_PROJECT_EXPORT;
    capabilityToken: string;
    jobId: string;
  };
  [VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES]: RuntimeGetProjectExportCapabilitiesMessage;
  [VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT]: {
    type: typeof VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT;
    capabilityToken: string;
    input: ProjectExportInputReference;
    jobId: string;
    settings: VideoProjectExportSettings;
  };
  [VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT]: {
    type: typeof VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT;
    capabilityToken: string;
    jobId: string;
  };
  [VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES]: RuntimeOffscreenGetProjectExportCapabilitiesMessage;
  [VideoMessageType.PROJECT_EXPORT_PROGRESS]: RuntimeProjectExportProgressMessage;
  [VideoMessageType.PROJECT_EXPORT_COMPLETED]: RuntimeProjectExportCompletedMessage;
  [VideoMessageType.PROJECT_EXPORT_FAILED]: {
    type: typeof VideoMessageType.PROJECT_EXPORT_FAILED;
    jobId: string;
    error: string;
    targetDocumentId?: string;
    targetSenderUrl?: string;
  };
  [VideoMessageType.PROJECT_EXPORT_CANCELLED]: {
    type: typeof VideoMessageType.PROJECT_EXPORT_CANCELLED;
    jobId: string;
    targetDocumentId?: string;
    targetSenderUrl?: string;
  };
  [VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS]: RuntimeDiagnosticEventMessage;
  [VideoMessageType.DOWNLOAD_RECORDING_SIDECAR]: RuntimeDownloadRecordingSidecarMessage;
  [VideoMessageType.DOWNLOAD_RECORDING]: RuntimeDownloadRecordingMessage;
  [VideoMessageType.VIDEO_SAVED_TO_IDB]: RuntimeVideoSavedToIdbMessage;
  KEEP_ALIVE: { type: 'KEEP_ALIVE'; tabId?: number };
  AREA_SELECTED: RuntimeAreaSelectedMessage;
  REGION_CAPTURE_STARTED: RuntimeRegionCaptureStartedMessage;
  REGION_CAPTURE_ERROR: RuntimeRegionCaptureErrorMessage;
  REGION_CAPTURE_STOPPED: RuntimeRegionCaptureStoppedMessage;
};

export type RuntimeVideoExportResponseByType = {
  [VideoMessageType.START_PROJECT_EXPORT]: StartProjectExportResponse;
  [VideoMessageType.CANCEL_PROJECT_EXPORT]: StartProjectExportResponse;
  [VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES]: ProjectExportCapabilitiesResponse;
  [VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT]: RuntimeAckResponse;
  [VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES]: ProjectExportCapabilitiesResponse;
  [VideoMessageType.PROJECT_EXPORT_PROGRESS]: RuntimeProjectExportLifecycleResponse;
  [VideoMessageType.PROJECT_EXPORT_COMPLETED]: RuntimeProjectExportLifecycleResponse;
  [VideoMessageType.PROJECT_EXPORT_FAILED]: RuntimeProjectExportLifecycleResponse;
  [VideoMessageType.PROJECT_EXPORT_CANCELLED]: RuntimeProjectExportLifecycleResponse;
  [VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS]: RuntimeAckResponse;
  [VideoMessageType.DOWNLOAD_RECORDING_SIDECAR]: DownloadRecordingResponse;
  [VideoMessageType.DOWNLOAD_RECORDING]: DownloadRecordingResponse;
  [VideoMessageType.VIDEO_SAVED_TO_IDB]: RuntimeAckResponse;
  KEEP_ALIVE: RuntimeAckResponse;
  AREA_SELECTED: RuntimeAckResponse;
  REGION_CAPTURE_STARTED: RuntimeAckResponse;
  REGION_CAPTURE_ERROR: RuntimeAckResponse;
  REGION_CAPTURE_STOPPED: RuntimeAckResponse;
};
