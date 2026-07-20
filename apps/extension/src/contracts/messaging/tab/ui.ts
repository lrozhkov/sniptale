import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../contracts/runtime-message/index';
import type { PopupExportStartResponse, ToolbarStatusResponse } from '../contracts/response-types';
import type {
  ExportOptions,
  PopupExportPackageResponse,
  PopupExportPreviewResponse,
} from '@sniptale/runtime-contracts/export';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { WebSnapshotSaveResult } from '@sniptale/runtime-contracts/web-snapshot';
import type { ShowToastPayload, Size2d } from '../contracts/types';

type PopupExportContentActionGrant = {
  contentIntentGrant?: ContentIntentTypes.ContentPrivilegedActionAutoStartGrant;
};

export type TabUiRequestByType = {
  [MessageType.ENABLE_SCREENSHOT_MODE]: RuntimeRequestByType[typeof MessageType.ENABLE_SCREENSHOT_MODE];
  [MessageType.DISABLE_SCREENSHOT_MODE]: RuntimeRequestByType[typeof MessageType.DISABLE_SCREENSHOT_MODE];
  [MessageType.ENABLE_HIGHLIGHTER_MODE]: RuntimeRequestByType[typeof MessageType.ENABLE_HIGHLIGHTER_MODE];
  [MessageType.DISABLE_HIGHLIGHTER_MODE]: RuntimeRequestByType[typeof MessageType.DISABLE_HIGHLIGHTER_MODE];
  [MessageType.ENABLE_QUICK_EDIT_MODE]: RuntimeRequestByType[typeof MessageType.ENABLE_QUICK_EDIT_MODE];
  [MessageType.DISABLE_QUICK_EDIT_MODE]: RuntimeRequestByType[typeof MessageType.DISABLE_QUICK_EDIT_MODE];
  [MessageType.SHOW_TOOLBAR]: { type: typeof MessageType.SHOW_TOOLBAR; tabId?: number };
  [MessageType.HIDE_TOOLBAR]: { type: typeof MessageType.HIDE_TOOLBAR; tabId?: number };
  [MessageType.TOOLBAR_STATUS]: { type: typeof MessageType.TOOLBAR_STATUS; tabId?: number };
  [MessageType.VIEWPORT_CHANGED]: {
    type: typeof MessageType.VIEWPORT_CHANGED;
    viewport: Size2d | null;
  };
  [MessageType.SHOW_SAVE_DIALOG]: {
    type: typeof MessageType.SHOW_SAVE_DIALOG;
    dataUrl?: string;
    filename?: string;
  };
  [MessageType.SHOW_QUICK_ACTION_COUNTDOWN]: {
    type: typeof MessageType.SHOW_QUICK_ACTION_COUNTDOWN;
    seconds?: number;
  };
  [MessageType.SHOW_TOAST]: {
    type: typeof MessageType.SHOW_TOAST;
    payload?: ShowToastPayload;
  };
  [MessageType.COPY_IMAGE_TO_CLIPBOARD]: {
    type: typeof MessageType.COPY_IMAGE_TO_CLIPBOARD;
    dataUrl: string;
  };
  [MessageType.COPY_TEXT_TO_CLIPBOARD]: {
    type: typeof MessageType.COPY_TEXT_TO_CLIPBOARD;
    html?: string;
    text: string;
  };
  [MessageType.DESTROY_UI_TOOLBAR]: { type: typeof MessageType.DESTROY_UI_TOOLBAR };
  [MessageType.EXPORT_POPUP_PREVIEW]: { type: typeof MessageType.EXPORT_POPUP_PREVIEW };
  [MessageType.EXPORT_POPUP_START]: {
    type: typeof MessageType.EXPORT_POPUP_START;
    requestId: string;
    options: ExportOptions;
  } & PopupExportContentActionGrant;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: {
    type: typeof MessageType.EXPORT_POPUP_BUILD_PACKAGE;
    options: ExportOptions;
  } & PopupExportContentActionGrant;
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: {
    type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT;
    allowAnonymousCrossOriginAssets: boolean;
    allowAuthenticatedSameOriginAssets: boolean;
    requestId: string;
  };
  [MessageType.EXPORT_POPUP_CANCEL]: { type: typeof MessageType.EXPORT_POPUP_CANCEL };
};

export type TabUiResponseByType = {
  [MessageType.ENABLE_SCREENSHOT_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.DISABLE_SCREENSHOT_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.ENABLE_HIGHLIGHTER_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.DISABLE_HIGHLIGHTER_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.ENABLE_QUICK_EDIT_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.DISABLE_QUICK_EDIT_MODE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SHOW_TOOLBAR]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.HIDE_TOOLBAR]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.TOOLBAR_STATUS]: ToolbarStatusResponse;
  [MessageType.VIEWPORT_CHANGED]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SHOW_SAVE_DIALOG]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SHOW_QUICK_ACTION_COUNTDOWN]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.SHOW_TOAST]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.COPY_IMAGE_TO_CLIPBOARD]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.COPY_TEXT_TO_CLIPBOARD]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.DESTROY_UI_TOOLBAR]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.EXPORT_POPUP_PREVIEW]: PopupExportPreviewResponse;
  [MessageType.EXPORT_POPUP_START]: PopupExportStartResponse;
  [MessageType.EXPORT_POPUP_BUILD_PACKAGE]: PopupExportPackageResponse;
  [MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT]: WebSnapshotSaveResult;
  [MessageType.EXPORT_POPUP_CANCEL]: PopupExportStartResponse;
};
