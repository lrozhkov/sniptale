import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  WebSnapshotSaveToGalleryPayload,
  WebSnapshotStageBlobChunkPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { ExecuteSaveMessage, SaveScreenshotToGalleryMessage } from '../../types';
import type { SaveAssetResponse } from '../../response-types';

type SaveWebSnapshotToGalleryMessage = {
  type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY;
} & WebSnapshotSaveToGalleryPayload;

type RegisterWebSnapshotAssetsMessage = {
  type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS;
  assetUrls: string[];
  requestId: string;
};

type FetchWebSnapshotAssetMessage = {
  type: MessageType.FETCH_WEB_SNAPSHOT_ASSET;
  snapshotSessionId: string;
  url: string;
};

type StageWebSnapshotBlobChunkMessage = {
  type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK;
} & WebSnapshotStageBlobChunkPayload;

type ReleaseWebSnapshotStagedBlobsMessage = {
  snapshotSessionId: string;
  type: MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS;
};

type StageWebSnapshotBlobChunkResponse = RuntimeMessageResponse<{
  complete?: boolean;
  stagedBlobId?: string;
}>;

type RegisterWebSnapshotAssetsResponse = RuntimeMessageResponse<{
  snapshotSessionId?: string;
}>;

type FetchWebSnapshotAssetResponse = RuntimeMessageResponse<{
  base64?: string;
  mimeType?: string;
}>;

export type RuntimeActionSaveRequestByType = {
  [MessageType.EXECUTE_SAVE]: ExecuteSaveMessage;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveScreenshotToGalleryMessage;
  [MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY]: SaveWebSnapshotToGalleryMessage;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsMessage;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetMessage;
  [MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK]: StageWebSnapshotBlobChunkMessage;
  [MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS]: ReleaseWebSnapshotStagedBlobsMessage;
};

export type RuntimeActionSaveResponseByType = {
  [MessageType.EXECUTE_SAVE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveAssetResponse;
  [MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY]: SaveAssetResponse;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsResponse;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetResponse;
  [MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK]: StageWebSnapshotBlobChunkResponse;
  [MessageType.RELEASE_WEB_SNAPSHOT_STAGED_BLOBS]: RuntimeMessageResponse<{ result?: string }>;
};
