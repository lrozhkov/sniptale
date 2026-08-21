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
  encoderFrameCrop: { x: number; y: number; width: number; height: number } | null;
  cursorCaptureMode: VideoCursorCaptureMode | null;
  rawTrackSettings: MediaTrackSettings;
  rawVideoHeight: number;
  rawVideoWidth: number;
  tabOutputGeometry: TabOutputGeometry | null;
  trackSettings: MediaTrackSettings;
  transformFailure: Promise<never> | null;
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
  encoderFrameCrop: { x: number; y: number; width: number; height: number } | null;
  transformFailure: Promise<never> | null;
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
      encoderFrameCrop: tabOutput.encoderFrameCrop ?? null,
      transformFailure: tabOutput.failure ?? null,
    };
  }
  if (params.captureMode === CaptureMode.CAMERA) {
    const fixedOutput = await createFixedOutputStream(source, params.settings);
    return {
      frameRate: fixedOutput.frameRate,
      outputSize: fixedOutput.outputSize,
      stream: fixedOutput.stream,
      tabOutputGeometry: null,
      encoderFrameCrop: null,
      transformFailure: fixedOutput.failure,
    };
  }
  const fixedOutput = await createFixedOutputStream(source, params.settings);
  return {
    frameRate: fixedOutput.frameRate,
    outputSize: fixedOutput.outputSize,
    stream: fixedOutput.stream,
    tabOutputGeometry: null,
    encoderFrameCrop: null,
    transformFailure: fixedOutput.failure,
  };
}

async function createFixedOutputStream(
  source: MediaStream,
  settings: VideoRecordingSettings
): Promise<{
  failure: Promise<never>;
  frameRate: number;
  outputSize: VideoOutputDimensions;
  stream: MediaStream;
}> {
  const fixedOutput = await createFixedVideoOutputStream(source, settings, {
    frameRate: resolveVideoRecordingFrameRate(settings),
    includeSourceAudio: true,
    sourceOwnership: 'caller',
  });
  return {
    failure: fixedOutput.failure,
    frameRate: fixedOutput.frameRate,
    outputSize: fixedOutput.dimensions,
    stream: fixedOutput.stream,
  };
}

function assertEncoderInputSettings(
  track: MediaStreamTrack,
  expectedSize: VideoOutputDimensions,
  expectedFrameRate: number,
  options: { allowSourceCrop?: boolean } = {}
): MediaTrackSettings {
  const applied = track.getSettings();
  if (
    !options.allowSourceCrop &&
    (applied.width !== expectedSize.width || applied.height !== expectedSize.height)
  ) {
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
  return {
    ...applied,
    frameRate,
    ...(options.allowSourceCrop ? expectedSize : {}),
  };
}

function assertTabSourceGeometry(
  params: RecordingSetupParams,
  raw: { width: number; height: number }
): {
  expectedPhysicalSize: { width: number; height: number } | null;
  fidelity: 'not-tab' | 'native-grid' | 'chromium-even-grid';
} {
  if (params.captureMode !== CaptureMode.TAB && params.captureMode !== CaptureMode.TAB_CROP) {
    return { expectedPhysicalSize: null, fidelity: 'not-tab' };
  }
  if (!params.viewport) {
    if (params.captureMode === CaptureMode.TAB_CROP && params.cropRegion) {
      throw new Error('TAB_CROP viewport geometry is unavailable');
    }
    throw new Error('source-dimensions-mismatch: tab viewport geometry is unavailable');
  }
  const { devicePixelRatio, height: viewportHeight, width: viewportWidth } = params.viewport;
  if (
    typeof devicePixelRatio !== 'number' ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0 ||
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    !Number.isSafeInteger(raw.width) ||
    !Number.isSafeInteger(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  ) {
    throw new Error('source-dimensions-mismatch: tab source geometry is invalid');
  }
  const expectedWidth = Math.round(viewportWidth * devicePixelRatio);
  const expectedHeight = Math.round(viewportHeight * devicePixelRatio);
  if (
    !Number.isSafeInteger(expectedWidth) ||
    !Number.isSafeInteger(expectedHeight) ||
    expectedWidth <= 0 ||
    expectedHeight <= 0
  ) {
    throw new Error('source-dimensions-mismatch: tab viewport geometry is invalid');
  }
  const requestedWidth = expectedWidth - (expectedWidth % 2);
  const requestedHeight = expectedHeight - (expectedHeight % 2);
  const matchesNativeGrid = raw.width === expectedWidth && raw.height === expectedHeight;
  const matchesChromiumEvenGrid = raw.width === requestedWidth && raw.height === requestedHeight;
  if (!matchesNativeGrid && !matchesChromiumEvenGrid) {
    throw new Error(
      `source-dimensions-mismatch: expected TAB source ${expectedWidth}x${expectedHeight} ` +
        `or encoder-safe ${requestedWidth}x${requestedHeight}, ` +
        `received ${raw.width}x${raw.height}`
    );
  }
  return {
    expectedPhysicalSize: { height: expectedHeight, width: expectedWidth },
    fidelity: matchesNativeGrid ? 'native-grid' : 'chromium-even-grid',
  };
}

function assertTabSourceFrameRate(
  params: RecordingSetupParams,
  trackSettings: MediaTrackSettings
): void {
  if (params.captureMode !== CaptureMode.TAB && params.captureMode !== CaptureMode.TAB_CROP) return;
  const actualFrameRate = trackSettings.frameRate;
  if (actualFrameRate === undefined) return;
  const requestedFrameRate = resolveVideoRecordingFrameRate(params.settings);
  if (
    !Number.isFinite(actualFrameRate) ||
    actualFrameRate <= 0 ||
    Math.abs(actualFrameRate - requestedFrameRate) > 0.01
  ) {
    throw new Error(
      `source-frame-rate-mismatch: expected TAB source ${requestedFrameRate} FPS, ` +
        `received ${actualFrameRate}`
    );
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
  const tabSourceGeometry = assertTabSourceGeometry(params, raw);
  assertTabSourceFrameRate(params, raw.trackSettings);
  const output = await createOutputVideoStream(sourceStream, params, {
    height: raw.height,
    width: raw.width,
  });
  const outputTrack = output.stream.getVideoTracks()[0];
  if (!outputTrack) throw new Error('Recording output is missing a video track');
  const outputTrackSettings = assertEncoderInputSettings(
    outputTrack,
    output.outputSize,
    output.frameRate,
    { allowSourceCrop: output.encoderFrameCrop !== null }
  );
  const pipeline =
    output.encoderFrameCrop !== null
      ? 'source-encoder-crop'
      : output.stream === sourceStream
        ? 'source-pass-through'
        : 'single-canvas-transform';
  const pipelineDiagnostic = {
    captureMode: params.captureMode ?? null,
    encoderFrameCrop: output.encoderFrameCrop,
    outputFrameRate: outputTrackSettings.frameRate ?? output.frameRate,
    outputSize: output.outputSize,
    pipeline,
    rawFrameRate: raw.trackSettings.frameRate ?? null,
    rawSize: { height: raw.height, width: raw.width },
    requestedFrameRate: resolveVideoRecordingFrameRate(params.settings),
    sourceFidelity: tabSourceGeometry.fidelity,
    viewportPhysicalSize: tabSourceGeometry.expectedPhysicalSize,
  };
  logger.info(`TAB_RECORDING_DIAGNOSTIC pipeline ${JSON.stringify(pipelineDiagnostic)}`);
  logger.debug('Resolved recording video pipeline', pipelineDiagnostic);
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
    encoderFrameCrop: output.encoderFrameCrop,
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
    transformFailure: output.transformFailure,
  };
}
