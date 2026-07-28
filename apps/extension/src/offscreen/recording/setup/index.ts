import type { VideoCursorCaptureMode } from '../../../features/video/project/types/interaction';
import {
  CaptureMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { recordingContext } from '../context';
import { createCropStream, resolveOnePixelEncodingCrop } from '../stream/crop-stream';
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
): Promise<{ stream: MediaStream; tabOutputGeometry: TabOutputGeometry | null }> {
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
    const tabOutputGeometry = resolveTabOutputGeometry(
      requestedCrop,
      { width: raw.width, height: raw.height },
      coordinateSpace
    );
    return {
      stream: await createTabOutputStream(source, tabOutputGeometry),
      tabOutputGeometry,
    };
  }
  if (params.captureMode !== undefined) return { stream: source, tabOutputGeometry: null };
  const encodingCrop = resolveOnePixelEncodingCrop(raw);
  return {
    stream: encodingCrop ? await createCropStream(source, encodingCrop) : source,
    tabOutputGeometry: null,
  };
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
    ...(params.captureMode === undefined ? {} : { captureMode: params.captureMode }),
  });
  recordingContext.sourceStream = sourceStream;
  const raw = await readRawSource(sourceStream);
  assertTabSourceGeometry(params, raw);
  const output = await createOutputVideoStream(sourceStream, params, raw);
  recordingContext.videoStream = output.stream;
  await attachMicrophoneAudioIfEnabled(params.settings);
  const outputTrack = recordingContext.videoStream?.getVideoTracks()[0];
  if (!outputTrack) throw new Error('Recording output is missing a video track');
  return {
    cursorCaptureMode,
    rawTrackSettings: raw.trackSettings,
    rawVideoHeight: raw.height,
    rawVideoWidth: raw.width,
    tabOutputGeometry: output.tabOutputGeometry,
    trackSettings: outputTrack.getSettings(),
  };
}
