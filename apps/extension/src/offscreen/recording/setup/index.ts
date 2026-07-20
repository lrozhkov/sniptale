import { recordingContext } from '../context';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { appendRecordingViewportParams } from '../params';
import { acquireRecordingSourceStream, resolveCaptureDimensions } from './capture';
import { attachMicrophoneAudioIfEnabled, createRecordingVideoStream } from './video';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

type RecordingSetupParams = {
  streamId: string;
  settings: VideoRecordingSettings;
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  targetResolution?: { width: number; height: number };
  emulatedViewportCssSize?: { width: number; height: number };
};

type RecordingSetupResult = {
  captureWidth?: number;
  captureHeight?: number;
  cursorCaptureMode: VideoCursorCaptureMode | null;
  trackSettings: MediaTrackSettings;
};

export async function prepareRecordingStream(
  params: RecordingSetupParams
): Promise<RecordingSetupResult> {
  const { streamId, settings, captureMode, targetResolution, emulatedViewportCssSize } = params;
  const { captureWidth, captureHeight } = resolveCaptureDimensions(params);
  const { stream: fullStream, cursorCaptureMode } = await acquireRecordingSourceStream({
    streamId,
    settings,
    ...(captureMode === undefined ? {} : { captureMode }),
    ...(captureWidth === undefined ? {} : { captureWidth }),
    ...(captureHeight === undefined ? {} : { captureHeight }),
  });
  recordingContext.sourceStream = fullStream;
  recordingContext.videoStream = await createRecordingVideoStream(
    appendRecordingViewportParams(
      {
        fullStream,
        settings,
      },
      params
    )
  );
  await attachMicrophoneAudioIfEnabled(settings);

  const [videoTrack] = recordingContext.videoStream?.getVideoTracks() ?? [];
  if (!videoTrack) {
    throw new Error('Recording stream is missing a video track.');
  }

  const trackSettings = videoTrack.getSettings();

  if (captureMode === CaptureMode.VIEWPORT_EMULATION && targetResolution) {
    logger.debug('Viewport preset stream ready', {
      targetResolution,
      viewportSizeInPixels: emulatedViewportCssSize,
      trackSettingsWidth: trackSettings.width,
      trackSettingsHeight: trackSettings.height,
      trackSettingsFrameRate: trackSettings.frameRate,
    });
  }

  return {
    cursorCaptureMode,
    trackSettings,
    ...(captureWidth === undefined ? {} : { captureWidth }),
    ...(captureHeight === undefined ? {} : { captureHeight }),
  };
}
