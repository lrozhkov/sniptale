import {
  isScenarioCaptureMetadata,
  isScenarioCaptureSourceKind,
  isScenarioCaptureSurface,
  isScenarioPageDescriptor,
  isScenarioPoint,
  isScenarioRecorderSurfaceState,
  isScenarioSessionState,
  isScenarioTargetDescriptor,
} from '../../../../contracts/messaging/scenario/validators';
import { isRecord, isString } from '../../../../contracts/messaging/validators';
import type { PendingScenarioCapture } from './contracts';

function parseOptionalPoint(value: unknown) {
  return value === null || value === undefined ? null : isScenarioPoint(value) ? value : undefined;
}

function parseOptionalTarget(value: unknown) {
  return value === null || value === undefined
    ? null
    : isScenarioTargetDescriptor(value)
      ? value
      : undefined;
}

function parseOptionalCaptureMetadata(value: unknown) {
  return value === undefined ? undefined : isScenarioCaptureMetadata(value) ? value : null;
}

/**
 * Parses a persisted pending-capture payload from session storage.
 */
export function parseStoredPendingScenarioCapture(value: unknown): PendingScenarioCapture | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isString(value['id']) ||
    !isString(value['pendingAssetId']) ||
    !isString(value['filename']) ||
    !isScenarioCaptureSurface(value['captureSurface']) ||
    !isScenarioCaptureSourceKind(value['sourceKind']) ||
    !isScenarioPageDescriptor(value['page'])
  ) {
    return null;
  }

  const target = parseOptionalTarget(value['target']);
  const interactionPoint = parseOptionalPoint(value['interactionPoint']);
  const cursorPoint = parseOptionalPoint(value['cursorPoint']);
  const captureMetadata = parseOptionalCaptureMetadata(value['captureMetadata']);
  const galleryAssetId = value['galleryAssetId'];

  if (
    target === undefined ||
    interactionPoint === undefined ||
    cursorPoint === undefined ||
    captureMetadata === null
  ) {
    return null;
  }

  return {
    id: value['id'],
    pendingAssetId: value['pendingAssetId'],
    filename: value['filename'],
    galleryAssetId: galleryAssetId === null || isString(galleryAssetId) ? galleryAssetId : null,
    captureSurface: value['captureSurface'],
    sourceKind: value['sourceKind'],
    page: value['page'],
    target,
    interactionPoint,
    cursorPoint,
    ...(captureMetadata !== undefined ? { captureMetadata } : {}),
    title: isString(value['title']) ? value['title'] : '',
    body: isString(value['body']) ? value['body'] : '',
  };
}

/**
 * Parses a stored scenario session state from session storage.
 */
export function parseStoredScenarioSessionState(value: unknown) {
  return isScenarioSessionState(value) ? value : null;
}

/**
 * Parses a stored scenario recorder surface state from session storage.
 */
export function parseStoredScenarioSurfaceState(value: unknown) {
  return isScenarioRecorderSurfaceState(value) ? value : null;
}
