import { generateFilename } from '@sniptale/foundation/utils/filename';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { DesktopScreenshotSelection } from '@sniptale/runtime-contracts/capture/action';
import { saveScreenshotToMediaHubFromDataUrl } from '../../../media-hub/assets';
import { executeDownload } from '../../download/download-router';
import { openEditorWithImage } from '../../editor';
import { createRenderedCaptureJob } from '../../jobs/rendered-job';
import { transitionCaptureJob } from '../../jobs/state-machine';
import type { QuickActionRuntimeContext } from '../flow/shared';
import { acquireMediaMutationPermit } from '../../../mutation-exclusion/media-activity';
import { assertQuickActionPolicy } from '../../../../features/quick-actions-presets/policy';
import { chooseDesktopScreenshotSource } from '../../../../platform/media-utils/desktop-capture-source-picker';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';

type DesktopQuickActionResult = { result: 'accepted' | 'cancelled' };
type ReleasePermit = () => void;
type PendingPreparation = {
  contextKey: string;
  releasePermit: ReleasePermit;
  requestId: string;
  reservationToken: string;
  tabId: number;
  timeout: ReturnType<typeof setTimeout>;
};

const PREPARATION_TIMEOUT_MS = 30_000;
const pendingPreparations = new Map<string, PendingPreparation>();
const preparingTabIds = new Set<number>();

function contextKey(context: QuickActionRuntimeContext): string {
  return JSON.stringify([
    context.action.id,
    context.captureMode,
    context.afterCapture,
    context.imageFormat,
    context.imageQuality,
  ]);
}

function prepareOffscreenFrame(requestId: string) {
  return getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
      requestId,
    })
  );
}

function cancelOffscreenFrame(requestId: string) {
  return getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
      requestId,
    })
  );
}

function captureOffscreenFrame(args: {
  imageFormat: QuickActionRuntimeContext['imageFormat'];
  imageQuality: number;
  requestId: string;
  streamId: string;
}) {
  return getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
      ...args,
    })
  );
}

async function cancelPreparation(preparation: PendingPreparation): Promise<void> {
  if (pendingPreparations.get(preparation.reservationToken) === preparation) {
    pendingPreparations.delete(preparation.reservationToken);
  }
  clearTimeout(preparation.timeout);
  try {
    await cancelOffscreenFrame(preparation.requestId);
  } finally {
    preparation.releasePermit();
  }
}

export async function reserveDesktopQuickAction(args: {
  context: QuickActionRuntimeContext;
  tabId: number;
}): Promise<{ requestId: string; reservationToken: string }> {
  assertQuickActionPolicy(args.context.action);
  if (args.context.captureMode !== 'desktop') throw new Error('Desktop capture is required');
  if (
    preparingTabIds.has(args.tabId) ||
    [...pendingPreparations.values()].some((pending) => pending.tabId === args.tabId)
  ) {
    throw new Error('A desktop screenshot picker is already open');
  }
  preparingTabIds.add(args.tabId);
  const releasePermit = acquireMediaMutationPermit();
  if (!releasePermit) {
    preparingTabIds.delete(args.tabId);
    throw new Error('Local data erasure is in progress');
  }
  const requestId = crypto.randomUUID();
  const reservationToken = crypto.randomUUID();
  try {
    await ensureOffscreenDocument('Capture a window or screen screenshot');
    await waitForOffscreenReady();
    const response = await prepareOffscreenFrame(requestId);
    if (!response || response.success !== true || response.result !== 'accepted') {
      throw new Error(response?.error || 'Desktop screenshot preparation failed');
    }
    const preparation: PendingPreparation = {
      contextKey: contextKey(args.context),
      releasePermit,
      requestId,
      reservationToken,
      tabId: args.tabId,
      timeout: setTimeout(() => {
        const current = pendingPreparations.get(reservationToken);
        if (current) void cancelPreparation(current);
      }, PREPARATION_TIMEOUT_MS),
    };
    pendingPreparations.set(reservationToken, preparation);
    return { requestId, reservationToken };
  } catch (error) {
    releasePermit();
    throw error;
  } finally {
    preparingTabIds.delete(args.tabId);
  }
}

