import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  WebSnapshotSaveToGalleryPayload,
  WebSnapshotStageBlobChunkPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { isWebSnapshotManifest } from '../../../../../features/web-snapshot/manifest';
import { isNumber, isRecord, isString } from '../../../validators/index';

export const WEB_SNAPSHOT_MAX_ASSET_URLS = 2000;
export const WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH = 4096;
export const WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH = 128;
export const WEB_SNAPSHOT_MAX_STAGE_CHUNK_BASE64_LENGTH = 768 * 1024;

const WEB_SNAPSHOT_MAX_STAGED_BLOB_ID_LENGTH = 128;
const WEB_SNAPSHOT_MAX_STAGE_CHUNKS = 256;
const WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BASE64_PATTERN = /^[+/=0-9A-Za-z]+$/;
const WEB_SNAPSHOT_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const WEB_SNAPSHOT_STAGED_BLOB_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isBoundedBase64Length(maxLength: number) {
  return (value: unknown): value is string =>
    isString(value) && value.length > 0 && value.length <= maxLength && BASE64_PATTERN.test(value);
}

function isWebSnapshotScreenshotMimeType(value: unknown): value is string {
  return isString(value) && WEB_SNAPSHOT_SCREENSHOT_MIME_TYPES.has(value.toLowerCase());
}

export function isWebSnapshotSessionId(value: unknown): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH &&
    WEB_SNAPSHOT_SESSION_ID_PATTERN.test(value)
  );
}

export function isWebSnapshotStagedBlobId(value: unknown): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= WEB_SNAPSHOT_MAX_STAGED_BLOB_ID_LENGTH &&
    WEB_SNAPSHOT_STAGED_BLOB_ID_PATTERN.test(value)
  );
}

function isWebSnapshotBlobKind(value: unknown): value is 'package' | 'screenshot' {
  return value === 'package' || value === 'screenshot';
}

function isStageChunkIndex(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < WEB_SNAPSHOT_MAX_STAGE_CHUNKS
  );
}

function isStageTotalChunks(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= WEB_SNAPSHOT_MAX_STAGE_CHUNKS
  );
}

function hasOnlyAllowedFields(input: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowedFields = new Set(fields);
  return Object.keys(input).every((key) => allowedFields.has(key));
}

export function isSaveWebSnapshotToGalleryMessage(input: unknown): input is {
  type: typeof MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY;
} & WebSnapshotSaveToGalleryPayload {
  if (!isRecord(input) || input['type'] !== MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY) {
    return false;
  }

  return (
    hasOnlyAllowedFields(input, [
      'manifest',
      'packageStagedBlobId',
      'screenshotMimeType',
      'screenshotStagedBlobId',
      'snapshotSessionId',
      'type',
    ]) &&
    isWebSnapshotManifest(input['manifest']) &&
    isWebSnapshotStagedBlobId(input['packageStagedBlobId']) &&
    isWebSnapshotStagedBlobId(input['screenshotStagedBlobId']) &&
    isWebSnapshotScreenshotMimeType(input['screenshotMimeType']) &&
    isWebSnapshotSessionId(input['snapshotSessionId'])
  );
}

export function isStageWebSnapshotBlobChunkMessage(input: unknown): input is {
  type: typeof MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK;
} & WebSnapshotStageBlobChunkPayload {
  if (!isRecord(input) || input['type'] !== MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK) {
    return false;
  }

  return (
    hasOnlyAllowedFields(input, [
      'base64',
      'blobKind',
      'chunkIndex',
      'snapshotSessionId',
      'stagedBlobId',
      'totalBytes',
      'totalChunks',
      'type',
    ]) &&
    isBoundedBase64Length(WEB_SNAPSHOT_MAX_STAGE_CHUNK_BASE64_LENGTH)(input['base64']) &&
    isWebSnapshotBlobKind(input['blobKind']) &&
    isStageChunkIndex(input['chunkIndex']) &&
    isStageTotalChunks(input['totalChunks']) &&
    input['chunkIndex'] < input['totalChunks'] &&
    isNumber(input['totalBytes']) &&
    Number.isInteger(input['totalBytes']) &&
    input['totalBytes'] >= 0 &&
    isWebSnapshotSessionId(input['snapshotSessionId']) &&
    isWebSnapshotStagedBlobId(input['stagedBlobId'])
  );
}

export function isWebSnapshotAssetUrl(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH;
}

export function isWebSnapshotAssetUrlArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= WEB_SNAPSHOT_MAX_ASSET_URLS &&
    value.every(isWebSnapshotAssetUrl)
  );
}
