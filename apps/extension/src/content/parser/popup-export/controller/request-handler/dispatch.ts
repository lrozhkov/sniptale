import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n';
import { respondWithPopupPreview } from '../preview';
import { handlePopupExportBuildPackageRuntime } from '../package';
import { handlePopupExportStartRuntime } from '../start/runtime';
import { handlePopupExportCancelRuntime } from './cancel';
import type { PopupExportRequestHandlerProps } from './types/request';
import type { PopupSendResponse } from '../../helpers';

type PopupWebSnapshotRequest = Extract<
  PopupExportRequestHandlerProps['request'],
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
>;

function handleLazyPopupWebSnapshotRuntime(
  sendResponse: PopupSendResponse,
  request: PopupWebSnapshotRequest
): boolean {
  void import('../snapshot')
    .then(({ handlePopupWebSnapshotRuntime }) =>
      handlePopupWebSnapshotRuntime(
        sendResponse,
        request.requestId,
        request.allowAuthenticatedSameOriginAssets,
        request.allowAnonymousCrossOriginAssets
      )
    )
    .catch((error: unknown) => {
      sendResponse({
        error:
          error instanceof Error
            ? `load web snapshot export module: ${error.message}`
            : translate('content.runtime.exportModuleLoadFailed'),
        success: false,
        warnings: [],
      });
    });
  return true;
}

export function dispatchPopupExportRequest(props: PopupExportRequestHandlerProps): boolean {
  switch (props.request.type) {
    case MessageType.EXPORT_POPUP_PREVIEW:
      void respondWithPopupPreview({
        parseTree: props.parseTree,
        sendResponse: props.sendResponse,
      });
      return true;

    case MessageType.EXPORT_POPUP_START:
      return handlePopupExportStartRuntime({
        ...props,
        request: props.request,
        sendResponse: props.sendResponse,
      });

    case MessageType.EXPORT_POPUP_BUILD_PACKAGE:
      return handlePopupExportBuildPackageRuntime({
        ...props,
        request: props.request,
        sendResponse: props.sendResponse,
      });

    case MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT:
      return handleLazyPopupWebSnapshotRuntime(props.sendResponse, props.request);

    case MessageType.EXPORT_POPUP_CANCEL:
      return handlePopupExportCancelRuntime({
        exportRunner: props.exportRunner,
        sendResponse: props.sendResponse,
        state: props.state,
      });

    default:
      return false;
  }
}
