// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { usePreviewStageVideoFrameVersion, canRenderActivePreviewVideos } from './video-frame';

function createVideoClip(): VideoProjectVideoClip {
  return {
    assetId: 'asset-video',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: VideoMediaFitMode.CONTAIN,
    groupId: null,
    id: 'clip-video',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Video',
    sourceDuration: 6,
    sourceStart: 1,
    startTime: 3,
    trackId: 'track-video',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.VIDEO,
    volume: 1,
  };
}

it('freezes the last rendered frame while an active preview video is not ready', () => {
  const clip = createVideoClip();

  expect(
    canRenderActivePreviewVideos([clip], {
      current: {
        [clip.id]: {
          currentTime: 0,
          readyState: 1,
        } as HTMLVideoElement,
      },
    })
  ).toBe(false);
});

it('allows redraw once every active preview video has current frame data', () => {
  const clip = createVideoClip();

  expect(
    canRenderActivePreviewVideos([clip], {
      current: {
        [clip.id]: {
          currentTime: 4,
          readyState: 2,
        } as HTMLVideoElement,
      },
    })
  ).toBe(true);
});

it('retains frame listeners during unrelated scene gesture rerenders', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const video = document.createElement('video');
  const clip = createVideoClip();
  const refs = { current: { [clip.id]: video } };
  const add = vi.spyOn(video, 'addEventListener');
  const remove = vi.spyOn(video, 'removeEventListener');
  const root = createRoot(document.createElement('div'));
  function Harness() {
    usePreviewStageVideoFrameVersion([{ ...clip }], 0, refs);
    return null;
  }
  try {
    act(() => root.render(createElement(Harness)));
    add.mockClear();
    remove.mockClear();
    for (let i = 0; i < 20; i++) act(() => root.render(createElement(Harness)));
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('binds media arriving after the first commit without changing time or active clip IDs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const clip = createVideoClip();
  const refs: { current: Record<string, HTMLVideoElement | null> } = { current: {} };
  let canRender = false;
  const root = createRoot(document.createElement('div'));
  function Harness() {
    canRender = usePreviewStageVideoFrameVersion([clip], 0, refs).canRender;
    return null;
  }
  try {
    act(() => root.render(createElement(Harness)));
    expect(canRender).toBe(false);
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2 });
    refs.current[clip.id] = video;
    const add = vi.spyOn(video, 'addEventListener');
    act(() => root.render(createElement(Harness)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(canRender).toBe(true);
    expect(add).toHaveBeenCalledWith('seeked', expect.any(Function));
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
