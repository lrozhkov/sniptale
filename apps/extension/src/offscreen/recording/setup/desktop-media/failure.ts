import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  sendRuntimeMessageBestEffort,
  stringifyOffscreenError,
} from '../../../runtime-messaging/best-effort';
import { getDesktopMediaAcquirePhase, isDesktopStreamAcquisitionRequest } from './acquire';
import type { DesktopMediaRequestOptions } from './types';

type DesktopMediaFailureLogger = Pick<Logger, 'debug' | 'error'>;

export function handleDesktopMediaRequestFailure(params: {
  captureMode: CaptureMode;
  disposeCachedDesktopMedia: () => void;
  disposeMultiSourceDesktopMedia: () => void;
  error: unknown;
  logger: DesktopMediaFailureLogger;
  options: DesktopMediaRequestOptions;
}): void {
  if (shouldReportDesktopMediaCancellation(params.error, params.options)) {
    reportDesktopMediaCancellation(params);
    return;
  }

  if (isDesktopStreamAcquisitionRequest(params.options) || (params.options.sourceCount ?? 1) > 1) {
    reportDesktopStreamAcquisitionFailure(params);
    return;
  }

  reportDesktopMediaCancellation(params);
}

function shouldReportDesktopMediaCancellation(
  error: unknown,
  options: DesktopMediaRequestOptions
): boolean {
  return options.desktopStreamId === undefined && isDisplayMediaCancellationError(error);
}

function isDisplayMediaCancellationError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'NotAllowedError')
  );
}

function reportDesktopStreamAcquisitionFailure(params: {
  captureMode: CaptureMode;
  disposeCachedDesktopMedia: () => void;
  disposeMultiSourceDesktopMedia: () => void;
  error: unknown;
  logger: DesktopMediaFailureLogger;
  options: DesktopMediaRequestOptions;
}): void {
  const { captureMode, error, logger, options } = params;
  const errorMessage = stringifyOffscreenError(error);
  const phase = getDesktopMediaAcquirePhase(options);
  logger.error('Desktop stream acquisition failed', {
    errorMessage,
    phase,
    sourceCount: options.sourceCount,
    sourceIndex: options.sourceIndex,
  });
  if ((options.sourceCount ?? 1) > 1) {
    params.disposeMultiSourceDesktopMedia();
  } else {
    params.disposeCachedDesktopMedia();
  }
  sendRuntimeMessageBestEffort({
    context: {
      captureMode,
      errorMessage,
      phase,
      sourceCount: options.sourceCount,
      sourceIndex: options.sourceIndex,
    },
    logger,
    logMessage: 'Failed to notify runtime about desktop stream acquisition failure',
    payload: {
      type: VideoMessageType.DESKTOP_MEDIA_FAILED,
      desktopMediaRequestGeneration: options.desktopMediaRequestGeneration,
      desktopMediaRequestId: options.desktopMediaRequestId,
      error: errorMessage,
      phase,
      ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
      ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
    },
  });
}

function reportDesktopMediaCancellation(params: {
  captureMode: CaptureMode;
  disposeCachedDesktopMedia: () => void;
  disposeMultiSourceDesktopMedia: () => void;
  error: unknown;
  logger: DesktopMediaFailureLogger;
  options: DesktopMediaRequestOptions;
}): void {
  const { captureMode, error, logger, options } = params;
  logger.error('Desktop media cancelled or failed', error);
  if ((options.sourceCount ?? 1) > 1) {
    params.disposeMultiSourceDesktopMedia();
  } else {
    params.disposeCachedDesktopMedia();
  }
  sendRuntimeMessageBestEffort({
    context: {
      captureMode,
      ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
      ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
    },
    logger,
    logMessage: 'Failed to notify runtime about cancelled desktop media request',
    payload: {
      type: VideoMessageType.DESKTOP_MEDIA_CANCELLED,
      desktopMediaRequestGeneration: options.desktopMediaRequestGeneration,
      desktopMediaRequestId: options.desktopMediaRequestId,
      ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
      ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
    },
  });
}