export async function selectAndCaptureDesktopQuickAction(args: {
  context: QuickActionRuntimeContext;
  tabId: number;
  targetTab?: chrome.tabs.Tab;
}): Promise<DesktopScreenshotSelection> {
  const preparation = await reserveDesktopQuickAction({
    context: args.context,
    tabId: args.tabId,
  });
  try {
    const source = await chooseDesktopScreenshotSource(args.targetTab);
    if (source.status === 'failed') throw new Error(source.error);
    if (source.status === 'cancelled') {
      return { status: 'cancelled', ...preparation };
    }

    const response = await captureOffscreenFrame({
      imageFormat: args.context.imageFormat,
      imageQuality: args.context.imageQuality,
      requestId: preparation.requestId,
      streamId: source.selection.streamId,
    });
    if (!response?.success || response.result !== 'captured') {
      throw new Error(response?.error || 'Desktop screenshot capture failed');
    }
    return {
      status: 'selected',
      ...preparation,
      dataUrl: response.dataUrl,
      height: response.height,
      width: response.width,
    };
  } catch (error) {
    const pending = pendingPreparations.get(preparation.reservationToken);
    if (pending) await cancelPreparation(pending).catch(() => undefined);
    throw error;
  }
}

function takePreparation(args: {
  context: QuickActionRuntimeContext;
  selection: DesktopScreenshotSelection;
  tabId: number;
}): PendingPreparation {
  const preparation = pendingPreparations.get(args.selection.reservationToken);
  if (!preparation) throw new Error('Desktop screenshot preparation is missing or expired');
  pendingPreparations.delete(args.selection.reservationToken);
  clearTimeout(preparation.timeout);
  if (
    preparation.requestId !== args.selection.requestId ||
    preparation.tabId !== args.tabId ||
    preparation.contextKey !== contextKey(args.context)
  ) {
    void cancelPreparation(preparation);
    throw new Error('Desktop screenshot preparation does not match this capture request');
  }
  return preparation;
}

async function deliverDesktopCapture(args: {
  assetId: string;
  context: QuickActionRuntimeContext;
  dataUrl: string;
  filename: string;
  jobId: string;
}): Promise<void> {
  switch (args.context.afterCapture) {
    case 'edit':
      await openEditorWithImage(args.dataUrl, { assetId: args.assetId, url: null, title: null });
      await transitionCaptureJob(args.jobId, 'completed');
      return;
    case 'save_to_library':
      await transitionCaptureJob(args.jobId, 'completed');
      return;
    case 'download_default':
    case 'ask_system':
      await executeDownload(
        args.dataUrl,
        args.filename,
        args.context.afterCapture,
        args.context.afterCapture === 'download_default'
          ? args.context.settings.defaultImagePresetId
          : undefined,
        args.jobId
      );
      return;
    case 'ask_preset':
    case 'copy':
    case 'scenario':
      throw new Error('Selected action is unavailable for window or screen capture');
  }
}

export async function runDesktopQuickAction(args: {
  context: QuickActionRuntimeContext;
  desktopSelection?: DesktopScreenshotSelection;
  tabId: number;
}): Promise<DesktopQuickActionResult> {
  assertQuickActionPolicy(args.context.action);
  if (!args.desktopSelection) throw new Error('Desktop screenshot selection is required');
  const preparation = takePreparation({
    context: args.context,
    selection: args.desktopSelection,
    tabId: args.tabId,
  });
  let jobId: string | null = null;
  try {
    if (args.desktopSelection.status === 'cancelled') {
      await cancelOffscreenFrame(preparation.requestId);
      return { result: 'cancelled' };
    }
    await cancelOffscreenFrame(preparation.requestId);
    const createdJobId = await createRenderedCaptureJob(args.tabId);
    jobId = createdJobId;
    const filename = generateFilename('desktop', args.context.imageFormat);
    const assetId = await saveScreenshotToMediaHubFromDataUrl(
      args.desktopSelection.dataUrl,
      filename,
      undefined,
      args.context.afterCapture === 'save_to_library' ? 'library' : 'temporary'
    );
    await deliverDesktopCapture({
      assetId,
      context: args.context,
      dataUrl: args.desktopSelection.dataUrl,
      filename,
      jobId: createdJobId,
    });
    return { result: 'accepted' };
  } catch (error) {
    if (jobId) {
      await transitionCaptureJob(jobId, 'failed', {
        error: error instanceof Error ? error.message : 'Desktop screenshot failed',
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    preparation.releasePermit();
  }
}
