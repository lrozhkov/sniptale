import { generateFilename } from '@sniptale/foundation/utils/filename';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { chooseDesktopScreenshotSource } from '../../../media/desktop-capture/source-picker';
import {
  ensureOffscreenDocument,
  waitForOffscreenReady,
} from '../../../offscreen-document/service';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { saveScreenshotToMediaHubFromDataUrl } from '../../../media-hub/assets';
import { executeDownload } from '../../download/download-router';
import { openEditorWithImage } from '../../editor';
import { createRenderedCaptureJob } from '../../jobs/rendered-job';
import { transitionCaptureJob } from '../../jobs/state-machine';
import type { QuickActionRuntimeContext } from '../flow/shared';
import { acquireMediaMutationPermit } from '../../../mutation-exclusion/media-activity';

type DesktopQuickActionResult = { result: 'accepted' | 'cancelled' };

async function captureDesktopDataUrl(args: {
  context: QuickActionRuntimeContext;
  requestId: string;
  streamId: string;
}) {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
      requestId: args.requestId,
      streamId: args.streamId,
      imageFormat: args.context.imageFormat,
      imageQuality: args.context.imageQuality,
    })
  );
  if (
    response?.success !== true ||
    response.result !== 'captured' ||
    typeof response.dataUrl !== 'string'
  ) {
    throw new Error(response?.error ?? 'Offscreen desktop frame capture failed');
  }
  return response.dataUrl;
}

async function copyDesktopDataUrl(dataUrl: string, requestId: string): Promise<void> {
  const response = await getBackgroundRuntimeMessaging().sendRuntimeMessage(
    attachOffscreenCommandCapability({
      type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
      requestId,
      dataUrl,
    })
  );
  if (response?.success !== true || response.result !== 'copied') {
    throw new Error(response?.error ?? 'Offscreen clipboard write failed');
  }
}

async function deliverDesktopCapture(args: {
  assetId: string;
  context: QuickActionRuntimeContext;
  dataUrl: string;
  filename: string;
  jobId: string;
  requestId: string;
}): Promise<void> {
  switch (args.context.afterCapture) {
    case 'edit':
      await openEditorWithImage(args.dataUrl, { assetId: args.assetId, url: null, title: null });
      await transitionCaptureJob(args.jobId, 'completed');
      return;
    case 'copy':
      await copyDesktopDataUrl(args.dataUrl, `${args.requestId}:clipboard`);
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
    case 'scenario':
      throw new Error('Selected action is unavailable for window or screen capture');
  }
}

export async function runDesktopQuickAction(args: {
  context: QuickActionRuntimeContext;
  tabId: number;
}): Promise<DesktopQuickActionResult> {
  const releaseMutationPermit = acquireMediaMutationPermit();
  if (!releaseMutationPermit) throw new Error('Local data erasure is in progress');

  let jobId: string | null = null;
  try {
    await ensureOffscreenDocument('Capture one user-selected window or screen frame');
    await waitForOffscreenReady();
    const selection = await chooseDesktopScreenshotSource();
    if (selection.status === 'cancelled') return { result: 'cancelled' };
    if (selection.status === 'failed') throw new Error(selection.error);

    const requestId = crypto.randomUUID();
    const capturePromise = captureDesktopDataUrl({
      context: args.context,
      requestId,
      streamId: selection.selection.streamId,
    });
    const jobPromise = createRenderedCaptureJob(args.tabId);
    const [captureResult, jobResult] = await Promise.allSettled([capturePromise, jobPromise]);
    if (jobResult.status === 'fulfilled') jobId = jobResult.value;
    if (captureResult.status === 'rejected') throw captureResult.reason;
    if (jobResult.status === 'rejected') throw jobResult.reason;
    const dataUrl = captureResult.value;
    const createdJobId = jobResult.value;
    const filename = generateFilename('desktop', args.context.imageFormat);
    const assetId = await saveScreenshotToMediaHubFromDataUrl(
      dataUrl,
      filename,
      undefined,
      args.context.afterCapture === 'save_to_library' ? 'library' : 'temporary'
    );
    await deliverDesktopCapture({
      assetId,
      context: args.context,
      dataUrl,
      filename,
      jobId: createdJobId,
      requestId,
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
    releaseMutationPermit();
  }
}
