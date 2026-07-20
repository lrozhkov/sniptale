import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import {
  isSaveWebSnapshotToGalleryMessage,
  isStageWebSnapshotBlobChunkMessage,
  isWebSnapshotAssetUrl,
  isWebSnapshotAssetUrlArray,
  isWebSnapshotSessionId,
  isWebSnapshotStagedBlobId,
} from './save.web-snapshot.validators.ts';
export {
  WEB_SNAPSHOT_MAX_ASSET_URL_LENGTH,
  WEB_SNAPSHOT_MAX_ASSET_URLS,
  WEB_SNAPSHOT_MAX_SESSION_ID_LENGTH,
  WEB_SNAPSHOT_MAX_STAGE_CHUNK_BASE64_LENGTH,
} from './save.web-snapshot.validators.ts';

export const runtimeActionWebSnapshotSaveMessageContracts = {
  [MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY]: {
    parseRequest: createGuardParser(
      'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY message',
      isSaveWebSnapshotToGalleryMessage
    ),
    parseResponse: createGuardParser(
      'runtime SAVE_WEB_SNAPSHOT_TO_GALLERY response',
      createRuntimeResponseGuard({ optional: { assetId: isString } })
    ),
  },
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: {
    parseRequest: createGuardParser(
      'runtime REGISTER_WEB_SNAPSHOT_ASSETS message',
      createMessageGuard({
        type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS,
        required: { assetUrls: isWebSnapshotAssetUrlArray, requestId: isString },
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
  [MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK]: {
    parseRequest: createGuardParser(
      'runtime STAGE_WEB_SNAPSHOT_BLOB_CHUNK message',
      isStageWebSnapshotBlobChunkMessage
    ),
    parseResponse: createGuardParser(
      'runtime STAGE_WEB_SNAPSHOT_BLOB_CHUNK response',
      createRuntimeResponseGuard({
        optional: { complete: isBoolean, stagedBlobId: isWebSnapshotStagedBlobId },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
