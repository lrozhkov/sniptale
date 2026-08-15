import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNullable,
  isNumber,
  isString,
} from '../../../validators/index';
import { isWebSnapshotManifest } from '../../../../../features/web-snapshot/manifest';
import {
  isExportOptions,
  isPopupExportPackageResponse,
  isPopupExportPreviewResponse,
  isPopupExportJobStatus,
  isPopupExportJobTab,
} from '../../../validators/export';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

const popupTabRouteOperations = new Set<string>([
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
  MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

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

export const runtimeActionExportMessageContracts = {
  [MessageType.START_POPUP_EXPORT_JOB]: {
    parseRequest: createGuardParser(
      'runtime START_POPUP_EXPORT_JOB message',
      createMessageGuard({
        type: MessageType.START_POPUP_EXPORT_JOB,
        required: {
          jobId: isString,
          orderedTabs: (value) => Array.isArray(value) && value.every(isPopupExportJobTab),
          options: isExportOptions,
          warnings: isStringArray,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime START_POPUP_EXPORT_JOB response',
      createRuntimeResponseGuard({ optional: { status: isPopupExportJobStatus } })
    ),
  },
  [MessageType.GET_POPUP_EXPORT_JOB_STATUS]: {
    parseRequest: createGuardParser(
      'runtime GET_POPUP_EXPORT_JOB_STATUS message',
      createMessageGuard({
        type: MessageType.GET_POPUP_EXPORT_JOB_STATUS,
        optional: { jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_POPUP_EXPORT_JOB_STATUS response',
      createRuntimeResponseGuard({
        optional: { status: isNullable(isPopupExportJobStatus) },
      })
    ),
  },
  [MessageType.CANCEL_POPUP_EXPORT_JOB]: {
    parseRequest: createGuardParser(
      'runtime CANCEL_POPUP_EXPORT_JOB message',
      createMessageGuard({
        type: MessageType.CANCEL_POPUP_EXPORT_JOB,
        required: { jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CANCEL_POPUP_EXPORT_JOB response',
      createRuntimeResponseGuard({ optional: { status: isPopupExportJobStatus } })
    ),
  },
  [MessageType.ACK_POPUP_EXPORT_JOB_STATUS]: {
    parseRequest: createGuardParser(
      'runtime ACK_POPUP_EXPORT_JOB_STATUS message',
      createMessageGuard({
        type: MessageType.ACK_POPUP_EXPORT_JOB_STATUS,
        optional: { jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ACK_POPUP_EXPORT_JOB_STATUS response',
      createRuntimeResponseGuard({
        required: { status: isNullable(isPopupExportJobStatus) },
      })
    ),
  },
  [MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED]: {
    parseRequest: createGuardParser(
      'runtime POPUP_EXPORT_JOB_STATUS_UPDATED message',
      createMessageGuard({
        type: MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED,
        required: { status: isPopupExportJobStatus },
      })
    ),
    parseResponse: createGuardParser(
      'runtime POPUP_EXPORT_JOB_STATUS_UPDATED response',
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
      createRuntimeResponseGuard({ required: { page: isNullable(isPopupExportLaunchPage) } })
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
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        required: {
          batchRequestId: isString,
          tabId: isNumber,
          options: isExportOptions,
          ...popupTabRouteCapabilityFields,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_BUILD_PACKAGE response',
      isPopupExportPackageResponse
    ),
  },
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_SAVE_WEB_SNAPSHOT message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
        required: {
          tabId: isNumber,
          requestId: isString,
          ...popupTabRouteCapabilityFields,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_SAVE_WEB_SNAPSHOT response',
      createRuntimeResponseGuard({
        optional: { assetId: isString, manifest: isWebSnapshotManifest, warnings: isStringArray },
      })
    ),
  },
  [MessageType.EXPORT_POPUP_CANCEL]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_CANCEL message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_CANCEL,
        required: {
          exportRunId: isString,
          tabId: isNumber,
          ...popupTabRouteCapabilityFields,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_CANCEL response',
      createRuntimeResponseGuard()
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
