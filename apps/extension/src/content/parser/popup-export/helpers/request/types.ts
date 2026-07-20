import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';

type ContentActionGrant = ContentIntentTypes.ContentPrivilegedActionAutoStartGrant;

export type PopupExportRequest =
  | { type: MessageType.EXPORT_POPUP_PREVIEW }
  | { type: MessageType.EXPORT_POPUP_CANCEL }
  | {
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE;
      options: ExportOptions;
      contentIntentGrant?: ContentActionGrant;
    }
  | {
      type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT';
      allowAnonymousCrossOriginAssets: boolean;
      allowAuthenticatedSameOriginAssets: boolean;
      requestId: string;
    }
  | {
      type: MessageType.EXPORT_POPUP_START;
      options: ExportOptions;
      requestId: string;
      contentIntentGrant?: ContentActionGrant;
    };
