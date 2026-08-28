import { isString } from '../../../validators/index';

export const WEB_SNAPSHOT_MAX_ASSET_URLS = 2000;
export const WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH = 4096;
export const WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH = 128;
const WEB_SNAPSHOT_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isWebSnapshotSessionId(value: unknown): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH &&
    WEB_SNAPSHOT_SESSION_ID_PATTERN.test(value)
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
