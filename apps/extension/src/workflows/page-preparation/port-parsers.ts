import { isBoolean, isNumber, isRecord, isString } from '../../contracts/messaging/validators';
import { isExportOptions } from '../../contracts/messaging/validators/export';
import { isQuickActionOverlay } from '../../contracts/messaging/validators/ui';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parsePopupExportControlRequest } from '../../contracts/messaging/parsers/popup-export-control';
import { isContentPrivilegedActionAutoStartGrant } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  PREPARATION_SURFACE_RESIZE,
  WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
  WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
  type ViewerExportPortRequest,
  type ViewerExportPortResponse,
  type ViewerPopupExportMessage,
  type ViewerPreparationCommand,
  type ViewerPreparationPortRequest,
  type ViewerPreparationPortResponse,
} from './contracts';

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function parseViewport(
  value: unknown
): { presetId: string; target: 'window'; width: number; height: number } | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    !isString(value['presetId']) ||
    value['target'] !== 'window' ||
    !isNumber(value['width']) ||
    !isNumber(value['height'])
  ) {
    return undefined;
  }

  return {
    presetId: value['presetId'],
    target: value['target'],
    width: value['width'],
    height: value['height'],
  };
}

function isCaptureType(value: unknown): value is 'visible' | 'full' {
  return value === 'visible' || value === 'full';
}

function isViewerExportResponsePayload(
  value: unknown
): value is ViewerExportPortResponse['response'] {
  return value === undefined || isRecord(value);
}

function parsePopupExportRequest(request: unknown): ViewerPopupExportMessage | null {
  if (!isRecord(request)) {
    return null;
  }

  const controlRequest = parsePopupExportControlRequest(request);
  if (controlRequest) {
    return controlRequest;
  }

  const options = request['options'];
  if (!isExportOptions(options)) {
    return null;
  }

  if (request['type'] === MessageType.EXPORT_POPUP_BUILD_PACKAGE) {
    const batchRequestId = request['batchRequestId'];
    const includeWebCopy = request['includeWebCopy'];
    const intent = request['intent'];
    const ordinal = request['ordinal'];
    const hasAnonymousPolicy = hasOwn(request, 'allowAnonymousCrossOriginAssets');
    const hasAuthenticatedPolicy = hasOwn(request, 'allowAuthenticatedSameOriginAssets');
    if (
      !isString(batchRequestId) ||
      typeof includeWebCopy !== 'boolean' ||
      (intent !== 'export' && intent !== 'save') ||
      !Number.isSafeInteger(ordinal) ||
      (ordinal as number) < 0 ||
      (includeWebCopy
        ? typeof request['allowAnonymousCrossOriginAssets'] !== 'boolean' ||
          typeof request['allowAuthenticatedSameOriginAssets'] !== 'boolean'
        : hasAnonymousPolicy || hasAuthenticatedPolicy)
    ) {
      return null;
    }
    const admittedIntent = intent as 'export' | 'save';
    const common = {
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE,
      batchRequestId,
      ...(isContentPrivilegedActionAutoStartGrant(request['contentIntentGrant'])
        ? { contentIntentGrant: request['contentIntentGrant'] }
        : {}),
      ...(request['fullPageCaptureAction'] === MessageType.EXPORT_CAPTURE_FULL_PAGE
        ? { fullPageCaptureAction: request['fullPageCaptureAction'] }
        : {}),
      intent: admittedIntent,
      ordinal: ordinal as number,
      options,
    };
    return includeWebCopy
      ? {
          ...common,
          allowAnonymousCrossOriginAssets: request['allowAnonymousCrossOriginAssets'] as boolean,
          allowAuthenticatedSameOriginAssets: request[
            'allowAuthenticatedSameOriginAssets'
          ] as boolean,
          includeWebCopy: true,
        }
      : { ...common, includeWebCopy: false };
  }

  return null;
}

export function parseViewerExportPortRequest(message: unknown): ViewerExportPortRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST ||
    !isString(message['requestId']) ||
    !isString(message['viewerPortGeneration'])
  ) {
    return null;
  }

  const request = parsePopupExportRequest(message['request']);
  if (!request) {
    return null;
  }

  return {
    type: WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST,
    requestId: message['requestId'],
    viewerPortGeneration: message['viewerPortGeneration'],
    request,
  };
}

