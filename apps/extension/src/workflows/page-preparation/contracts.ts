import type { TabRequestByType, TabResponseByType } from '../../contracts/messaging/tab';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';
import type { QuickActionOverlay } from '../../contracts/settings';

export const WEB_SNAPSHOT_VIEWER_PORT = 'sniptale:web-snapshot-viewer';
export const WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST = 'sniptale:web-snapshot-viewer-export-request';
export const WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE = 'sniptale:web-snapshot-viewer-export-response';
export const WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST =
  'sniptale:web-snapshot-viewer-preparation-request';
export const WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE =
  'sniptale:web-snapshot-viewer-preparation-response';
export const PREPARATION_SURFACE_RESIZE = 'PREPARATION_SURFACE_RESIZE' as const;

export type ViewerPopupExportMessage =
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_PREVIEW]
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE]
  | TabRequestByType[typeof MessageType.EXPORT_POPUP_CANCEL];

export type ViewerExportPortRequest = {
  type: typeof WEB_SNAPSHOT_VIEWER_EXPORT_REQUEST;
  requestId: string;
  viewerPortGeneration: string;
  request: ViewerPopupExportMessage;
};

export type ViewerExportPortResponse = {
  type: typeof WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE;
  requestId: string;
  viewerPortGeneration: string;
  response?: TabResponseByType[ViewerPopupExportMessage['type']];
};

export type ViewerPreparationPortRequest = {
  type: typeof WEB_SNAPSHOT_VIEWER_PREPARATION_REQUEST;
  command: ViewerPreparationCommand;
  requestId: string;
  viewerPortGeneration: string;
};

export type ViewerPreparationPortResponse = {
  type: typeof WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE;
  error?: string;
  requestId: string;
  success: boolean;
  viewerPortGeneration: string;
};

export type ViewerPreparationCommand =
  | { type: typeof MessageType.DISABLE_SCREENSHOT_MODE }
  | {
      type: typeof PREPARATION_SURFACE_RESIZE;
      viewport?: AppliedViewportPresetPayload | null;
    }
  | {
      type: typeof MessageType.ENABLE_SCREENSHOT_MODE;
      autoStartCaptureType?: 'visible' | 'full';
      autoStartSelection?: boolean;
      quickActionOverlay?: QuickActionOverlay & { delaySeconds?: number };
      surfaceCapabilityToken?: string;
      surfaceWarning?: string;
      toolbarVisible?: boolean;
      viewport?: AppliedViewportPresetPayload | null;
    };
