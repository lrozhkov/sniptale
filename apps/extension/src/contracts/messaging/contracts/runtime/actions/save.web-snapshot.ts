import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isRecord,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import {
  isWebSnapshotAssetUrl,
  isWebSnapshotAssetUrlArray,
  isWebSnapshotSessionId,
} from './save.web-snapshot.validators.ts';
export {
  WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH,
  WEB_SNAPSHOT_MAX_ASSET_URLS,
  WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH,
} from './save.web-snapshot.validators.ts';

function isWebSnapshotAssetFetchResults(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (item) =>
        isRecord(item) &&
        Object.keys(item).every((key) =>
          ['base64', 'error', 'mimeType', 'success', 'url'].includes(key)
        ) &&
        isBoolean(item['success']) &&
        isWebSnapshotAssetUrl(item['url']) &&
        (item['base64'] === undefined || isString(item['base64'])) &&
        (item['error'] === undefined || isString(item['error'])) &&
        (item['mimeType'] === undefined || isString(item['mimeType']))
    )
  );
}

function isWebSnapshotAssetFetchUrls(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 500 &&
    value.every(isWebSnapshotAssetUrl)
  );
}

export const runtimeActionWebSnapshotSaveMessageContracts = {
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: {
    parseRequest: createGuardParser(
      'runtime REGISTER_WEB_SNAPSHOT_ASSETS message',
      createMessageGuard({
        type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
        required: { assetUrls: isWebSnapshotAssetUrlArray, requestId: isString },
        optional: { snapshotSessionId: isWebSnapshotSessionId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REGISTER_WEB_SNAPSHOT_ASSETS response',
      createRuntimeResponseGuard({ optional: { snapshotSessionId: isWebSnapshotSessionId } })
    ),
  },
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: {
    parseRequest: createGuardParser(
      'runtime FETCH_WEB_SNAPSHOT_ASSET message',
      createMessageGuard({
        type: MessageType.FETCH_WEB_SNAPSHOT_ASSET,
        required: {
          snapshotSessionId: isWebSnapshotSessionId,
          urls: isWebSnapshotAssetFetchUrls,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime FETCH_WEB_SNAPSHOT_ASSET response',
      createRuntimeResponseGuard({ optional: { assets: isWebSnapshotAssetFetchResults } })
    ),
  },
} satisfies PartialRuntimeRegistry;
