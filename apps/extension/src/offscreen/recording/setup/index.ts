import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import {
  createCropStream,
  type CropStreamControls,
  type CropStreamGeometry,
} from '../stream/crop-stream';
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
import { attachMicrophoneAudioIfEnabled } from './video';
import {
  applyVideoTrackContentHint,
  resolveVideoRecordingFrameRate,
} from '../../../platform/media-utils/video-recording';
import {
  resolveVideoOutputDimensions,
  resolveVideoRecordingOutputSettings,
  VideoResolutionPreset,
  type VideoOutputDimensions,
} from '@sniptale/runtime-contracts/video/types/types';

type RecordingSetupParams = {
  streamId: string;
  settings: VideoRecordingSettings;
  captureMode?: CaptureMode;
  cropRegion?: { x: number; y: number; width: number; height: number };
  viewport?: { width: number; height: number; devicePixelRatio?: number };
  surface?: { presetId: string; target: 'viewport' | 'window'; width: number; height: number };
};

export type RecordingSetupResult = {
  cursorCaptureMode: VideoCursorCaptureMode | null;
  rawTrackSettings: MediaTrackSettings;
  rawVideoHeight: number;
  rawVideoWidth: number;
  tabOutputControls: CropStreamControls | null;
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
  controls: CropStreamControls | null;
  outputSize: VideoOutputDimensions;
  stream: MediaStream;
  tabOutputGeometry: TabOutputGeometry | null;
}> {
  const requiresTabCanvas =
    params.captureMode === CaptureMode.TAB_CROP || params.surface?.target === 'viewport';
  const frameRate = resolveVideoRecordingFrameRate(params.settings);
  if (params.captureMode === CaptureMode.TAB && !requiresTabCanvas) {
    if (!params.viewport) throw new Error('Tab recording viewport geometry is unavailable');
    const fixedOutput = await createFixedOutputStream(source, raw, params.settings, {
      height: params.viewport.height,
      width: params.viewport.width,
    });
    return {
      controls: null,
      outputSize: fixedOutput.outputSize,
      stream: fixedOutput.stream,
      tabOutputGeometry: null,
    };
  }
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
    const baseGeometry = resolveTabOutputGeometry(
      requestedCrop,
      { width: raw.width, height: raw.height },
      coordinateSpace
    );
    const outputProfile = resolveVideoRecordingOutputSettings(params.settings);
    const tabOutputGeometry = {
      ...baseGeometry,
      outputSize: resolveVideoOutputDimensions(
        baseGeometry.sourceRect.width,
        baseGeometry.sourceRect.height,
        outputProfile.resolution
      ),
    };
    const tabOutput = await createTabOutputStream(source, tabOutputGeometry, {
      frameRate,
      initiallySuspended: params.surface?.target === 'viewport',
    });
    return {
      controls:
        params.captureMode === CaptureMode.TAB_CROP || params.surface?.target === 'viewport'
          ? tabOutput.controls
          : null,
      outputSize: tabOutputGeometry.outputSize,
      stream: tabOutput.stream,
      tabOutputGeometry,
    };
  }
  if (params.captureMode === CaptureMode.CAMERA) {
    const fixedOutput = await createFixedOutputStream(source, raw, params.settings);
    return {
      controls: null,
      outputSize: fixedOutput.outputSize,
      stream: fixedOutput.stream,
      tabOutputGeometry: null,
    };
  }
  const fixedOutput = await createFixedOutputStream(source, raw, params.settings);
  return {
    controls: null,
    outputSize: fixedOutput.outputSize,
    stream: fixedOutput.stream,
    tabOutputGeometry: null,
  };
}

function resolveFixedOutputGeometry(
  raw: { width: number; height: number },
  settings: VideoRecordingSettings,
  outputReference: { width: number; height: number } = raw
): CropStreamGeometry {
  const output = resolveVideoRecordingOutputSettings(settings);
  const outputSize = resolveVideoOutputDimensions(
    outputReference.width,
    outputReference.height,
    output.resolution
  );
  return {
    outputSize,
    sourceRect: { x: 0, y: 0, width: raw.width, height: raw.height },
  };
}

async function createFixedOutputStream(
  source: MediaStream,
  raw: { width: number; height: number },
  settings: VideoRecordingSettings,
  logicalSourceSize?: { width: number; height: number }
): Promise<{ outputSize: VideoOutputDimensions; stream: MediaStream }> {
  const geometry = resolveFixedOutputGeometry(raw, settings, logicalSourceSize ?? raw);
  const output = resolveVideoRecordingOutputSettings(settings);
  return {
    outputSize: geometry.outputSize,
    stream: await createCropStream(source, geometry, {
      ...(output.resolution === VideoResolutionPreset.SOURCE ? { cropOddSourceEdges: true } : {}),
      dynamicSourceFit: true,
      frameRate: resolveVideoRecordingFrameRate(settings),
      ...(logicalSourceSize === undefined ? {} : { logicalSourceSize }),
    }),
  };
}

function assertEncoderInputSettings(
  track: MediaStreamTrack,
  expectedSize: VideoOutputDimensions,
  maximumFrameRate: number
): MediaTrackSettings {
  const applied = track.getSettings();
  if (applied.width !== expectedSize.width || applied.height !== expectedSize.height) {
    throw new Error(
      `Recording output geometry is invalid: expected ${expectedSize.width}x${expectedSize.height}, ` +
        `received ${applied.width ?? 'unknown'}x${applied.height ?? 'unknown'}`
    );
  }
  if (
    typeof applied.frameRate !== 'number' ||
    !Number.isFinite(applied.frameRate) ||
    applied.frameRate <= 0 ||
    applied.frameRate > maximumFrameRate
  ) {
    throw new Error(
      `Recording output frame rate is invalid: expected at most ${maximumFrameRate}, ` +
        `received ${applied.frameRate ?? 'unknown'}`
    );
  }
  return applied;
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
  if (
    params.surface?.target === 'viewport' &&
    (params.viewport.width !== params.surface.width ||
      params.viewport.height !== params.surface.height)
  ) {
    throw new Error('source-dimensions-mismatch: applied viewport geometry is unavailable');
  }
}

export async function prepareRecordingStream(
  params: RecordingSetupParams
): Promise<RecordingSetupResult> {
  const { stream: sourceStream, cursorCaptureMode } = await acquireRecordingSourceStream({
    streamId: params.streamId,
    settings: params.settings,
    ...(params.surface?.target === 'viewport' ? { excludeNativeCursor: true } : {}),
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
    ...(params.viewport === undefined
      ? {}
      : { viewport: { height: params.viewport.height, width: params.viewport.width } }),
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
    resolveVideoRecordingFrameRate(params.settings)
  );
  recordingContext.videoStream = output.stream;
  await attachMicrophoneAudioIfEnabled(params.settings);
  applyVideoTrackContentHint(
    outputTrack,
    params.captureMode === CaptureMode.CAMERA ? 'motion' : 'detail'
  );
  return {
    cursorCaptureMode,
    rawTrackSettings: raw.trackSettings,
    rawVideoHeight: raw.height,
    rawVideoWidth: raw.width,
    tabOutputControls: output.controls,
    tabOutputGeometry: output.tabOutputGeometry,
    trackSettings: {
      ...outputTrackSettings,
      ...(raw.trackSettings.displaySurface === undefined
        ? {}
        : { displaySurface: raw.trackSettings.displaySurface }),
    },
  };
}
