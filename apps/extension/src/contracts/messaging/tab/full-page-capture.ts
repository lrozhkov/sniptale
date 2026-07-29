import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  FullPageCapturePreferences,
  FullPageCapturePrepareResult,
  FullPageCaptureSessionIdentity,
  FullPageCaptureTileIdentity,
  FullPageCaptureTileState,
} from '../../full-page-capture';

export type TabFullPageCaptureRequestByType = {
  [MessageType.PREPARE_FULL_PAGE_CAPTURE]: FullPageCaptureSessionIdentity & {
    preferences: FullPageCapturePreferences;
    type: typeof MessageType.PREPARE_FULL_PAGE_CAPTURE;
  };
  [MessageType.HEARTBEAT_FULL_PAGE_CAPTURE]: FullPageCaptureSessionIdentity & {
    type: typeof MessageType.HEARTBEAT_FULL_PAGE_CAPTURE;
  };
  [MessageType.PREPARE_FULL_PAGE_TILE]: FullPageCaptureTileIdentity & {
    type: typeof MessageType.PREPARE_FULL_PAGE_TILE;
  };
  [MessageType.VERIFY_FULL_PAGE_TILE]: FullPageCaptureTileIdentity & {
    layoutGeneration: string;
    type: typeof MessageType.VERIFY_FULL_PAGE_TILE;
  };
  [MessageType.RESTORE_FULL_PAGE_CAPTURE]: FullPageCaptureSessionIdentity & {
    type: typeof MessageType.RESTORE_FULL_PAGE_CAPTURE;
  };
};

export type TabFullPageCaptureResponseByType = {
  [MessageType.PREPARE_FULL_PAGE_CAPTURE]: RuntimeMessageResponse<{
    result?: FullPageCapturePrepareResult;
  }>;
  [MessageType.HEARTBEAT_FULL_PAGE_CAPTURE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.PREPARE_FULL_PAGE_TILE]: RuntimeMessageResponse<{
    result?: FullPageCaptureTileState;
  }>;
  [MessageType.VERIFY_FULL_PAGE_TILE]: RuntimeMessageResponse<{
    result?: FullPageCaptureTileState;
  }>;
  [MessageType.RESTORE_FULL_PAGE_CAPTURE]: RuntimeMessageResponse<Record<string, never>>;
};
