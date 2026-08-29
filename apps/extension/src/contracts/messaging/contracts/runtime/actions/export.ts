import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNullable,
  isNumber,
  isString,
} from '../../../validators/index';
import {
  isExportOptions,
  isPopupExportJobId,
  isPopupExportPackageResponse,
  isPopupExportPreviewResponse,
  isPagePackageJobStatus,
  isPagePackageCaptureSources,
  isPagePackageCaptureTiming,
  isPopupExportJobWarnings,
} from '../../../validators/export';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import type { RuntimePopupExportRequestByType } from '@sniptale/runtime-contracts/messaging/contracts/runtime-message/popup-export';

const popupTabRouteOperations = new Set<string>([
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
]);

function isPopupTabRouteOperation(value: unknown): value is string {
  return typeof value === 'string' && popupTabRouteOperations.has(value);
}

function isPopupExportLaunchPage(value: unknown): value is 'export' {
  return value === 'export';
}

const popupTabRouteCapabilityFields = {
  tabRouteCapabilityToken: isString,
  tabRouteRequestId: isString,
};

const isRuntimePopupExportBuildPackageBase = createMessageGuard<
  typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  RuntimePopupExportRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
>({
  type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  required: {
    includeWebCopy: (value) => typeof value === 'boolean',
    intent: (value) => value === 'export' || value === 'save',
    batchRequestId: isString,
    ordinal: (value) => isNumber(value) && Number.isSafeInteger(value) && value >= 0,
    tabId: isNumber,
    options: isExportOptions,
    ...popupTabRouteCapabilityFields,
  },
  optional: {
    allowAnonymousCrossOriginAssets: (value) => typeof value === 'boolean',
    allowAuthenticatedSameOriginAssets: (value) => typeof value === 'boolean',
  },
});

function isRuntimePopupExportBuildPackageRequest(
  value: unknown
): value is RuntimePopupExportRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE] {
  if (!isRuntimePopupExportBuildPackageBase(value)) return false;
  const hasAnonymousPolicy = Object.prototype.hasOwnProperty.call(
    value,
    'allowAnonymousCrossOriginAssets'
  );
  const hasAuthenticatedPolicy = Object.prototype.hasOwnProperty.call(
    value,
    'allowAuthenticatedSameOriginAssets'
  );
  return value.includeWebCopy
    ? hasAnonymousPolicy && hasAuthenticatedPolicy
    : !hasAnonymousPolicy && !hasAuthenticatedPolicy;
}

export const runtimeActionExportMessageContracts = {
  [MessageType.START_PAGE_PACKAGE_JOB]: {
    parseRequest: createGuardParser(
      'runtime START_PAGE_PACKAGE_JOB message',
      createMessageGuard({
        type: MessageType.START_PAGE_PACKAGE_JOB,
        required: {
          includeWebCopy: (value) => typeof value === 'boolean',
          intent: (value) => value === 'export' || value === 'save',
          jobId: isPopupExportJobId,
          captureTiming: isPagePackageCaptureTiming,
          sources: isPagePackageCaptureSources,
          options: isExportOptions,
          warnings: isPopupExportJobWarnings,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime START_PAGE_PACKAGE_JOB response',
      createRuntimeResponseGuard({
        optional: { status: isPagePackageJobStatus },
      })
    ),
  },
  [MessageType.GET_PAGE_PACKAGE_JOB_STATUS]: {
    parseRequest: createGuardParser(
      'runtime GET_PAGE_PACKAGE_JOB_STATUS message',
      createMessageGuard({
        type: MessageType.GET_PAGE_PACKAGE_JOB_STATUS,
        optional: { jobId: isPopupExportJobId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_PAGE_PACKAGE_JOB_STATUS response',
      createRuntimeResponseGuard({
        optional: { status: isNullable(isPagePackageJobStatus) },
      })
    ),
  },
  [MessageType.CANCEL_PAGE_PACKAGE_JOB]: {
    parseRequest: createGuardParser(
      'runtime CANCEL_PAGE_PACKAGE_JOB message',
      createMessageGuard({
        type: MessageType.CANCEL_PAGE_PACKAGE_JOB,
        required: { jobId: isPopupExportJobId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CANCEL_PAGE_PACKAGE_JOB response',
      createRuntimeResponseGuard({
        optional: { status: isPagePackageJobStatus },
      })
    ),
  },
  [MessageType.ACK_PAGE_PACKAGE_JOB_STATUS]: {
    parseRequest: createGuardParser(
      'runtime ACK_PAGE_PACKAGE_JOB_STATUS message',
      createMessageGuard({
        type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS,
        optional: { jobId: isPopupExportJobId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ACK_PAGE_PACKAGE_JOB_STATUS response',
      createRuntimeResponseGuard({
        required: { status: isNullable(isPagePackageJobStatus) },
      })
    ),
  },
  [MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED]: {
    parseRequest: createGuardParser(
      'runtime PAGE_PACKAGE_JOB_STATUS_UPDATED message',
      createMessageGuard({
        type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
        required: { status: isPagePackageJobStatus },
      })
    ),
    parseResponse: createGuardParser(
      'runtime PAGE_PACKAGE_JOB_STATUS_UPDATED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED]: {
    parseRequest: createGuardParser(
      'runtime WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED message',
      createMessageGuard({
        type: MessageType.WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED,
        required: {
          requestId: isString,
          activeStepKey: (value) =>
            value === 'annotations' ||
            value === 'basicLogs' ||
            value === 'cssDiagnostics' ||
            value === 'files' ||
            value === 'fullPageScreenshot' ||
            value === 'images' ||
            value === 'json' ||
            value === 'markdown' ||
            value === 'pageDiagnostics' ||
            value === 'webSnapshotAssets' ||
            value === 'webSnapshotDom' ||
            value === 'webSnapshotPreview' ||
            value === 'webSnapshotStyles' ||
            value === 'webSnapshotWarnings',
          current: (value) => isNumber(value) && Number.isSafeInteger(value) && value >= 0,
          total: (value) => isNumber(value) && Number.isSafeInteger(value) && value > 0,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime WEB_SNAPSHOT_SAVE_PROGRESS_UPDATED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT]: {
    parseRequest: createGuardParser(
      'runtime CONSUME_POPUP_EXPORT_LAUNCH_INTENT message',
      createMessageGuard({
        type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
        required: { tabId: isNumber, ...popupTabRouteCapabilityFields },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CONSUME_POPUP_EXPORT_LAUNCH_INTENT response',
      createRuntimeResponseGuard({
        required: { page: isNullable(isPopupExportLaunchPage) },
      })
    ),
  },
  [MessageType.EXPORT_POPUP_PREVIEW]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_PREVIEW message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_PREVIEW,
        required: { tabId: isNumber, ...popupTabRouteCapabilityFields },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_PREVIEW response',
      isPopupExportPreviewResponse
    ),
  },
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_BUILD_PACKAGE message',
      isRuntimePopupExportBuildPackageRequest
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_BUILD_PACKAGE response',
      isPopupExportPackageResponse
    ),
  },
  [MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_POPUP_TAB_ROUTE_CAPABILITY message',
      createMessageGuard({
        type: MessageType.REQUEST_POPUP_TAB_ROUTE_CAPABILITY,
        required: {
          tabId: isNumber,
          operation: isPopupTabRouteOperation,
          requestId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_POPUP_TAB_ROUTE_CAPABILITY response',
      createRuntimeResponseGuard({ optional: { capabilityToken: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
