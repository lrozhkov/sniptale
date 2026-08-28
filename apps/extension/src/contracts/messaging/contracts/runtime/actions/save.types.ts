import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { ExecuteSaveMessage, SaveScreenshotToGalleryMessage } from '../../types';
import type { SaveAssetResponse } from '../../response-types';

type RegisterWebSnapshotAssetsMessage = {
  type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS;
  assetUrls: string[];
  requestId: string;
  snapshotSessionId?: string;
};

type FetchWebSnapshotAssetMessage = {
  type: MessageType.FETCH_WEB_SNAPSHOT_ASSET;
  snapshotSessionId: string;
  urls: string[];
};

type RegisterWebSnapshotAssetsResponse = RuntimeMessageResponse<{
  snapshotSessionId?: string;
}>;

type FetchWebSnapshotAssetResponse = RuntimeMessageResponse<{
  assets?: Array<{
    base64?: string;
    error?: string;
    mimeType?: string;
    success: boolean;
    url: string;
  }>;
}>;

export type RuntimeActionSaveRequestByType = {
  [MessageType.EXECUTE_SAVE]: ExecuteSaveMessage;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveScreenshotToGalleryMessage;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsMessage;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetMessage;
};

export type RuntimeActionSaveResponseByType = {
  [MessageType.EXECUTE_SAVE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveAssetResponse;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsResponse;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetResponse;
};
