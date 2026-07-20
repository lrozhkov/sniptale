import { browserRuntime } from '@sniptale/platform/browser/runtime';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { createDesktopMediaSourceChooser } from './desktop-source';
import { DesktopMediaAcquisitionError, DesktopMediaPickerError } from './desktop-media.errors';
import {
  type DesktopMediaRequestDeps,
  type DesktopMediaRequestOptions,
  resolveDesktopMediaRequestResult,
  resolveDesktopMediaSourceRequestResult,
  runDesktopMediaRequestWorkflow,
} from './desktop-media.workflow';
import { isTrustedOffscreenRuntimeSender } from '../runtime/sender-policy';

const chooseDesktopMediaSource = createDesktopMediaSourceChooser();

const defaultDesktopMediaRequestDeps: DesktopMediaRequestDeps = {
  chooseDesktopMediaSource,
  isTrustedOffscreenRuntimeSender,
  logger: createLogger({ namespace: 'BackgroundVideoUi:DesktopMedia' }),
  sendRuntimeMessage: (message) => getBackgroundRuntimeMessaging().sendRuntimeMessage(message),
  subscribeToMessages: browserRuntime.subscribeToMessages,
};

type DesktopMediaAcquirePhase = 'desktop-stream-acquire' | 'display-media-acquire';
type DesktopMediaPickerResult = Awaited<ReturnType<typeof chooseDesktopMediaSource>>;
type SelectedDesktopMediaPickerResult = Extract<DesktopMediaPickerResult, { status: 'selected' }>;

function getSourceFailureDetails(options: DesktopMediaRequestOptions): {
  phase: DesktopMediaAcquirePhase;
  sourceCount?: number;
  sourceIndex?: number;
} {
  return {
    phase:
      options.desktopStreamId === undefined ? 'display-media-acquire' : 'desktop-stream-acquire',
    ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
    ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
  };
}

async function prepareDesktopStreamAcquire(options: DesktopMediaRequestOptions): Promise<void> {
  try {
    await options.beforeDesktopStreamAcquire?.();
  } catch (error) {
    throw new DesktopMediaAcquisitionError(
      error instanceof Error ? error.message : String(error),
      getSourceFailureDetails(options)
    );
  }
}

async function runSelectedDesktopMediaRequest(params: {
  captureMode: CaptureMode;
  deps: DesktopMediaRequestDeps;
  options: DesktopMediaRequestOptions;
  pickerResult: SelectedDesktopMediaPickerResult;
}): Promise<{ label: string } | null> {
  const { captureMode, deps, options, pickerResult } = params;
  await prepareDesktopStreamAcquire(options);

  const result = await runDesktopMediaRequestWorkflow(
    captureMode,
    {
      ...options,
      desktopLabel: pickerResult.selection.label,
      desktopStreamId: pickerResult.selection.streamId,
    },
    deps
  );
  return resolveDesktopMediaSourceRequestResult(result);
}

/**
 * Requests a desktop media source and resolves when the background runtime receives a result.
 */
export function requestDesktopMedia(
  captureMode: CaptureMode,
  controlledCursorCaptureEnabled = false,
  deps: DesktopMediaRequestDeps = defaultDesktopMediaRequestDeps
): Promise<{ label: string } | null> {
  return runDesktopMediaRequestWorkflow(captureMode, { controlledCursorCaptureEnabled }, deps).then(
    resolveDesktopMediaRequestResult
  );
}

export function requestDesktopMediaSource(
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions,
  deps: DesktopMediaRequestDeps = defaultDesktopMediaRequestDeps
): Promise<{ label: string } | null> {
  return requestBackgroundSelectedDesktopMedia(captureMode, options, deps);
}

export async function requestDisplayMediaSource(
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions,
  deps: DesktopMediaRequestDeps = defaultDesktopMediaRequestDeps
): Promise<{ label: string } | null> {
  await prepareDesktopStreamAcquire(options);
  const result = await runDesktopMediaRequestWorkflow(captureMode, options, deps);
  return resolveDesktopMediaSourceRequestResult(result);
}

async function requestBackgroundSelectedDesktopMedia(
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions,
  deps: DesktopMediaRequestDeps
): Promise<{ label: string } | null> {
  try {
    const pickerResult = await (deps.chooseDesktopMediaSource ?? chooseDesktopMediaSource)(
      captureMode
    );
    if (pickerResult.status === 'cancelled') {
      deps.logger.debug('Desktop media picker cancelled', {
        phase: 'desktop-picker',
        sourceCount: options.sourceCount,
        sourceIndex: options.sourceIndex,
      });
      return null;
    }

    if (pickerResult.status === 'failed') {
      deps.logger.warn('Desktop media picker failed', {
        error: pickerResult.error,
        phase: 'desktop-picker',
        sourceCount: options.sourceCount,
        sourceIndex: options.sourceIndex,
      });
      throw new DesktopMediaPickerError(pickerResult.error, getSourceFailureDetails(options));
    }

    return runSelectedDesktopMediaRequest({
      captureMode,
      deps,
      options,
      pickerResult,
    });
  } catch (error) {
    if (error instanceof DesktopMediaAcquisitionError || error instanceof DesktopMediaPickerError) {
      throw error;
    }

    deps.logger.warn('[VideoManager] Desktop media source selection failed:', error);
    throw new DesktopMediaPickerError(
      error instanceof Error ? error.message : String(error),
      getSourceFailureDetails(options)
    );
  }
}
