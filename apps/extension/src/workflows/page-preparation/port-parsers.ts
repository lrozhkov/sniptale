import { isBoolean, isNumber, isRecord, isString } from '../../contracts/messaging/validators';
import { isExportOptions } from '../../contracts/messaging/validators/export';
import { isQuickActionOverlay } from '../../contracts/messaging/validators/ui';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parsePopupExportControlRequest } from '../../contracts/messaging/parsers/popup-export-control';
import {
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

function parseViewport(value: unknown): { width: number; height: number } | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!isRecord(value) || !isNumber(value['width']) || !isNumber(value['height'])) {
    return undefined;
  }

  return { width: value['width'], height: value['height'] };
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

  if (request['type'] === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT) {
    const requestId = request['requestId'];
    return isString(requestId)
      ? { type: MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT, requestId }
      : null;
  }

  const options = request['options'];
  if (!isExportOptions(options)) {
    return null;
  }

  if (request['type'] === MessageType.EXPORT_POPUP_BUILD_PACKAGE) {
    return { type: MessageType.EXPORT_POPUP_BUILD_PACKAGE, options };
  }

  const requestId = request['requestId'];
  if (request['type'] !== MessageType.EXPORT_POPUP_START || !isString(requestId)) {
    return null;
  }

  return { type: MessageType.EXPORT_POPUP_START, options, requestId };
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

  if (message['type'] === MessageType.SET_VIEWPORT) {
    return viewport === undefined
      ? { type: MessageType.SET_VIEWPORT }
      : { type: MessageType.SET_VIEWPORT, viewport };
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

  return command;
}
