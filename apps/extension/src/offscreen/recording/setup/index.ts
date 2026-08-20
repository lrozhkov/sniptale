import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  resolveVideoOutputProfile,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import {
  createTabOutputStream,
  resolveTabOutputGeometry,
  type TabOutputGeometry,
} from '../stream/tab-output';
import {
  createSourceVideo,
  releaseSourceVideo,
  waitForSourceMetadata,
} from '../stream/video-source';
import { acquireRecordingSourceStream } from './capture';
import { attachMicrophoneAudioIfEnabled, prepareStableTabRecordingAudio } from './video';
import { createFixedVideoOutputStream } from '../stream/fixed-video-output';
import {
  applyVideoTrackContentHint,
  resolveVideoRecordingFrameRate,
} from '../../../platform/media-utils/video-recording';
import type { VideoOutputDimensions } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'OffscreenRecordingSetup' });

type RecordingSetupParams = {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  surface?: { presetId: string; target: 'window'; width: number; height: number };
  sourceBinding?: { generation: number; recordingId: string; streamInstanceId: string };
};

export type RecordingSetupResult = {
  cursorCaptureMode: VideoCursorCaptureMode | null;
  rawTrackSettings: MediaTrackSettings;
  rawVideoHeight: number;
  rawVideoWidth: number;
  tabOutputGeometry: TabOutputGeometry | null;
  trackSettings: MediaTrackSettings;
};

async function readRawSource(stream: MediaStream) {
  const video = createSourceVideo(stream);
  try {
    await waitForSourceMetadata(video);
    const result = { width: video.videoWidth, height: video.videoHeight };
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Recording source is missing a video track');
    return { ...result, trackSettings: track.getSettings() };
  } finally {
    releaseSourceVideo(video);
  }
}

async function createOutputVideoStream(
  source: MediaStream,
  params: RecordingSetupParams,
  raw: { width: number; height: number }
): Promise<{
  frameRate: number;
  outputSize: VideoOutputDimensions;
  stream: MediaStream;
  tabOutputGeometry: TabOutputGeometry | null;
}> {
  const frameRate = resolveVideoRecordingFrameRate(params.settings);
  if (params.captureMode === CaptureMode.TAB || params.captureMode === CaptureMode.TAB_CROP) {
    if (!params.viewport) throw new Error('Tab recording viewport geometry is unavailable');
    if (!params.viewport.devicePixelRatio) {
      throw new Error('Tab recording viewport density is unavailable');
    }
    const coordinateSpace = {
      width: params.viewport.width,
      height: params.viewport.height,
      devicePixelRatio: params.viewport.devicePixelRatio,
    };
    const requestedCrop =
      params.captureMode === CaptureMode.TAB_CROP && params.cropRegion
        ? params.cropRegion
        : { x: 0, y: 0, width: coordinateSpace.width, height: coordinateSpace.height };
    const outputProfile = resolveVideoOutputProfile(params.settings);
    const tabOutputGeometry = resolveTabOutputGeometry(
      requestedCrop,
      { width: raw.width, height: raw.height },
      coordinateSpace,
      {
        frameRateCap: outputProfile.frameRate,
        resolution: outputProfile.resolution,
        tracksFullViewport: params.captureMode === CaptureMode.TAB,
      }
    );
    const tabOutput = await createTabOutputStream(source, tabOutputGeometry, { frameRate });
    return {
      frameRate: tabOutput.frameRate,
      outputSize: tabOutputGeometry.outputSize,
      stream: tabOutput.stream,
      tabOutputGeometry,
    };
  }
  if (params.captureMode === CaptureMode.CAMERA) {
    const fixedOutput = await createFixedOutputStream(source, params.settings);
    return {
      frameRate: fixedOutput.frameRate,
      outputSize: fixedOutput.outputSize,
      stream: fixedOutput.stream,
      tabOutputGeometry: null,
    };
  }
  const fixedOutput = await createFixedOutputStream(source, params.settings);
  return {
    frameRate: fixedOutput.frameRate,
    outputSize: fixedOutput.outputSize,
    stream: fixedOutput.stream,
    tabOutputGeometry: null,
  };
}

async function createFixedOutputStream(
  source: MediaStream,
  settings: VideoRecordingSettings
): Promise<{ frameRate: number; outputSize: VideoOutputDimensions; stream: MediaStream }> {
  const fixedOutput = await createFixedVideoOutputStream(source, settings, {
    frameRate: resolveVideoRecordingFrameRate(settings),
    includeSourceAudio: true,
    sourceOwnership: 'caller',
  });
  return {
    frameRate: fixedOutput.frameRate,
    outputSize: fixedOutput.dimensions,
    stream: fixedOutput.stream,
  };
}

