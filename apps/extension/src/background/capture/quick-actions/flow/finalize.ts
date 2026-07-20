import { translate } from '../../../../platform/i18n/index';
import { runBestEffort } from '@sniptale/foundation/best-effort';
import { createLogger } from '@sniptale/platform/observability/logger';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  CaptureActionType,
  QuickAction,
  Settings as UserSettings,
} from '../../../../contracts/settings';
import { detachDebugger } from '../../../debugger/session/detach';
import { clearViewport } from '../../../debugger/workspace';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { executeDownload } from '../../download/download-router/index';
import { openEditorWithImage } from '../../editor/index';
import { createRenderedCaptureJob } from '../../jobs/rendered-job';
import { transitionCaptureJob } from '../../jobs/state-machine';

const logger = createLogger({ namespace: 'BackgroundQuickAction' });

type QuickActionEntry = QuickAction;
type QuickActionSettings = UserSettings;

type CaptureResult = {
  dataUrl: string;
  filename: string;
  jobId?: string | undefined;
  needsDebugger: boolean;
};

type FinalizeCaptureArgs = {
  tabId: number;
  action: QuickActionEntry;
  settings: QuickActionSettings;
  captureResult: CaptureResult;
};

type AfterCaptureArgs = Omit<FinalizeCaptureArgs, 'captureResult'> & {
  captureResult: CaptureResult;
};

type AfterCaptureResult = {
  successToastMessage: string | null;
};

export async function finalizeQuickActionCapture({
  tabId,
  action,
  settings,
  captureResult,
}: FinalizeCaptureArgs) {
  const preparedCaptureResult = await ensureQuickActionCaptureJob(tabId, captureResult);
  const afterCaptureResult = await executeAfterCaptureAction({
    tabId,
    action,
    settings,
    captureResult: preparedCaptureResult,
  }).catch(async (error) => {
    await markQuickActionCaptureJobTerminal(preparedCaptureResult.jobId, 'failed', error);
    throw error;
  });

  if (action.exitAfterCapture) {
    showQuickActionSuccessToast(tabId, afterCaptureResult.successToastMessage);
    runBestEffort(
      getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
        type: MessageType.DESTROY_UI_TOOLBAR,
      }),
      logger,
      'Failed to destroy quick action toolbar',
      { tabId }
    );
  }

  if (preparedCaptureResult.needsDebugger) {
    await cleanupQuickActionDebugger(tabId);
  }
}

async function ensureQuickActionCaptureJob(
  tabId: number,
  captureResult: CaptureResult
): Promise<CaptureResult> {
  if (captureResult.jobId) {
    return captureResult;
  }

  return {
    ...captureResult,
    jobId: await createRenderedCaptureJob(tabId),
  };
}

async function markQuickActionCaptureJobTerminal(
  jobId: string | undefined,
  state: 'completed' | 'failed',
  error?: unknown
): Promise<void> {
  if (!jobId) {
    return;
  }

  await transitionCaptureJob(jobId, state, {
    ...(state === 'failed'
      ? { error: error instanceof Error ? error.message : 'Quick action capture failed' }
      : {}),
  });
}

async function executeAfterCaptureAction({
  tabId,
  action,
  settings,
  captureResult,
}: AfterCaptureArgs): Promise<AfterCaptureResult> {
  const afterCapture = action.afterCapture ?? 'download_default';

  switch (afterCapture) {
    case 'edit':
      await openEditorWithImage(captureResult.dataUrl, { tabId });
      await markQuickActionCaptureJobTerminal(captureResult.jobId, 'completed');
      return { successToastMessage: null };
    case 'copy':
      await copyQuickActionCaptureToClipboard(tabId, captureResult.dataUrl);
      await markQuickActionCaptureJobTerminal(captureResult.jobId, 'completed');
      return {
        successToastMessage: translate('content.runtime.quickActionCopiedToClipboard'),
      };
    case 'ask_preset':
      return showQuickActionSaveDialog(tabId, captureResult);
    case 'download_default':
    case 'ask_system':
    case 'scenario':
      return executeQuickActionDownload(captureResult, afterCapture, settings);
  }
}

async function showQuickActionSaveDialog(
  tabId: number,
  captureResult: CaptureResult
): Promise<AfterCaptureResult> {
  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: MessageType.SHOW_SAVE_DIALOG,
      dataUrl: captureResult.dataUrl,
      filename: captureResult.filename,
    }),
    logger,
    'Failed to show save dialog',
    { tabId }
  );
  await markQuickActionCaptureJobTerminal(captureResult.jobId, 'completed');
  return { successToastMessage: null };
}

async function executeQuickActionDownload(
  captureResult: CaptureResult,
  afterCapture: CaptureActionType,
  settings: QuickActionSettings
): Promise<AfterCaptureResult> {
  const presetId = afterCapture === 'download_default' ? settings.defaultImagePresetId : undefined;
  await executeDownload(
    captureResult.dataUrl,
    captureResult.filename,
    afterCapture,
    presetId,
    captureResult.jobId
  );
  if (afterCapture === 'scenario') {
    await markQuickActionCaptureJobTerminal(captureResult.jobId, 'completed');
  }
  return {
    successToastMessage: translate('content.runtime.quickActionSaved'),
  };
}

async function copyQuickActionCaptureToClipboard(tabId: number, dataUrl: string) {
  const response = await getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
    type: MessageType.COPY_IMAGE_TO_CLIPBOARD,
    dataUrl,
  });

  if (!response?.success) {
    throw new Error(response?.error || translate('content.runtime.copyImageFailed'));
  }
}

async function cleanupQuickActionDebugger(tabId: number) {
  try {
    await clearViewport(tabId);
    await detachDebugger(tabId, 'screenshot');
  } catch (error) {
    logger.warn('Failed to cleanup debugger', error);
  }
}

function showQuickActionSuccessToast(tabId: number, message: string | null) {
  if (!message) {
    return;
  }

  runBestEffort(
    getBackgroundRuntimeMessaging().sendTabMessage(tabId, {
      type: MessageType.SHOW_TOAST,
      payload: {
        type: 'success',
        message,
      },
    }),
    logger,
    'Failed to show quick action success toast',
    { tabId }
  );
}
