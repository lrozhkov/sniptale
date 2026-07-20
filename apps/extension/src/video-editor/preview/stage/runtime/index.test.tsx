// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerDebugMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { usePreviewStageVideoSync } from './index';
import { getPreviewStageSizeStyle } from './surface-state';
import type { PreviewStageVideoRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 4,
    duration: 6,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 2,
    sourceDuration: 6,
    ...overrides,
  };
}

function createVideoElement(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 0,
    defaultMuted: false,
    muted: false,
    pause: vi.fn(),
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    volume: 1,
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function PreviewStageVideoSyncHarness(props: {
  activeClips: VideoProjectVideoClip[];
  currentTime: number;
  isPlaying: boolean;
  syncedClips: VideoProjectVideoClip[];
  videoRefs: PreviewStageVideoRefs;
}) {
  usePreviewStageVideoSync(props);
  return null;
}

async function renderHarness(props: {
  activeClips: VideoProjectVideoClip[];
  currentTime: number;
  isPlaying: boolean;
  syncedClips?: VideoProjectVideoClip[];
  videoRefs: PreviewStageVideoRefs;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <PreviewStageVideoSyncHarness
        {...props}
        syncedClips={props.syncedClips ?? props.activeClips}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loggerDebugMock.mockReset();
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

async function verifiesPlayingVideoSync() {
  const clip = createVideoClip();
  const video = createVideoElement({ currentTime: 0, paused: true });
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 8,
    isPlaying: true,
    videoRefs,
  });

  expect(video.currentTime).toBe(6);
  expect(video.defaultMuted).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.play).toHaveBeenCalledTimes(1);
  expect(video.volume).toBe(0);
}

async function verifiesPausedVideoSync() {
  const clip = createVideoClip();
  const video = createVideoElement({ paused: false });
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 8,
    isPlaying: false,
    videoRefs,
  });

  expect(video.pause).toHaveBeenCalledTimes(1);
}

async function verifiesPausedPreviewSeekSync() {
  const clip = createVideoClip();
  const video = createVideoElement({ currentTime: 5.95, paused: true });
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 8,
    isPlaying: false,
    videoRefs,
  });

  expect(video.currentTime).toBe(6);
}

async function verifiesPrewarmedVideoSync() {
  const activeClip = createVideoClip({ id: 'clip-active', sourceStart: 2, startTime: 4 });
  const nextClip = createVideoClip({ id: 'clip-next', sourceStart: 6, startTime: 6 });
  const activeVideo = createVideoElement({ currentTime: 0, paused: true });
  const nextVideo = createVideoElement({ currentTime: 0, paused: false });
  const videoRefs = {
    current: {
      [activeClip.id]: activeVideo,
      [nextClip.id]: nextVideo,
    },
  };

  await renderHarness({
    activeClips: [activeClip],
    currentTime: 5.7,
    isPlaying: true,
    syncedClips: [activeClip, nextClip],
    videoRefs,
  });

  expect(activeVideo.play).toHaveBeenCalledTimes(1);
  expect(nextVideo.currentTime).toBe(6);
  expect(nextVideo.play).not.toHaveBeenCalled();
  expect(nextVideo.pause).toHaveBeenCalledTimes(1);
}

async function verifiesStableAcceleratedPlaybackSync() {
  const clip = createVideoClip({ playbackRate: 3 });
  const video = createVideoElement({ currentTime: 14.22, paused: false });
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 8,
    isPlaying: true,
    videoRefs,
  });

  expect(video.currentTime).toBe(14.22);
  expect(video.play).not.toHaveBeenCalled();
  expect(video.pause).not.toHaveBeenCalled();
}

async function verifiesPlayRejectionTrace() {
  const clip = createVideoClip();
  const video = createVideoElement({
    paused: true,
    play: vi.fn().mockRejectedValue(new Error('autoplay blocked')),
  });
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 8,
    isPlaying: true,
    videoRefs,
  });
  await act(async () => {
    await Promise.resolve();
  });

  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Preview stage video play() rejected',
    expect.objectContaining({
      clipId: clip.id,
      errorMessage: 'autoplay blocked',
    })
  );
}

function verifiesLandscapePreviewStageSizing() {
  expect(getPreviewStageSizeStyle({ width: 1920, height: 1080 } as never)).toEqual({
    aspectRatio: '1920 / 1080',
    flex: '0 0 auto',
    height: 'min(100cqh, calc(100cqw * 0.5625))',
    maxHeight: '100%',
    maxWidth: '100%',
    width: 'min(100cqw, calc(100cqh * 1.7777777777777777))',
  });
}

function verifiesPortraitPreviewStageSizing() {
  expect(getPreviewStageSizeStyle({ width: 1080, height: 1920 } as never)).toEqual({
    aspectRatio: '1080 / 1920',
    flex: '0 0 auto',
    height: 'min(100cqh, calc(100cqw * 1.7777777777777777))',
    maxHeight: '100%',
    maxWidth: '100%',
    width: 'min(100cqw, calc(100cqh * 0.5625))',
  });
}

describe('preview-stage-runtime', () => {
  it(
    'fits landscape projects against both preview-container axes',
    verifiesLandscapePreviewStageSizing
  );
  it(
    'fits portrait projects against both preview-container axes',
    verifiesPortraitPreviewStageSizing
  );
  it(
    'syncs active video time and starts playback when the preview is playing',
    verifiesPlayingVideoSync
  );
  it('pauses active videos when the preview is not playing', verifiesPausedVideoSync);
  it('refreshes paused preview frames on seek-sized time changes', verifiesPausedPreviewSeekSync);
  it(
    'keeps accelerated preview playback free-running when drift stays inside the playback sync window',
    verifiesStableAcceleratedPlaybackSync
  );
  it('keeps prewarmed transition videos paused but source-synced', verifiesPrewarmedVideoSync);
  it('logs a low-noise debug trace when preview video play() rejects', verifiesPlayRejectionTrace);
});
