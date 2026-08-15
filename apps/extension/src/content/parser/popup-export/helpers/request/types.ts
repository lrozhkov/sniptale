import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { FullPageExportCaptureAction } from '../../../../../contracts/full-page-capture';

type ContentActionGrant = ContentIntentTypes.ContentPrivilegedActionAutoStartGrant;

export type PopupExportRequest =
  | { type: MessageType.EXPORT_POPUP_PREVIEW }
  | { type: MessageType.EXPORT_POPUP_CANCEL; exportRunId: string }
  | {
      type: MessageType.EXPORT_POPUP_BUILD_PACKAGE;
      options: ExportOptions;
      batchRequestId: string;
    }
  | {
      type: 'EXPORT_POPUP_SAVE_WEB_SNAPSHOT';
      allowAnonymousCrossOriginAssets: boolean;
      allowAuthenticatedSameOriginAssets: boolean;
      requestId: string;
      contentIntentGrant?: ContentActionGrant;
      fullPageCaptureAction?: FullPageExportCaptureAction;
    };
