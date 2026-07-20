import type { CaptureActionType } from '../../../../contracts/settings';
import * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { RuntimeMessageRequest } from './types';

const CAPTURE_ACTION_TYPES = new Set<CaptureActionType>([
  'download_default',
  'ask_preset',
  'ask_system',
  'scenario',
  'edit',
  'copy',
]);

const IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);
const TOAST_TYPES = new Set(['info', 'success', 'warning', 'error']);
const AUTO_START_CAPTURE_TYPES = new Set(['visible', 'full']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isViewport(value: unknown): value is { width: number; height: number } {
  return (
    isRecord(value) &&
    typeof value['width'] === 'number' &&
    Number.isFinite(value['width']) &&
    typeof value['height'] === 'number' &&
    Number.isFinite(value['height'])
  );
}

function isQuickActionOverlay(
  value: unknown
): value is NonNullable<RuntimeMessageRequest['quickActionOverlay']> {
  return (
    isRecord(value) &&
    typeof value['afterCapture'] === 'string' &&
    CAPTURE_ACTION_TYPES.has(value['afterCapture'] as CaptureActionType) &&
    typeof value['imageFormat'] === 'string' &&
    IMAGE_FORMATS.has(value['imageFormat']) &&
    typeof value['imageQuality'] === 'number' &&
    Number.isFinite(value['imageQuality']) &&
    typeof value['exitAfterCapture'] === 'boolean' &&
    (value['delaySeconds'] === undefined ||
      (typeof value['delaySeconds'] === 'number' && Number.isFinite(value['delaySeconds'])))
  );
}

function isToastPayload(value: unknown): value is NonNullable<RuntimeMessageRequest['payload']> {
  return (
    isRecord(value) &&
    (value['type'] === undefined ||
      (typeof value['type'] === 'string' && TOAST_TYPES.has(value['type']))) &&
    (value['title'] === undefined || typeof value['title'] === 'string') &&
    (value['message'] === undefined || typeof value['message'] === 'string')
  );
}

function hasValidOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string';
}

function hasValidOptionalNumber(value: unknown) {
  return value === undefined || typeof value === 'number';
}

function hasValidOptionalBoolean(value: unknown) {
  return value === undefined || typeof value === 'boolean';
}

function hasValidOptionalCaptureType(value: unknown) {
  return value === undefined || (typeof value === 'string' && AUTO_START_CAPTURE_TYPES.has(value));
}

function hasValidOptionalMessageStrings(request: Record<string, unknown>): boolean {
  return (
    hasValidOptionalString(request['dataUrl']) &&
    hasValidOptionalString(request['filename']) &&
    hasValidOptionalString(request['recordingId']) &&
    hasValidOptionalString(request['html']) &&
    hasValidOptionalString(request['text'])
  );
}

function hasValidViewport(request: Record<string, unknown>): boolean {
  return (
    request['viewport'] === undefined ||
    request['viewport'] === null ||
    isViewport(request['viewport'])
  );
}

function hasValidQuickActionOverlay(request: Record<string, unknown>): boolean {
  return (
    request['quickActionOverlay'] === undefined ||
    request['quickActionOverlay'] === null ||
    isQuickActionOverlay(request['quickActionOverlay'])
  );
}

function hasValidToastPayload(request: Record<string, unknown>): boolean {
  return (
    request['payload'] === undefined ||
    request['payload'] === null ||
    isToastPayload(request['payload'])
  );
}

function hasValidRuntimeMessageFields(request: Record<string, unknown>): boolean {
  return (
    hasValidViewport(request) &&
    hasValidQuickActionOverlay(request) &&
    hasValidOptionalBoolean(request['autoStartSelection']) &&
    hasValidOptionalCaptureType(request['autoStartCaptureType']) &&
    (request['contentIntentGrant'] === undefined ||
      ContentActionContract.isContentPrivilegedActionAutoStartGrant(
        request['contentIntentGrant']
      )) &&
    hasValidToastPayload(request) &&
    hasValidOptionalNumber(request['seconds']) &&
    hasValidOptionalMessageStrings(request)
  );
}

/**
 * Validates the loose content runtime message shape at the boundary before
 * downstream helpers branch on optional fields.
 */
export function parseRuntimeMessageRequest(request: unknown): RuntimeMessageRequest | null {
  if (!isRecord(request)) {
    return null;
  }

  if (request['type'] !== undefined && typeof request['type'] !== 'string') {
    return null;
  }

  if (!hasValidRuntimeMessageFields(request)) {
    return null;
  }

  return request;
}
