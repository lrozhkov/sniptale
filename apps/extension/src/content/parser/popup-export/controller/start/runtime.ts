import { translate } from '../../../../../platform/i18n';
import type {
  ExportOptions,
  PopupExportPreview,
  PopupExportResult,
} from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type * as ContentIntentTypes from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import * as contentIntent from '../../../../platform/privileged-action-intent/client';
import { attachPopupExportStartProgress } from './progress';
import { settlePopupExportStartFlow } from './settle';
import type { ContentPrivilegedActionIntentSource } from '../../../../platform/privileged-action-intent/client';
import type { PopupExportRequestHandlerRuntime, PopupExportRunner } from '../types';

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

type PopupExportStartRuntime = Pick<
  PopupExportRequestHandlerRuntime,
  'emitMessage' | 'persistArchive' | 'state'
> & {
  exportRunner: Pick<PopupExportRunner, 'export' | 'onProgress'>;
};

type PopupExportStartRequestHandlerProps = PopupExportStartRuntime & {
  request: PopupExportStartRequest;
  sendResponse: PopupSendResponse;
};

type PopupExportStartFlowProps = PopupExportStartRuntime & {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  options: ExportOptions;
  requestId: string;
};

function resolveExportContentIntentSource(grant: ContentActionGrant | undefined) {
  return grant ? createAutoStartIntentSource(grant.grantToken) : undefined;
}

async function emitPopupExportStartResult(args: {
  emitMessage: PopupExportRequestHandlerRuntime['emitMessage'];
  requestId: string;
  result: PopupExportResult | null;
}): Promise<void> {
  if (!args.result) {
    return;
  }

  await args.emitMessage({
    type: MessageType.EXPORT_POPUP_RESULT,
    requestId: args.requestId,
    result: args.result,
  });
}

async function runPopupExportStartFlow(props: PopupExportStartFlowProps): Promise<void> {
  attachPopupExportStartProgress({
    emitMessage: props.emitMessage,
    exportRunner: props.exportRunner,
    requestId: props.requestId,
    state: props.state,
  });

  const popupResult = await settlePopupExportStartFlow(props);
  await emitPopupExportStartResult({
    emitMessage: props.emitMessage,
    requestId: props.requestId,
    result: popupResult,
  });
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
