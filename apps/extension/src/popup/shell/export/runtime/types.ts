import type {
  ExportProgress,
  ExportPagePackage,
  PopupExportPreview,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { getActiveTabId } from '../../tab-access';
import type { RuntimeRequestByType } from '../../../../contracts/messaging/contracts/runtime-message';
import type { TabRequestByType, TabResponseByType } from '../../../../contracts/messaging/tab';

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
  saveArchiveBlob: (blob: Blob, filename: string) => Promise<void>;
  scheduleTimeout: (callback: () => void, delayMs: number) => number;
  sendBuildPackageMessage: (
    tabId: number,
    message: TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
  ) => Promise<TabResponseByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]>;
  sendSaveWebSnapshotMessage?: (
    tabId: number,
    message: PopupExportSaveWebSnapshotMessage
  ) => Promise<TabResponseByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]>;
  sendCancelMessage: (
    tabId: number
  ) => Promise<TabResponseByType[typeof MessageType.EXPORT_POPUP_CANCEL]>;
  sendStartMessage: (
    tabId: number,
    message: TabRequestByType[typeof MessageType.EXPORT_POPUP_START]
  ) => Promise<TabResponseByType[typeof MessageType.EXPORT_POPUP_START]>;
  writeClipboardText: (text: string) => Promise<void>;
};

export type PopupExportBatchPackage = {
  pagePackage: ExportPagePackage;
  tabId: number;
  tabTitle: string;
};

export type { PopupExportRuntimeContract } from './state';

export type PopupExportRuntimeMessage =
  | {
      type: typeof MessageType.EXPORT_POPUP_PROGRESS;
      requestId: string;
      progress: ExportProgress;
    }
  | { type: typeof MessageType.EXPORT_POPUP_RESULT; requestId: string; result: PopupExportResult };
