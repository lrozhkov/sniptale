import type { PopupExportPreview, PopupExportJobStatus } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { getActiveTabId } from '../../tab-access';
import type {
  RuntimeRequestByType,
  RuntimeResponseByType,
} from '../../../../contracts/messaging/contracts/runtime-message';
import type { TabResponseByType } from '../../../../contracts/messaging/tab';

type PopupExportPreviewErrorKey =
  | 'popup.export.prepareExportError'
  | 'popup.export.startExportError';
type PopupExportSaveWebSnapshotMessage = Omit<
  RuntimeRequestByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT],
  'tabId' | 'tabRouteCapabilityToken' | 'tabRouteRequestId'
>;

export type PopupExportRuntimeDeps = {
  clearTimeout: (timeoutId: number) => void;
  createRequestId: () => string;
  getActiveTabId: typeof getActiveTabId;
  requestPreview: (
    tabId: number,
    fallbackKey: PopupExportPreviewErrorKey
  ) => Promise<PopupExportPreview>;
  scheduleTimeout: (callback: () => void, delayMs: number) => number;
  sendSaveWebSnapshotMessage?: (
    tabId: number,
    message: PopupExportSaveWebSnapshotMessage
  ) => Promise<TabResponseByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]>;
  requestAllUrlsPermission?: () => Promise<boolean>;
  sendStartJobMessage?: (
    message: RuntimeRequestByType[typeof MessageType.START_POPUP_EXPORT_JOB]
  ) => Promise<RuntimeResponseByType[typeof MessageType.START_POPUP_EXPORT_JOB]>;
  sendGetJobStatusMessage?: (
    message: RuntimeRequestByType[typeof MessageType.GET_POPUP_EXPORT_JOB_STATUS]
  ) => Promise<RuntimeResponseByType[typeof MessageType.GET_POPUP_EXPORT_JOB_STATUS]>;
  sendCancelJobMessage?: (
    message: RuntimeRequestByType[typeof MessageType.CANCEL_POPUP_EXPORT_JOB]
  ) => Promise<RuntimeResponseByType[typeof MessageType.CANCEL_POPUP_EXPORT_JOB]>;
  writeClipboardText: (text: string) => Promise<void>;
};

export type { PopupExportRuntimeContract } from './state';

export type PopupExportRuntimeMessage = {
  type: typeof MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED;
  status: PopupExportJobStatus;
};
