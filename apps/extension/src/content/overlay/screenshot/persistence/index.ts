import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  RuntimeMessageType,
  RuntimeRequestByType,
} from '../../../../contracts/messaging/contracts/runtime-message';
import type { CaptureActionType } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';
import { getContentRuntimeServices } from '../../../application/runtime-services/services';
import { loadSettings } from '../../../../composition/persistence/settings';
import { buildScreenshotFilename as generateFilename } from '@sniptale/foundation/utils/screenshot-filename';
import { copyImageToClipboard } from '../../clipboard-image';
import {
  attachContentActionIntent,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';
import { isStaleScreenshotRunError } from '../mode';

type ScreenshotMode = 'visible' | 'full' | 'selection';
type ContentActionRuntimeMessage = RuntimeRequestByType[RuntimeMessageType] &
  Parameters<typeof attachContentActionIntent>[0];
type FreshnessAssertion = () => void;

type SaveDialogState = {
  dataUrl: string;
  filename: string;
};

type PersistenceResult = {
  successMessage: string | null;
};

type BasePersistenceParams = {
  assertFresh?: FreshnessAssertion | undefined;
  mode: ScreenshotMode;
  sessionActivePresetId: string | null;
  setSaveDialogState: (state: SaveDialogState | null) => void;
};

type PersistSelectionCaptureParams = BasePersistenceParams & {
  actionType: CaptureActionType;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  dataUrl: string;
};

type PersistBackgroundCaptureParams = BasePersistenceParams & {
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  response: {
    action?: CaptureActionType;
    dataUrl?: string;
  };
};

function getSavedMessage(mode: ScreenshotMode): string {
  if (mode === 'selection') {
    return translate('content.runtime.selectionSaved');
  }
  if (mode === 'full') {
    return translate('content.runtime.fullSaved');
  }
  return translate('content.runtime.visibleSaved');
}

function assertFresh(assertFreshness: FreshnessAssertion | undefined): void {
  assertFreshness?.();
}

async function sendRuntimeMessageWithFreshness<TMessage extends ContentActionRuntimeMessage>(args: {
  assertFresh?: FreshnessAssertion | undefined;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  message: TMessage;
}): Promise<void> {
  assertFresh(args.assertFresh);
  const messageWithIntent = await attachContentActionIntent(args.message, args.contentIntentSource);
  assertFresh(args.assertFresh);
  await getContentRuntimeServices().messaging.sendRuntimeMessage(messageWithIntent);
  assertFresh(args.assertFresh);
}

async function executePresetSave(args: {
  assertFresh?: FreshnessAssertion | undefined;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  dataUrl: string;
  filename: string;
  presetId: string;
}): Promise<void> {
  await sendRuntimeMessageWithFreshness({
    assertFresh: args.assertFresh,
    contentIntentSource: args.contentIntentSource,
    message: {
      type: MessageType.EXECUTE_SAVE,
      dataUrl: args.dataUrl,
      filename: args.filename,
      actionType: 'download_default' as const,
      presetId: args.presetId,
    },
  });
}

async function persistImmediateSelectionAction(args: {
  actionType: CaptureActionType;
  assertFresh?: FreshnessAssertion | undefined;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  dataUrl: string;
}): Promise<PersistenceResult | null> {
  if (args.actionType === 'edit') {
    await sendRuntimeMessageWithFreshness({
      assertFresh: args.assertFresh,
      contentIntentSource: args.contentIntentSource,
      message: {
        type: MessageType.OPEN_EDITOR_WITH_IMAGE,
        dataUrl: args.dataUrl,
      },
    });
    return { successMessage: translate('content.runtime.sentToEditor') };
  }

  if (args.actionType === 'copy') {
    await copyImageToClipboard(args.dataUrl, {
      assertFresh: args.assertFresh,
      shouldRethrowError: isStaleScreenshotRunError,
    });
    return { successMessage: translate('content.runtime.copiedToClipboard') };
  }

  if (args.actionType === 'scenario') {
    return { successMessage: translate('content.runtime.scenarioStepSaved') };
  }

  return null;
}

async function persistDeferredSelectionAction(args: {
  actionType: CaptureActionType;
  assertFresh?: FreshnessAssertion | undefined;
  contentIntentSource?: ContentPrivilegedActionIntentSource | undefined;
  dataUrl: string;
  defaultImagePresetId?: string | null | undefined;
  filename: string;
  mode: ScreenshotMode;
  sessionActivePresetId: string | null;
  setSaveDialogState: (state: SaveDialogState | null) => void;
}): Promise<PersistenceResult> {
  if (args.actionType === 'ask_preset') {
    if (args.sessionActivePresetId) {
      await executePresetSave({
        assertFresh: args.assertFresh,
        contentIntentSource: args.contentIntentSource,
        dataUrl: args.dataUrl,
        filename: args.filename,
        presetId: args.sessionActivePresetId,
      });
      return { successMessage: getSavedMessage(args.mode) };
    }

    assertFresh(args.assertFresh);
    args.setSaveDialogState({ dataUrl: args.dataUrl, filename: args.filename });
    return { successMessage: null };
  }

  const presetId =
    args.actionType === 'download_default' ? (args.defaultImagePresetId ?? undefined) : undefined;
  await sendRuntimeMessageWithFreshness({
    assertFresh: args.assertFresh,
    contentIntentSource: args.contentIntentSource,
    message: {
      type: MessageType.EXECUTE_SAVE,
      dataUrl: args.dataUrl,
      filename: args.filename,
      actionType: args.actionType,
      ...(presetId === undefined ? {} : { presetId }),
    },
  });

  return { successMessage: getSavedMessage(args.mode) };
}

export async function persistSelectionCapture({
  actionType,
  assertFresh: assertFreshness,
  contentIntentSource,
  dataUrl,
  mode,
  sessionActivePresetId,
  setSaveDialogState,
}: PersistSelectionCaptureParams): Promise<PersistenceResult> {
  const settings = await loadSettings();
  assertFresh(assertFreshness);
  const filename = generateFilename(mode);

  if (settings.saveCapturesToGallery) {
    await sendRuntimeMessageWithFreshness({
      assertFresh: assertFreshness,
      contentIntentSource,
      message: {
        type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
        dataUrl,
        filename,
      },
    });
  }

  const immediateResult = await persistImmediateSelectionAction({
    actionType,
    assertFresh: assertFreshness,
    contentIntentSource,
    dataUrl,
  });
  if (immediateResult) {
    return immediateResult;
  }

  return persistDeferredSelectionAction({
    actionType,
    assertFresh: assertFreshness,
    contentIntentSource,
    dataUrl,
    defaultImagePresetId: settings.defaultImagePresetId,
    filename,
    mode,
    sessionActivePresetId,
    setSaveDialogState,
  });
}

export async function persistBackgroundCapture({
  assertFresh: assertFreshness,
  contentIntentSource,
  mode,
  response,
  sessionActivePresetId,
  setSaveDialogState,
}: PersistBackgroundCaptureParams): Promise<PersistenceResult> {
  if (response.action === 'copy' && response.dataUrl) {
    await copyImageToClipboard(response.dataUrl, {
      assertFresh: assertFreshness,
      shouldRethrowError: isStaleScreenshotRunError,
    });
    return { successMessage: translate('content.runtime.copiedToClipboard') };
  }

  if (response.action === 'edit') {
    return { successMessage: translate('content.runtime.sentToEditor') };
  }

  if (response.action === 'scenario') {
    return { successMessage: translate('content.runtime.scenarioStepSaved') };
  }

  if (response.action === 'ask_preset' && response.dataUrl) {
    const filename = generateFilename(mode);

    if (sessionActivePresetId) {
      await executePresetSave({
        assertFresh: assertFreshness,
        contentIntentSource,
        dataUrl: response.dataUrl,
        filename,
        presetId: sessionActivePresetId,
      });
      return { successMessage: getSavedMessage(mode) };
    }

    assertFresh(assertFreshness);
    setSaveDialogState({ dataUrl: response.dataUrl, filename });
    return { successMessage: null };
  }

  return { successMessage: getSavedMessage(mode) };
}
