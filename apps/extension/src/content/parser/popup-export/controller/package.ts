import { translate } from '../../../../platform/i18n';
import type { ExportOptions, ExportPagePackage } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { PopupExportRequestHandlerRuntime } from './types';

type PopupExportBuildPackageRequest = {
  batchRequestId: string;
  options: ExportOptions;
  type: MessageType.EXPORT_POPUP_BUILD_PACKAGE;
};

type PopupExportBuildPackageSendResponse = (response?: {
  error?: string;
  pagePackage?: ExportPagePackage;
  success?: boolean;
}) => void;

type PopupExportBuildPackageHandlerProps = Pick<
  PopupExportRequestHandlerRuntime,
  'exportRunner' | 'state'
> & {
  request: PopupExportBuildPackageRequest;
  sendResponse: PopupExportBuildPackageSendResponse;
};

export function handlePopupExportBuildPackageRuntime(
  props: PopupExportBuildPackageHandlerProps
): boolean {
  if (props.state.isExportRunning) {
    props.sendResponse({
      success: false,
      error: translate('content.runtime.exportAlreadyRunning'),
    });
    return true;
  }

  props.state.isExportRunning = true;
  props.state.activeExportRequestId = props.request.batchRequestId;
  void props.exportRunner
    .buildPackage(props.request.options)
    .then((pagePackage) => {
      props.sendResponse({
        success: true,
        pagePackage,
      });
    })
    .catch((error) => {
      props.sendResponse({
        success: false,
        error:
          error instanceof Error ? error.message : translate('content.runtime.exportPrepareFailed'),
      });
    })
    .finally(() => {
      if (props.state.activeExportRequestId === props.request.batchRequestId) {
        props.state.activeExportRequestId = null;
        props.state.isExportRunning = false;
      }
    });

  return true;
}
