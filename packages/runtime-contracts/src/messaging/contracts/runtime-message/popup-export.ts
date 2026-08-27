import type { MessageType } from '../../message-types';
import type {
  ExportOptions,
  ExportProgressStepKey,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
  PopupExportJobStatus,
  PopupExportJobTab,
} from '../../../export';
import type { WebSnapshotSaveResult } from '../../../web-snapshot';

export type PopupTabRouteOperation =
  | typeof MessageType.EXPORT_POPUP_PREVIEW
  | typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | typeof MessageType.EXPORT_POPUP_CANCEL
  | typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT;

export type PopupTabRouteCapabilityPayload = {
  tabRouteCapabilityToken: string;
  tabRouteRequestId: string;
};

export type RuntimePopupExportRequestByType = {
  [MessageType.START_POPUP_EXPORT_JOB]: {
    type: typeof MessageType.START_POPUP_EXPORT_JOB;
    jobId: string;
    orderedTabs: PopupExportJobTab[];
    options: ExportOptions;
    warnings: string[];
  };
  [MessageType.GET_POPUP_EXPORT_JOB_STATUS]: {
    type: typeof MessageType.GET_POPUP_EXPORT_JOB_STATUS;
    jobId?: string;
  };
  [MessageType.CANCEL_POPUP_EXPORT_JOB]: {
    type: typeof MessageType.CANCEL_POPUP_EXPORT_JOB;
    jobId: string;
  };
  [MessageType.ACK_POPUP_EXPORT_JOB_STATUS]: {
    type: typeof MessageType.ACK_POPUP_EXPORT_JOB_STATUS;
    jobId?: string;
  };
  [MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED]: {
    type: typeof MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED;
    status: PopupExportJobStatus;
  };
  [MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED]: {
    type: typeof MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED;
    requestId: string;
    activeStepKey: Extract<
      ExportProgressStepKey,
      'webSnapshotPreview' | 'webSnapshotDom' | 'webSnapshotStyles' | 'webSnapshotAssets'
    >;
    current: number;
    total: number;
  };
  [MessageType.EXPORT_POPUP_PREVIEW]: {
    type: typeof MessageType.EXPORT_POPUP_PREVIEW;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    batchRequestId: string;
    type: typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE;
    tabId: number;
    options: ExportOptions;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: {
    type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT;
    tabId: number;
    requestId: string;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.EXPORT_POPUP_CANCEL]: {
    exportRunId: string;
    type: typeof MessageType.EXPORT_POPUP_CANCEL;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: {
    type: typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
};

export type RuntimePopupExportResponseByType = {
  [MessageType.START_POPUP_EXPORT_JOB]: import('../response').RuntimeMessageResponse<{
    status: PopupExportJobStatus;
  }>;
  [MessageType.GET_POPUP_EXPORT_JOB_STATUS]: import('../response').RuntimeMessageResponse<{
    status: PopupExportJobStatus | null;
  }>;
  [MessageType.CANCEL_POPUP_EXPORT_JOB]: import('../response').RuntimeMessageResponse<{
    status: PopupExportJobStatus;
  }>;
  [MessageType.ACK_POPUP_EXPORT_JOB_STATUS]: import('../response').RuntimeMessageResponse<{
    status: PopupExportJobStatus | null;
  }>;
  [MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED]: import('../response').RuntimeAckResponse;
  [MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED]: import('../response').RuntimeAckResponse;
  [MessageType.EXPORT_POPUP_PREVIEW]: PopupExportPreviewResponse;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: PopupExportPackageResponse;
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: WebSnapshotSaveResult;
  [MessageType.EXPORT_POPUP_CANCEL]: import('../response').RuntimeAckResponse;
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: import('../response').RuntimeMessageResponse<{
    page: 'export' | null;
  }>;
};
