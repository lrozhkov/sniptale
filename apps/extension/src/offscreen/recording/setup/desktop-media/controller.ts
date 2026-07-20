import { createLogger } from '@sniptale/platform/observability/logger';
import { normalizeDisplayMediaLabel } from '../../../../platform/i18n/display-media-label';
import type { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { sendRuntimeMessageBestEffort } from '../../../runtime-messaging/best-effort';
import { createDesktopPreviewController } from '../../stream';
import { acquireDesktopStream } from './acquire';
import { handleDesktopMediaRequestFailure } from './failure';
import type { DesktopMediaRequestOptions } from './types';

const logger = createLogger({ namespace: 'OffscreenDesktopMedia' });

/**
 * Owns cached desktop-media selection state for a single offscreen runtime instance.
 */
type DesktopMediaState = {
  cachedDesktopStream: MediaStream | null;
  cachedDesktopLabel: string | null;
  cachedDesktopPreviewVideo: HTMLVideoElement | null;
  multiSourceStreams: Array<{ label: string | null; stream: MediaStream }>;
  multiSourcePreviewVideos: HTMLVideoElement[];
};

function normalizeDesktopMediaRequestOptions(options: DesktopMediaRequestOptions) {
  return {
    desktopMediaRequestGeneration: options.desktopMediaRequestGeneration,
    desktopMediaRequestId: options.desktopMediaRequestId,
    ...(options.controlledCursorCaptureEnabled === undefined
      ? {}
      : { controlledCursorCaptureEnabled: options.controlledCursorCaptureEnabled }),
    ...(options.desktopLabel === undefined ? {} : { desktopLabel: options.desktopLabel }),
    ...(options.desktopStreamId === undefined ? {} : { desktopStreamId: options.desktopStreamId }),
    ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
    ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
  };
}

function detachPreview(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState
): void {
  if (!state.cachedDesktopPreviewVideo) {
    return;
  }

  desktopPreviewController.detachDesktopPreview(state.cachedDesktopPreviewVideo);
  state.cachedDesktopPreviewVideo = null;
}

function disposeCachedDesktopMedia(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState
): void {
  state.cachedDesktopStream?.getTracks().forEach((track) => track.stop());
  state.cachedDesktopStream = null;
  state.cachedDesktopLabel = null;
  detachPreview(desktopPreviewController, state);
}

function disposeMultiSourceDesktopMedia(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState
): void {
  state.multiSourceStreams.forEach((source) =>
    source.stream.getTracks().forEach((track) => track.stop())
  );
  state.multiSourceStreams = [];
  state.multiSourcePreviewVideos.forEach((video) =>
    desktopPreviewController.detachDesktopPreview(video)
  );
  state.multiSourcePreviewVideos = [];
}

function cacheDesktopStreamForRequest(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState,
  stream: MediaStream,
  label: string | null,
  options: DesktopMediaRequestOptions
): void {
  const sourceCount = options.sourceCount ?? 1;
  if (sourceCount <= 1) {
    disposeCachedDesktopMedia(desktopPreviewController, state);
    disposeMultiSourceDesktopMedia(desktopPreviewController, state);
    state.cachedDesktopStream = stream;
    state.cachedDesktopPreviewVideo = desktopPreviewController.attachDesktopPreview(stream);
    state.cachedDesktopLabel = label;
    return;
  }

  if ((options.sourceIndex ?? 0) === 0) {
    disposeCachedDesktopMedia(desktopPreviewController, state);
    disposeMultiSourceDesktopMedia(desktopPreviewController, state);
  }

  state.multiSourceStreams.push({ stream, label });
  state.multiSourcePreviewVideos.push(desktopPreviewController.attachDesktopPreview(stream));
}

async function requestDesktopMediaForState(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState,
  captureMode: CaptureMode,
  options: DesktopMediaRequestOptions
): Promise<void> {
  try {
    const stream = await acquireDesktopStream(options);

    const rawLabel = options.desktopLabel ?? stream.getVideoTracks()[0]?.label ?? '';
    const label = normalizeDisplayMediaLabel(rawLabel, captureMode);
    cacheDesktopStreamForRequest(desktopPreviewController, state, stream, label, options);

    sendRuntimeMessageBestEffort({
      context: {
        captureMode,
        label: label ?? '',
      },
      logger,
      logMessage: 'Failed to notify runtime about obtained desktop media',
      payload: {
        type: VideoMessageType.DESKTOP_MEDIA_OBTAINED,
        desktopMediaRequestGeneration: options.desktopMediaRequestGeneration,
        desktopMediaRequestId: options.desktopMediaRequestId,
        label,
        ...(options.sourceCount === undefined ? {} : { sourceCount: options.sourceCount }),
        ...(options.sourceIndex === undefined ? {} : { sourceIndex: options.sourceIndex }),
      },
    });
  } catch (error) {
    handleDesktopMediaRequestFailure({
      captureMode,
      disposeCachedDesktopMedia: () => disposeCachedDesktopMedia(desktopPreviewController, state),
      disposeMultiSourceDesktopMedia: () =>
        disposeMultiSourceDesktopMedia(desktopPreviewController, state),
      error,
      logger,
      options,
    });
  }
}

function consumeDesktopStreamForState(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState
): { stream: MediaStream | null; label: string | null } {
  const result = {
    stream: state.cachedDesktopStream,
    label: state.cachedDesktopLabel,
  };

  state.cachedDesktopStream = null;
  state.cachedDesktopLabel = null;
  detachPreview(desktopPreviewController, state);

  return result;
}

function consumeDesktopStreamsForState(
  desktopPreviewController: ReturnType<typeof createDesktopPreviewController>,
  state: DesktopMediaState
): Array<{ label: string | null; stream: MediaStream }> {
  const result = state.multiSourceStreams;
  state.multiSourceStreams = [];
  state.multiSourcePreviewVideos.forEach((video) =>
    desktopPreviewController.detachDesktopPreview(video)
  );
  state.multiSourcePreviewVideos = [];
  return result;
}

export function createOffscreenDesktopMediaController() {
  const desktopPreviewController = createDesktopPreviewController();
  const state: DesktopMediaState = {
    cachedDesktopStream: null,
    cachedDesktopLabel: null,
    cachedDesktopPreviewVideo: null,
    multiSourceStreams: [],
    multiSourcePreviewVideos: [],
  };

  return {
    requestDesktopMedia(captureMode: CaptureMode, options: DesktopMediaRequestOptions) {
      const resolvedOptions = normalizeDesktopMediaRequestOptions(options);
      return requestDesktopMediaForState(
        desktopPreviewController,
        state,
        captureMode,
        resolvedOptions
      );
    },
    consumeDesktopStream() {
      return consumeDesktopStreamForState(desktopPreviewController, state);
    },
    consumeDesktopStreams() {
      return consumeDesktopStreamsForState(desktopPreviewController, state);
    },
    detachCachedPreview() {
      detachPreview(desktopPreviewController, state);
    },
    disposeMultiSourceDesktopMedia() {
      disposeMultiSourceDesktopMedia(desktopPreviewController, state);
    },
  };
}
