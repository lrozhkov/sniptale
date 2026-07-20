import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isNumber,
  isString,
} from '../../../validators/index';
import { isWebSnapshotManifest } from '../../../../../features/web-snapshot/manifest';
import {
  isExportOptions,
  isExportProgress,
  isPopupExportPackageResponse,
  isPopupExportPreviewResponse,
  isPopupExportResult,
} from '../../../validators/export';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

const popupTabRouteOperations = new Set<string>([
  MessageType.EXPORT_POPUP_PREVIEW,
  MessageType.EXPORT_POPUP_START,
  MessageType.EXPORT_POPUP_BUILD_PACKAGE,
  MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT,
  MessageType.EXPORT_POPUP_CANCEL,
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPopupTabRouteOperation(value: unknown): value is string {
  return typeof value === 'string' && popupTabRouteOperations.has(value);
}

function isHarCapturePayload(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const popupTabRouteCapabilityFields = {
  tabRouteCapabilityToken: isString,
  tabRouteRequestId: isString,
};

export const runtimeActionExportMessageContracts = {
  [MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_EXPORT_HAR_START_CAPABILITY message',
      createMessageGuard({
        type: MessageType.REQUEST_EXPORT_HAR_START_CAPABILITY,
        required: { sessionId: isString },
        optional: { rawDiagnosticsEnabled: isBoolean },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_EXPORT_HAR_START_CAPABILITY response',
      createRuntimeResponseGuard({ optional: { capabilityToken: isString } })
    ),
  },
  [MessageType.EXPORT_START_HAR]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_START_HAR message',
      createMessageGuard({
        type: MessageType.EXPORT_START_HAR,
        required: { capabilityToken: isString, sessionId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_START_HAR response',
      createRuntimeResponseGuard({
        optional: { capabilityToken: isString, expiresAtEpochMs: isNumber, result: isString },
      })
    ),
  },
  [MessageType.EXPORT_STOP_HAR]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_STOP_HAR message',
      createMessageGuard({
        type: MessageType.EXPORT_STOP_HAR,
        required: { capabilityToken: isString, sessionId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_STOP_HAR response',
      createRuntimeResponseGuard({
        optional: { har: isHarCapturePayload, rawDiagnosticsEnabled: isBoolean },
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
  [MessageType.EXPORT_POPUP_START]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_START message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_START,
        required: {
          tabId: isNumber,
          requestId: isString,
          options: isExportOptions,
          ...popupTabRouteCapabilityFields,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_START response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_BUILD_PACKAGE message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
        required: { tabId: isNumber, options: isExportOptions, ...popupTabRouteCapabilityFields },
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
        required: { tabId: isNumber, ...popupTabRouteCapabilityFields },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_CANCEL response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.EXPORT_POPUP_PROGRESS]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_PROGRESS message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_PROGRESS,
        required: { requestId: isString, progress: isExportProgress },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_PROGRESS response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [MessageType.EXPORT_POPUP_RESULT]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_RESULT message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_RESULT,
        required: { requestId: isString, result: isPopupExportResult },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_RESULT response',
      createRuntimeResponseGuard({ allowUndefined: true })
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
