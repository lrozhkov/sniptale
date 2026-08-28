import type { MessageType } from '../../message-types';
import type {
  ExportOptions,
  ExportProgressStepKey,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
} from '../../../export';
import type { PagePackageJobStatusV1, PagePackageJobTab } from '../../../page-package';

export type PopupTabRouteOperation =
  | typeof MessageType.EXPORT_POPUP_PREVIEW
  | typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT;

export type PopupTabRouteCapabilityPayload = {
  tabRouteCapabilityToken: string;
  tabRouteRequestId: string;
};

type PopupExportBuildPackageResourcePolicy =
  | {
      allowAnonymousCrossOriginAssets: boolean;
      allowAuthenticatedSameOriginAssets: boolean;
      includeWebCopy: true;
    }
  | {
      allowAnonymousCrossOriginAssets?: never;
      allowAuthenticatedSameOriginAssets?: never;
      includeWebCopy: false;
    };

export type RuntimePopupExportRequestByType = {
  [MessageType.START_PAGE_PACKAGE_JOB]: {
    type: typeof MessageType.START_PAGE_PACKAGE_JOB;
    includeWebCopy: boolean;
    intent: 'export' | 'save';
    jobId: string;
    orderedTabs: PagePackageJobTab[];
    options: ExportOptions;
    warnings: string[];
  };
  [MessageType.GET_PAGE_PACKAGE_JOB_STATUS]: {
    type: typeof MessageType.GET_PAGE_PACKAGE_JOB_STATUS;
    jobId?: string;
  };
  [MessageType.CANCEL_PAGE_PACKAGE_JOB]: {
    type: typeof MessageType.CANCEL_PAGE_PACKAGE_JOB;
    jobId: string;
  };
  [MessageType.ACK_PAGE_PACKAGE_JOB_STATUS]: {
    type: typeof MessageType.ACK_PAGE_PACKAGE_JOB_STATUS;
    jobId?: string;
  };
  [MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED]: {
    type: typeof MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED;
    status: PagePackageJobStatusV1;
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
    intent: 'export' | 'save';
    ordinal: number;
    type: typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE;
    tabId: number;
    options: ExportOptions;
  } & PopupExportBuildPackageResourcePolicy &
    PopupTabRouteCapabilityPayload;
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: {
    type: typeof MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
};

export type RuntimePopupExportResponseByType = {
  [MessageType.START_PAGE_PACKAGE_JOB]: import('../response').RuntimeMessageResponse<{
    status: PagePackageJobStatusV1;
  }>;
  [MessageType.GET_PAGE_PACKAGE_JOB_STATUS]: import('../response').RuntimeMessageResponse<{
    status: PagePackageJobStatusV1 | null;
  }>;
  [MessageType.CANCEL_PAGE_PACKAGE_JOB]: import('../response').RuntimeMessageResponse<{
    status: PagePackageJobStatusV1;
  }>;
  [MessageType.ACK_PAGE_PACKAGE_JOB_STATUS]: import('../response').RuntimeMessageResponse<{
    status: PagePackageJobStatusV1 | null;
  }>;
  [MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED]: import('../response').RuntimeAckResponse;
  [MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED]: import('../response').RuntimeAckResponse;
  [MessageType.EXPORT_POPUP_PREVIEW]: PopupExportPreviewResponse;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: PopupExportPackageResponse;
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: import('../response').RuntimeMessageResponse<{
    page: 'export' | null;
  }>;
};
