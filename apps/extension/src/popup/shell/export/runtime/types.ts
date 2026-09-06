import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import type { PagePackageJobStatusV1 } from '@sniptale/runtime-contracts/page-package';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { getActiveTabId } from '../../tab-access';
import type {
  RuntimeRequestByType,
  RuntimeResponseByType,
} from '../../../../contracts/messaging/contracts/runtime-message';

type PopupExportPreviewErrorKey =
  | 'popup.export.prepareExportError'
  | 'popup.export.startExportError';
export type PopupExportRuntimeDeps = {
  clearTimeout: (timeoutId: number) => void;
  createRequestId: () => string;
  getActiveTabId: typeof getActiveTabId;
  loadPageCaptureTiming?: () => Promise<
    import('@sniptale/runtime-contracts/page-package').PagePackageCaptureTimingPolicy
  >;
  loadExportResourceLimits?: () => Promise<
    import('@sniptale/runtime-contracts/export').ExportResourceLimits
  >;
  requestPreview: (
    tabId: number,
    fallbackKey: PopupExportPreviewErrorKey
  ) => Promise<PopupExportPreview>;
  scheduleTimeout: (callback: () => void, delayMs: number) => number;
  requestAllUrlsPermission?: () => Promise<boolean>;
  sendStartJobMessage?: (
    message: RuntimeRequestByType[typeof MessageType.START_PAGE_PACKAGE_JOB]
  ) => Promise<RuntimeResponseByType[typeof MessageType.START_PAGE_PACKAGE_JOB]>;
  sendGetJobStatusMessage?: (
    message: RuntimeRequestByType[typeof MessageType.GET_PAGE_PACKAGE_JOB_STATUS]
  ) => Promise<RuntimeResponseByType[typeof MessageType.GET_PAGE_PACKAGE_JOB_STATUS]>;
  sendCancelJobMessage?: (
    message: RuntimeRequestByType[typeof MessageType.CANCEL_PAGE_PACKAGE_JOB]
  ) => Promise<RuntimeResponseByType[typeof MessageType.CANCEL_PAGE_PACKAGE_JOB]>;
  sendAckJobStatusMessage?: (
    message: RuntimeRequestByType[typeof MessageType.ACK_PAGE_PACKAGE_JOB_STATUS]
  ) => Promise<RuntimeResponseByType[typeof MessageType.ACK_PAGE_PACKAGE_JOB_STATUS]>;
  writeClipboardText: (text: string) => Promise<void>;
};

export type { PopupExportRuntimeContract } from './state';

export type PopupExportRuntimeMessage = {
  locale: 'en' | 'ru';
  type: typeof MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED;
  status: PagePackageJobStatusV1;
};
