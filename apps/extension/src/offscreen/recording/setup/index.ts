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
import { createRecordingGeometryPlan } from '../geometry/plan';
import { resolveAspectMatchedSourceFrame } from '../geometry/contain-frame';
import type { LiveVideoFrameTransform } from '../encoding/live-artifact-session';

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
  encoderFrameTransform: LiveVideoFrameTransform | null;
  cursorCaptureMode: VideoCursorCaptureMode | null;
  rawTrackSettings: MediaTrackSettings;
  rawVideoHeight: number;
  rawVideoWidth: number;
  sourceLabel: string | null;
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
  encoderFrameTransform: LiveVideoFrameTransform | null;
  transformFailure: Promise<never> | null;
}> {
  const frameRate = resolveVideoRecordingFrameRate(params.settings);
  if (params.captureMode === CaptureMode.TAB || params.captureMode === CaptureMode.TAB_CROP) {
    return createTabOutputVideoStream(source, params, raw, frameRate);
  }
  if (params.captureMode === CaptureMode.CAMERA) {
    const fixedOutput = await createFixedOutputStream(source, params.settings);
    return {
      frameRate: fixedOutput.frameRate,
      outputSize: fixedOutput.outputSize,
      stream: fixedOutput.stream,
      tabOutputGeometry: null,
      encoderFrameTransform: null,
      transformFailure: fixedOutput.failure,
    };
  }
  const outputProfile = resolveVideoOutputProfile(params.settings);
  const geometry = createRecordingGeometryPlan({
    frameRateCap: outputProfile.frameRate,
    outputBasis: raw,
    presetScaleMode: 'avoid-upscale',
    resolution: outputProfile.resolution,
    sourceRect: { x: 0, y: 0, ...raw },
  });
  const sourceRect = resolveAspectMatchedSourceFrame(geometry.sourceRect, geometry.outputSize);
  const requiresTransform =
    sourceRect.x !== 0 ||
    sourceRect.y !== 0 ||
    sourceRect.width !== raw.width ||
    sourceRect.height !== raw.height ||
    geometry.outputSize.width !== raw.width ||
    geometry.outputSize.height !== raw.height;
  return {
    frameRate,
    outputSize: geometry.outputSize,
    stream: source,
    tabOutputGeometry: null,
    encoderFrameTransform: requiresTransform
      ? { fit: 'fill', outputSize: geometry.outputSize, sourceRect }
      : null,
    transformFailure: null,
  };
}

