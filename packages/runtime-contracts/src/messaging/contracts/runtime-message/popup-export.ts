import type { MessageType } from '../../message-types';
import type {
  ExportOptions,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
} from '../../../export';
import type { WebSnapshotSaveResult } from '../../../web-snapshot';

export type PopupTabRouteOperation =
  | typeof MessageType.EXPORT_POPUP_PREVIEW
  | typeof MessageType.EXPORT_POPUP_START
  | typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE
  | typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT
  | typeof MessageType.EXPORT_POPUP_CANCEL;

export type PopupTabRouteCapabilityPayload = {
  tabRouteCapabilityToken: string;
  tabRouteRequestId: string;
};

export type RuntimePopupExportRequestByType = {
  [MessageType.EXPORT_POPUP_PREVIEW]: {
    type: typeof MessageType.EXPORT_POPUP_PREVIEW;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.EXPORT_POPUP_START]: {
    type: typeof MessageType.EXPORT_POPUP_START;
    tabId: number;
    requestId: string;
    options: ExportOptions;
  } & PopupTabRouteCapabilityPayload;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
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
    type: typeof MessageType.EXPORT_POPUP_CANCEL;
    tabId: number;
  } & PopupTabRouteCapabilityPayload;
};

export type RuntimePopupExportResponseByType = {
  [MessageType.EXPORT_POPUP_PREVIEW]: PopupExportPreviewResponse;
  [MessageType.EXPORT_POPUP_START]: import('../response').RuntimeAckResponse;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: PopupExportPackageResponse;
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: WebSnapshotSaveResult;
  [MessageType.EXPORT_POPUP_CANCEL]: import('../response').RuntimeAckResponse;
};
