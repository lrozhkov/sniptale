import { translate } from '../../../platform/i18n';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CaptureActionType } from '../../../contracts/settings';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../application/privileged-action-intent';
import type { ContentAppSaveDialogState } from './types';

type SaveCaptureState = Exclude<ContentAppSaveDialogState, null>;
type SaveActionType = 'download_default' | 'ask_system';

async function saveCapture(
  saveDialogState: SaveCaptureState,
  actionType: SaveActionType,
  presetId: string | null,
  filename: string,
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined
) {
  return getContentRuntimeServices().messaging.sendRuntimeMessage(
    await attachContentActionIntent(
      {
        type: MessageType.EXECUTE_SAVE,
        dataUrl: saveDialogState.dataUrl,
        filename,
        actionType: actionType as CaptureActionType,
        ...(presetId === null ? {} : { presetId }),
      },
      contentIntentSource
    )
  );
}

export async function handleContentSaveDialogSave(args: {
  actionType: SaveActionType;
  filename: string;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  presetId: string | null;
  saveDialogState: SaveCaptureState;
  saveCaptureRequest?: typeof saveCapture;
  showToastMessage?: typeof showToast;
  translateMessage?: typeof translate;
}): Promise<boolean> {
  const saveCaptureRequest = args.saveCaptureRequest ?? saveCapture;
  const showToastMessage = args.showToastMessage ?? showToast;
  const translateMessage = args.translateMessage ?? translate;
  try {
    const response = await saveCaptureRequest(
      args.saveDialogState,
      args.actionType,
      args.presetId,
      args.filename,
      args.contentIntentSource
    );

    if (response?.success) {
      showToastMessage(translateMessage('content.interactiveFrame.screenshotSaved'), 'success');
      return true;
    }

    showToastMessage(
      response?.error || translateMessage('content.interactiveFrame.screenshotSaveError'),
      'error'
    );
    return false;
  } catch {
    showToastMessage(translateMessage('content.interactiveFrame.screenshotSaveError'), 'error');
    return false;
  }
}
