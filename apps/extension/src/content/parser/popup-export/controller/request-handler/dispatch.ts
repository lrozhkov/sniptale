import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../../../platform/i18n';
import { respondWithPopupPreview } from '../preview';
import { handlePopupExportBuildPackageRuntime } from '../package';
import { handlePopupExportCancelRuntime } from './cancel';
import type { PopupSendResponse } from '../../helpers/messaging';
import type { PopupExportRequest } from '../../helpers/request/types';
import type { PopupExportRequestHandlerRuntime } from '../types';

type PopupExportRequestHandlerProps = PopupExportRequestHandlerRuntime & {
  request: PopupExportRequest;
  sendResponse: PopupSendResponse;
};

type PopupWebSnapshotRequest = Extract<
  PopupExportRequestHandlerProps['request'],
  { type: typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT }
>;

function handleLazyPopupWebSnapshotRuntime(
  props: Pick<PopupExportRequestHandlerProps, 'sendResponse' | 'state'> & {
    request: PopupWebSnapshotRequest;
  }
): boolean {
  if (props.state.isExportRunning) {
    props.sendResponse({
      error: translate('content.runtime.exportAlreadyRunning'),
      success: false,
      warnings: [],
    });
    return true;
  }
  const controller = new AbortController();
  props.state.activeAbortController = controller;
  props.state.activeExportRequestId = props.request.requestId;
  props.state.isExportRunning = true;
  const settle = () => {
    if (props.state.activeExportRequestId === props.request.requestId) {
      delete props.state.activeAbortController;
      props.state.activeExportRequestId = null;
      props.state.isExportRunning = false;
    }
  };
  void import('../web-snapshot-runtime')
    .then(({ handlePopupWebSnapshotRuntime }) =>
      handlePopupWebSnapshotRuntime(
        props.sendResponse,
        props.request.requestId,
        props.request.allowAuthenticatedSameOriginAssets,
        props.request.allowAnonymousCrossOriginAssets,
        props.request.contentIntentGrant,
        props.request.fullPageCaptureAction,
        controller.signal,
        settle
      )
    )
    .catch((error: unknown) => {
      settle();
      props.sendResponse({
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

    case MessageType.EXPORT_POPUP_BUILD_PACKAGE:
      return handlePopupExportBuildPackageRuntime({
        ...props,
        request: props.request,
        sendResponse: props.sendResponse,
      });

    case MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT:
      return handleLazyPopupWebSnapshotRuntime({
        request: props.request,
        sendResponse: props.sendResponse,
        state: props.state,
      });

    case MessageType.EXPORT_POPUP_CANCEL:
      return handlePopupExportCancelRuntime({
        exportRunId: props.request.exportRunId,
        exportRunner: props.exportRunner,
        sendResponse: props.sendResponse,
        state: props.state,
      });

    default:
      return false;
  }
}
