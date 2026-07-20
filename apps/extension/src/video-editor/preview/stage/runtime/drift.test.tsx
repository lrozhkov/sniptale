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
import { usePreviewStageVideoSync } from './index';
import type { PreviewStageVideoRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVideoClip(): VideoProjectVideoClip {
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
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 2,
    sourceDuration: 6,
  };
}

function createVideoElement() {
  return {
    currentTime: 4.05,
    pause: vi.fn(),
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
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
  videoRefs: PreviewStageVideoRefs;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PreviewStageVideoSyncHarness {...props} syncedClips={props.activeClips} />);
  });
}

beforeEach(() => {
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

it('keeps 1x preview video playback free-running across modest playback drift between render ticks', async () => {
  const clip = createVideoClip();
  const video = createVideoElement();
  const videoRefs = {
    current: { [clip.id]: video },
  };

  await renderHarness({
    activeClips: [clip],
    currentTime: 6,
    isPlaying: true,
    videoRefs,
  });

  video.currentTime = 4.05;
  await renderHarness({
    activeClips: [clip],
    currentTime: 6.28,
    isPlaying: true,
    videoRefs,
  });

  expect(video.currentTime).toBe(4.05);
  expect(video.play).not.toHaveBeenCalled();
  expect(video.pause).not.toHaveBeenCalled();
});
