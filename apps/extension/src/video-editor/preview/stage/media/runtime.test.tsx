// @vitest-environment jsdom

import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../../features/video/project/factories/creation';
import {
  type VideoProject,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  type VideoProjectVideoClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectAssetType,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { usePreviewStageMediaRuntime } from './runtime';
import { createVideoPreviewExactFrameCache } from '../../cache/exact-frame-cache';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createClipBase(trackId: string, overrides: Partial<VideoProjectClip> = {}) {
  return {
    id: 'clip-base',
    trackId,
    name: 'Clip',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 4,
    duration: 5,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    ...overrides,
  };
}

function createVideoClip(trackId: string, overrides: Partial<VideoProjectVideoClip> = {}) {
  return {
    ...createClipBase(trackId, overrides),
    id: 'clip-video',
    type: VideoProjectClipType.VIDEO,
    assetId: 'asset-video',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 5,
    ...overrides,
  } satisfies VideoProjectVideoClip;
}

function createAudioClip(trackId: string, overrides: Partial<VideoProjectAudioClip> = {}) {
  return {
    ...createClipBase(trackId, overrides),
    id: 'clip-audio',
    type: VideoProjectClipType.AUDIO,
    assetId: 'asset-audio',
    sourceStart: 0,
    sourceDuration: 5,
    ...overrides,
  } satisfies VideoProjectAudioClip;
}

function createLinkedRecordingPair(project: VideoProject) {
  const groupId = 'group-recording';
  const videoClip = createVideoClip(project.tracks[0]!.id, {
    groupId,
    id: 'clip-linked-video',
    linkMode: VideoClipLinkMode.LINKED,
  });
  const audioClip = createAudioClip(project.tracks[1]!.id, {
    assetId: videoClip.assetId,
    groupId,
    id: 'clip-linked-audio',
    linkMode: VideoClipLinkMode.LINKED,
  });

  return { audioClip, videoClip };
}

function createAsset(assetId: string, type: VideoProjectAssetType, hasAudio: boolean) {
  return {
    ...createVideoProjectAsset(
      `${assetId}-name`,
      type,
      { kind: 'project-asset', projectAssetId: `project-${assetId}` },
      {
        width: 1920,
        height: 1080,
        duration: 5,
        mimeType: 'video/mp4',
        size: 1,
        hasAudio,
        audioPeaks: null,
      }
    ),
    id: assetId,
  };
}

function MediaRuntimeHarness(props: {
  activeClips: VideoProjectClip[];
  currentTime: number;
  isPlaying: boolean;
  onResolve: (value: { audioBankClipIds: string[]; videoBankClipIds: string[] }) => void;
  project: VideoProject;
}) {
  const runtime = usePreviewStageMediaRuntime({
    ...props,
    assetUrls: {},
    effectRuntimeFeedback: {
      failed: false,
      onFailure: vi.fn(),
      onRecovery: vi.fn(),
      onRetry: vi.fn(),
      retryVersion: 0,
    },
    previewExactFrameCache: createVideoPreviewExactFrameCache(1024),
    previewMode: 'live',
    onPresentationTime: vi.fn(),
    playbackRange: null,
    previewRasterSize: { height: 720, width: 1280 },
    renderGenerationRef: { current: 0 },
    registerPreviewRuntime: () => undefined,
  });

  useEffect(() => {
    props.onResolve({
      audioBankClipIds: runtime.audioBankClips.map((clip) => clip.id),
      videoBankClipIds: runtime.videoBankClips.map((clip) => clip.id),
    });
  }, [props, runtime]);

  return null;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('keeps audio-capable videos in the hidden audio bank and excludes silent videos', async () => {
  const project = createEmptyVideoProject('Preview');
  const videoClip = createVideoClip(project.tracks[0]!.id);
  const silentVideoClip = createVideoClip(project.tracks[0]!.id, {
    assetId: 'asset-video-silent',
    id: 'clip-video-silent',
  });
  const audioClip = createAudioClip(project.tracks[1]!.id);
  const onResolve = vi.fn();
  project.assets = [
    createAsset(videoClip.assetId, VideoProjectAssetType.VIDEO, true),
    createAsset(silentVideoClip.assetId, VideoProjectAssetType.VIDEO, false),
    createAsset(audioClip.assetId, VideoProjectAssetType.AUDIO, true),
  ];
  project.clips = [videoClip, silentVideoClip, audioClip];
  project.duration = 10;

  await act(async () => {
    root?.render(
      <MediaRuntimeHarness
        activeClips={[videoClip, silentVideoClip]}
        currentTime={4.5}
        isPlaying={false}
        onResolve={onResolve}
        project={project}
      />
    );
  });

  expect(onResolve).toHaveBeenCalledWith({
    audioBankClipIds: [videoClip.id, audioClip.id],
    videoBankClipIds: [videoClip.id, silentVideoClip.id],
  });
});

it('prefers the linked audio companion over a duplicate hidden video driver', async () => {
  const project = createEmptyVideoProject('Preview');
  const { audioClip, videoClip } = createLinkedRecordingPair(project);
  const onResolve = vi.fn();

  project.assets = [createAsset(videoClip.assetId, VideoProjectAssetType.RECORDING, true)];
  project.clips = [videoClip, audioClip];
  project.duration = 10;

  await act(async () => {
    root?.render(
      <MediaRuntimeHarness
        activeClips={[videoClip]}
        currentTime={4.5}
        isPlaying
        onResolve={onResolve}
        project={project}
      />
    );
  });

  expect(onResolve).toHaveBeenCalledWith({
    audioBankClipIds: [audioClip.id],
    videoBankClipIds: [videoClip.id],
  });
});
