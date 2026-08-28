import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
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
        required: { snapshotSessionId: isWebSnapshotSessionId, url: isWebSnapshotAssetUrl },
      })
    ),
    parseResponse: createGuardParser(
      'runtime FETCH_WEB_SNAPSHOT_ASSET response',
      createRuntimeResponseGuard({ optional: { base64: isString, mimeType: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