async function createTabOutputVideoStream(
  source: MediaStream,
  params: RecordingSetupParams,
  raw: { width: number; height: number },
  frameRate: number
): ReturnType<typeof createOutputVideoStream> {
  if (params.captureMode === CaptureMode.TAB_CROP && !params.viewport) {
    throw new Error('Tab recording viewport geometry is unavailable');
  }
  if (params.viewport && !params.viewport.devicePixelRatio) {
    throw new Error('Tab recording viewport density is unavailable');
  }
  const coordinateSpace = {
    width: params.viewport?.width ?? raw.width,
    height: params.viewport?.height ?? raw.height,
    devicePixelRatio: params.viewport?.devicePixelRatio ?? 1,
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
    encoderFrameTransform: tabOutput.frameTransform ?? null,
    transformFailure: null,
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
  options: { allowEncoderTransform?: boolean } = {}
): MediaTrackSettings {
  const applied = track.getSettings();
  if (
    !options.allowEncoderTransform &&
    (applied.width !== expectedSize.width || applied.height !== expectedSize.height)
  ) {
    throw new Error(
      `Recording output geometry is invalid: expected ${expectedSize.width}x${expectedSize.height}, ` +
        `received ${applied.width ?? 'unknown'}x${applied.height ?? 'unknown'}`
    );
  }
  const appliedFrameRate = applied.frameRate;
  if (
    appliedFrameRate !== undefined &&
    appliedFrameRate !== 0 &&
    (!Number.isFinite(appliedFrameRate) || appliedFrameRate < 0)
  ) {
    throw new Error(
      `Recording output frame rate is invalid: expected non-negative finite metadata, ` +
        `received ${appliedFrameRate ?? 'unknown'}`
    );
  }
  return {
    ...applied,
    frameRate: expectedFrameRate,
    ...(options.allowEncoderTransform ? expectedSize : {}),
  };
}

function assertTabSourceGeometry(
  params: RecordingSetupParams,
  raw: { width: number; height: number }
): {
  expectedPhysicalSize: { width: number; height: number } | null;
  fidelity: 'not-tab' | 'native-grid' | 'chromium-even-grid' | 'source-measured';
} {
  if (params.captureMode !== CaptureMode.TAB && params.captureMode !== CaptureMode.TAB_CROP) {
    return { expectedPhysicalSize: null, fidelity: 'not-tab' };
  }
  assertPositiveTabSourceSize(raw);
  const expected = resolveExpectedTabSourceSize(params);
  if (!expected) return { expectedPhysicalSize: null, fidelity: 'source-measured' };

  const requestedWidth = expected.width - (expected.width % 2);
  const requestedHeight = expected.height - (expected.height % 2);
  const matchesNativeGrid = raw.width === expected.width && raw.height === expected.height;
  const matchesChromiumEvenGrid = raw.width === requestedWidth && raw.height === requestedHeight;
  if (params.captureMode === CaptureMode.TAB && !matchesNativeGrid && !matchesChromiumEvenGrid) {
    return { expectedPhysicalSize: expected, fidelity: 'source-measured' };
  }
  if (!matchesNativeGrid && !matchesChromiumEvenGrid) {
    throw new Error(
      `source-dimensions-mismatch: expected TAB source ${expected.width}x${expected.height} ` +
        `or encoder-safe ${requestedWidth}x${requestedHeight}, ` +
        `received ${raw.width}x${raw.height}`
    );
  }
  return {
    expectedPhysicalSize: expected,
    fidelity: matchesNativeGrid ? 'native-grid' : 'chromium-even-grid',
  };
}

function assertPositiveTabSourceSize(raw: { width: number; height: number }): void {
  if (
    !Number.isFinite(raw.width) ||
    !Number.isFinite(raw.height) ||
    !Number.isSafeInteger(raw.width) ||
    !Number.isSafeInteger(raw.height) ||
    raw.width <= 0 ||
    raw.height <= 0
  ) {
    throw new Error('source-dimensions-mismatch: tab source geometry is invalid');
  }
}

function resolveExpectedTabSourceSize(
  params: RecordingSetupParams
): { width: number; height: number } | null {
  const viewport = resolveValidTabViewport(params);
  if (!viewport) return null;
  const expectedWidth = Math.round(viewport.width * viewport.devicePixelRatio);
  const expectedHeight = Math.round(viewport.height * viewport.devicePixelRatio);
  if (
    !Number.isSafeInteger(expectedWidth) ||
    !Number.isSafeInteger(expectedHeight) ||
    expectedWidth <= 0 ||
    expectedHeight <= 0
  ) {
    throw new Error('source-dimensions-mismatch: tab viewport geometry is invalid');
  }
  return { height: expectedHeight, width: expectedWidth };
}

function resolveValidTabViewport(
  params: RecordingSetupParams
): { devicePixelRatio: number; height: number; width: number } | null {
  if (!params.viewport) {
    if (params.captureMode === CaptureMode.TAB_CROP && params.cropRegion) {
      throw new Error('TAB_CROP viewport geometry is unavailable');
    }
    return null;
  }
  const { devicePixelRatio, height, width } = params.viewport;
  if (
    typeof devicePixelRatio === 'number' &&
    Number.isFinite(devicePixelRatio) &&
    devicePixelRatio > 0 &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return { devicePixelRatio, height, width };
  }
  if (params.captureMode === CaptureMode.TAB_CROP) {
    throw new Error('source-dimensions-mismatch: tab viewport geometry is invalid');
  }
  return null;
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

function createPipelineDiagnostic(
  params: RecordingSetupParams,
  raw: { height: number; trackSettings: MediaTrackSettings; width: number },
  output: Awaited<ReturnType<typeof createOutputVideoStream>>,
  tabSourceGeometry: ReturnType<typeof assertTabSourceGeometry>
) {
  const pipeline =
    output.encoderFrameTransform !== null ? 'source-encoder-transform' : 'source-pass-through';
  return {
    captureMode: params.captureMode ?? null,
    encoderFrameTransform: output.encoderFrameTransform,
    outputSize: output.outputSize,
    pipeline,
    reportedSourceFrameRate: raw.trackSettings.frameRate ?? null,
    rawSize: { height: raw.height, width: raw.width },
    requestedFrameRate: resolveVideoRecordingFrameRate(params.settings),
    sourceFidelity: tabSourceGeometry.fidelity,
    viewportPhysicalSize: tabSourceGeometry.expectedPhysicalSize,
  };
}

async function attachRecordingAudio(params: RecordingSetupParams): Promise<void> {
  if (params.captureMode === CaptureMode.TAB || params.captureMode === CaptureMode.TAB_CROP) {
    await prepareStableTabRecordingAudio(params.settings);
    return;
  }
  await attachMicrophoneAudioIfEnabled(params.settings);
}

function resolveRecordingContentHint(
  captureMode: RecordingSetupParams['captureMode']
): 'detail' | 'motion' | 'text' {
  if (captureMode === CaptureMode.CAMERA) return 'motion';
  if (
    captureMode === CaptureMode.SCREEN ||
    captureMode === CaptureMode.TAB ||
    captureMode === CaptureMode.TAB_CROP
  ) {
    return 'text';
  }
  return 'detail';
}

export async function prepareRecordingStream(
  params: RecordingSetupParams
): Promise<RecordingSetupResult> {
  const {
    stream: sourceStream,
    cursorCaptureMode,
    sourceLabel,
  } = await acquireRecordingSourceStream({
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
    { allowEncoderTransform: output.encoderFrameTransform !== null }
  );
  const pipelineDiagnostic = createPipelineDiagnostic(params, raw, output, tabSourceGeometry);
  logger.info(`TAB_RECORDING_DIAGNOSTIC pipeline ${JSON.stringify(pipelineDiagnostic)}`);
  logger.debug('Resolved recording video pipeline', pipelineDiagnostic);
  recordingContext.videoStream = output.stream;
  await attachRecordingAudio(params);
  applyVideoTrackContentHint(outputTrack, resolveRecordingContentHint(params.captureMode));
  return {
    encoderFrameTransform: output.encoderFrameTransform,
    cursorCaptureMode,
    rawTrackSettings: raw.trackSettings,
    rawVideoHeight: raw.height,
    rawVideoWidth: raw.width,
    sourceLabel,
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
