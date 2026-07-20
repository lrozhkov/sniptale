import { vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectExportSettings,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import type { ExportJobState } from '../../types';
import type { renderAcceleratedCompositeWebmSpan } from './webm';

type EncoderEncode = (frame: VideoFrame, options?: VideoEncoderEncodeOptions) => void;
type EncoderEncodeMock = ReturnType<typeof vi.fn<EncoderEncode>>;
type PipelineFailureMock = ReturnType<typeof vi.fn<() => void>>;
type TestVideoEncoder = Omit<VideoEncoder, 'encode'> & { encode: EncoderEncodeMock };

type TestWebmSpanArgs = Omit<
  Parameters<typeof renderAcceleratedCompositeWebmSpan>[0],
  'throwIfPipelineFailed' | 'videoEncoder'
> & {
  throwIfPipelineFailed: PipelineFailureMock;
  videoEncoder: TestVideoEncoder;
};

export function createArgs(): TestWebmSpanArgs {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Expected test canvas context.');
  }
  return {
    canvas,
    context,
    job: createJob(),
    loadedImages: {},
    project: createProject(),
    settings: createSettings(),
    span: {
      end: 1,
      kind: 'accelerated-composite',
      reason: 'webm-frame-provider',
      start: 0,
    },
    throwIfPipelineFailed: vi.fn<() => void>(),
    videoEncoder: createVideoEncoder(),
  };
}

function createJob(): ExportJobState {
  return {
    assetUrls: [],
    audioContext: null,
    audioDestination: null,
    cancelled: false,
    cleanupNode: null,
    clipAudioNodes: new Map(),
    clipMediaElements: new Map(),
    exportAbortController: null,
    exportAudioSettings: null,
    exportStream: null,
    jobId: 'job-1',
    mediaRecorder: null,
  };
}

function createProject(): VideoProject {
  const project = createEmptyVideoProject('WebM export project', 1280, 720);
  const trackId = project.tracks[0]!.id;
  project.assets = [
    {
      createdAt: 1,
      id: 'asset-1',
      metadata: {
        audioPeaks: null,
        duration: 1,
        hasAudio: false,
        height: 720,
        mimeType: 'video/webm',
        size: 3,
        width: 1280,
      },
      name: 'asset-1',
      source: { kind: 'project-asset', projectAssetId: 'asset-1' },
      type: VideoProjectAssetType.VIDEO,
    },
  ];
  project.clips = [createVideoClip(trackId)];
  return project;
}

function createVideoClip(trackId: string): VideoProjectVideoClip {
  return {
    assetId: 'asset-1',
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-1',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'clip-1',
    sourceDuration: 1,
    sourceStart: 0,
    startTime: 0,
    trackId,
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

function createSettings(): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 2,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
  };
}

function createVideoEncoder(): TestVideoEncoder {
  return Object.assign(new EventTarget(), {
    close: vi.fn<() => void>(),
    configure: vi.fn<(config: VideoEncoderConfig) => void>(),
    encode: vi.fn<EncoderEncode>(),
    encodeQueueSize: 0,
    flush: vi.fn<() => Promise<void>>(async () => undefined),
    ondequeue: null,
    onerror: null,
    reset: vi.fn<() => void>(),
    state: 'configured' as CodecState,
  });
}
