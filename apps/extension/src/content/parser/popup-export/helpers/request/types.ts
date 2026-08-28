import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { FullPageExportCaptureAction } from '../../../../../contracts/full-page-capture';

type ContentActionGrant = ContentIntentTypes.ContentPrivilegedActionAutoStartGrant;

type PopupExportBuildPackageBase = {
  type: MessageType.EXPORT_POPUP_BUILD_PACKAGE;
  options: ExportOptions;
  batchRequestId: string;
  intent: 'export' | 'save';
  contentIntentGrant?: ContentActionGrant;
  fullPageCaptureAction?: FullPageExportCaptureAction;
  ordinal: number;
};

export type PopupExportBuildPackageRequest = PopupExportBuildPackageBase &
  (
    | {
        allowAnonymousCrossOriginAssets: boolean;
        allowAuthenticatedSameOriginAssets: boolean;
        includeWebCopy: true;
      }
    | {
        allowAnonymousCrossOriginAssets?: never;
        allowAuthenticatedSameOriginAssets?: never;
        includeWebCopy: false;
      }
  );

export type PopupExportRequest =
  | { type: MessageType.EXPORT_POPUP_PREVIEW }
  | { type: MessageType.EXPORT_POPUP_CANCEL; exportRunId: string }
  | PopupExportBuildPackageRequest;
