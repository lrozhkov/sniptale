import { translate } from '../../../../../platform/i18n';
import type { ExportOptions, PopupExportPreview } from '@sniptale/runtime-contracts/export';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import * as contentIntent from '../../../../platform/privileged-action-intent/client';
import { runPopupExportStartFlow, type PopupExportStartFlowProps } from './flow';

type ContentActionGrant = ContentIntentTypes.ContentPrivilegedActionAutoStartGrant;
const createAutoStartIntentSource =
  contentIntent.createBackgroundAutoStartContentActionIntentSource;

type PopupExportStartRequest = {
  contentIntentGrant?: ContentActionGrant;
  options: ExportOptions;
  requestId: string;
  type: MessageType.EXPORT_POPUP_START;
};

type PopupSendResponse = (response?: {
  error?: string;
  preview?: PopupExportPreview;
  success?: boolean;
}) => void;

type PopupExportStartRequestHandlerProps = Omit<
  PopupExportStartFlowProps,
  'options' | 'requestId'
> & {
  request: PopupExportStartRequest;
  sendResponse: PopupSendResponse;
};

function resolveExportContentIntentSource(grant: ContentActionGrant | undefined) {
  return grant ? createAutoStartIntentSource(grant.grantToken) : undefined;
}

export function handlePopupExportStartRuntime(props: PopupExportStartRequestHandlerProps): boolean {
  if (props.state.isExportRunning) {
    props.sendResponse({
      success: false,
      error: translate('content.runtime.exportAlreadyRunning'),
    });
    return true;
  }

  props.state.isExportRunning = true;
  props.state.activeExportRequestId = props.request.requestId;
  props.sendResponse({ success: true });
  void runPopupExportStartFlow({
    contentIntentSource: resolveExportContentIntentSource(props.request.contentIntentGrant),
    emitMessage: props.emitMessage,
    exportRunner: props.exportRunner,
    options: props.request.options,
    persistArchive: props.persistArchive,
    requestId: props.request.requestId,
    state: props.state,
  });
  return true;
}
