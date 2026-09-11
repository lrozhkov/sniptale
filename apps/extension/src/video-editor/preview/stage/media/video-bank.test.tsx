// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type VideoProjectVideoClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { PreviewStageVideoBank } from './video-bank';
import type { PreviewStageVideoRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVideoClip(overrides: Partial<VideoProjectVideoClip> = {}): VideoProjectVideoClip {
  return {
    id: 'clip-video',
    trackId: 'track-video',
    type: VideoProjectClipType.VIDEO,
    name: 'Video',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: 5,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-video',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 5,
    ...overrides,
  };
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

it('registers hidden preview videos with muted defaults for runtime-owned playback', async () => {
  const videoRefs: PreviewStageVideoRefs = { current: {} };
  const clip = createVideoClip();

  await act(async () => {
    root?.render(
      <PreviewStageVideoBank
        assetUrls={{ [clip.assetId]: 'blob:video' }}
        bankClips={[clip]}
        videoRefs={videoRefs}
      />
    );
  });

  const video = videoRefs.current[clip.id];
  expect(video).toBeInstanceOf(HTMLVideoElement);
  expect(video?.muted).toBe(true);
  expect(video?.defaultMuted).toBe(true);
});

it('releases removed video sources without resetting players on ordinary frame updates', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const videoRefs: PreviewStageVideoRefs = { current: {} };
  const clip = createVideoClip();
  const render = (clips: VideoProjectVideoClip[], src = 'blob:first') =>
    act(() =>
      root!.render(
        <PreviewStageVideoBank
          assetUrls={{ [clip.assetId]: src }}
          bankClips={clips}
          videoRefs={videoRefs}
        />
      )
    );
  try {
    for (let i = 0; i < 3; i++) {
      render([clip]);
      const video = videoRefs.current[clip.id]!;
      const loads = load.mock.calls.length;
      const pauses = pause.mock.calls.length;
      render([{ ...clip }]);
      expect(videoRefs.current[clip.id]).toBe(video);
      expect(load).toHaveBeenCalledTimes(loads);
      expect(pause).toHaveBeenCalledTimes(pauses);
      render([]);
      expect(video.hasAttribute('src')).toBe(false);
      expect(pause).toHaveBeenCalledTimes(pauses + 1);
      expect(load).toHaveBeenCalledTimes(loads + 1);
      expect(videoRefs.current[clip.id]).toBeUndefined();
    }
    render([clip]);
    const video = videoRefs.current[clip.id]!;
    const loads = load.mock.calls.length;
    render([clip], 'blob:second');
    expect(video.src).toBe('blob:second');
    expect(load).toHaveBeenCalledTimes(loads + 1);
    render([]);
  } finally {
    pause.mockRestore();
    load.mockRestore();
  }
});