export function parseViewerExportPortResponse(
  message: unknown,
  requestId: string
): ViewerExportPortResponse | null {
  if (
    !isRecord(message) ||
    message['type'] !== WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE ||
    message['requestId'] !== requestId ||
    !isString(message['viewerPortGeneration'])
  ) {
    return null;
  }

  const response = message['response'];
  if (!isViewerExportResponsePayload(response)) {
    return null;
  }

  if (!hasOwn(message, 'response') || response === undefined) {
    return {
      type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
      requestId,
      viewerPortGeneration: message['viewerPortGeneration'],
    };
  }

  return {
    type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
    requestId,
    viewerPortGeneration: message['viewerPortGeneration'],
    response,
  };
}

export function parseViewerPreparationPortRequest(
  message: unknown
): ViewerPreparationPortRequest | null {
  if (
    !isRecord(message) ||
    message['type'] !== WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST ||
    !isString(message['requestId']) ||
    !isString(message['viewerPortGeneration'])
  ) {
    return null;
  }

  const command = parseViewerPreparationCommand(message['command']);
  if (!command) {
    return null;
  }

  return {
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST,
    command,
    requestId: message['requestId'],
    viewerPortGeneration: message['viewerPortGeneration'],
  };
}

export function parseViewerPreparationPortResponse(
  message: unknown,
  requestId: string
): ViewerPreparationPortResponse | null {
  if (
    !isRecord(message) ||
    message['type'] !== WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE ||
    message['requestId'] !== requestId ||
    !isBoolean(message['success']) ||
    !isString(message['viewerPortGeneration'])
  ) {
    return null;
  }

  const error = message['error'];
  if (error !== undefined && !isString(error)) {
    return null;
  }

  return {
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
    ...(error === undefined ? {} : { error }),
    requestId,
    success: message['success'],
    viewerPortGeneration: message['viewerPortGeneration'],
  };
}

export function parseViewerPreparationCommand(message: unknown): ViewerPreparationCommand | null {
  if (!isRecord(message)) {
    return null;
  }

  if (message['type'] === MessageType.DISABLE_SCREENSHOT_MODE) {
    return { type: MessageType.DISABLE_SCREENSHOT_MODE };
  }

  const viewport = parseViewport(message['viewport']);
  if (hasOwn(message, 'viewport') && viewport === undefined) {
    return null;
  }

  if (message['type'] === PREPARATION_SURFACE_RESIZE) {
    return viewport === undefined
      ? { type: PREPARATION_SURFACE_RESIZE }
      : { type: PREPARATION_SURFACE_RESIZE, viewport };
  }

  if (message['type'] !== MessageType.ENABLE_SCREENSHOT_MODE) {
    return null;
  }

  const command: ViewerPreparationCommand = { type: MessageType.ENABLE_SCREENSHOT_MODE };
  if (viewport !== undefined) {
    command.viewport = viewport;
  }
  if (hasOwn(message, 'autoStartCaptureType')) {
    if (!isCaptureType(message['autoStartCaptureType'])) {
      return null;
    }
    command.autoStartCaptureType = message['autoStartCaptureType'];
  }
  if (hasOwn(message, 'autoStartSelection')) {
    if (!isBoolean(message['autoStartSelection'])) {
      return null;
    }
    command.autoStartSelection = message['autoStartSelection'];
  }
  if (hasOwn(message, 'quickActionOverlay')) {
    if (!isQuickActionOverlay(message['quickActionOverlay'])) {
      return null;
    }
    command.quickActionOverlay = message['quickActionOverlay'];
  }
  if (hasOwn(message, 'toolbarVisible')) {
    if (!isBoolean(message['toolbarVisible'])) {
      return null;
    }
    command.toolbarVisible = message['toolbarVisible'];
  }
  if (hasOwn(message, 'surfaceCapabilityToken')) {
    if (typeof message['surfaceCapabilityToken'] !== 'string') return null;
    command.surfaceCapabilityToken = message['surfaceCapabilityToken'];
  }
  if (hasOwn(message, 'surfaceWarning')) {
    if (typeof message['surfaceWarning'] !== 'string') return null;
    command.surfaceWarning = message['surfaceWarning'];
  }

  return command;
}