function assertEncoderInputSettings(
  track: MediaStreamTrack,
  expectedSize: VideoOutputDimensions,
  expectedFrameRate: number
): MediaTrackSettings {
  const applied = track.getSettings();
  if (applied.width !== expectedSize.width || applied.height !== expectedSize.height) {
    throw new Error(
      `Recording output geometry is invalid: expected ${expectedSize.width}x${expectedSize.height}, ` +
        `received ${applied.width ?? 'unknown'}x${applied.height ?? 'unknown'}`
    );
  }
  const appliedFrameRate = applied.frameRate;
  // Manual CanvasCaptureMediaStreamTrack cadence is reported as 0 by Chromium even though
  // requestFrame() is driven at the resolved scheduler rate.
  const frameRate =
    typeof appliedFrameRate === 'number' && appliedFrameRate > 0
      ? appliedFrameRate
      : expectedFrameRate;
  if (
    typeof frameRate !== 'number' ||
    !Number.isFinite(frameRate) ||
    frameRate <= 0 ||
    frameRate > expectedFrameRate
  ) {
    throw new Error(
      `Recording output frame rate is invalid: expected at most ${expectedFrameRate}, ` +
        `received ${appliedFrameRate ?? 'unknown'}`
    );
  }
  return { ...applied, frameRate };
}

function assertTabSourceGeometry(
  params: RecordingSetupParams,
  raw: { width: number; height: number }
): void {
  if (params.captureMode !== CaptureMode.TAB && params.captureMode !== CaptureMode.TAB_CROP) {
    return;
  }
  if (!params.viewport) {
    if (params.captureMode === CaptureMode.TAB_CROP && params.cropRegion) {
      throw new Error('TAB_CROP viewport geometry is unavailable');
    }
    throw new Error('source-dimensions-mismatch: tab viewport geometry is unavailable');
  }
  if (
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  ) {
    throw new Error('source-dimensions-mismatch: tab source geometry is invalid');
  }
}

export async function prepareRecordingStream(
  params: RecordingSetupParams
): Promise<RecordingSetupResult> {
  const { stream: sourceStream, cursorCaptureMode } = await acquireRecordingSourceStream({
    streamId: params.streamId,
    settings: params.settings,
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
    ...(params.viewport === undefined ? {} : { viewport: params.viewport }),
  });
  recordingContext.sourceStream = sourceStream;
  const raw = await readRawSource(sourceStream);
  assertTabSourceGeometry(params, raw);
  const output = await createOutputVideoStream(sourceStream, params, {
    height: raw.height,
    width: raw.width,
  });
  const outputTrack = output.stream.getVideoTracks()[0];
  if (!outputTrack) throw new Error('Recording output is missing a video track');
  const outputTrackSettings = assertEncoderInputSettings(
    outputTrack,
    output.outputSize,
    output.frameRate
  );
  logger.debug('Resolved recording video pipeline', {
    captureMode: params.captureMode ?? null,
    outputFrameRate: outputTrackSettings.frameRate ?? output.frameRate,
    outputSize: output.outputSize,
    pipeline: output.stream === sourceStream ? 'source-pass-through' : 'single-canvas-transform',
    rawFrameRate: raw.trackSettings.frameRate ?? null,
    rawSize: { height: raw.height, width: raw.width },
    requestedFrameRate: resolveVideoRecordingFrameRate(params.settings),
  });
  recordingContext.videoStream = output.stream;
  if (params.captureMode === CaptureMode.TAB || params.captureMode === CaptureMode.TAB_CROP) {
    await prepareStableTabRecordingAudio(params.settings);
  } else {
    await attachMicrophoneAudioIfEnabled(params.settings);
  }
  applyVideoTrackContentHint(
    outputTrack,
    params.captureMode === CaptureMode.CAMERA
      ? 'motion'
      : params.captureMode === CaptureMode.TAB || params.captureMode === CaptureMode.TAB_CROP
        ? 'text'
        : 'detail'
  );
  return {
    cursorCaptureMode,
    rawTrackSettings: raw.trackSettings,
    rawVideoHeight: raw.height,
    rawVideoWidth: raw.width,
    tabOutputGeometry: output.tabOutputGeometry,
    trackSettings: {
      ...outputTrackSettings,
      ...(raw.trackSettings.displaySurface === undefined
        ? {}
        : { displaySurface: raw.trackSettings.displaySurface }),
    },
  };
}
