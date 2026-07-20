// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types';
import { usePreviewStageVideoSync } from './index';
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
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
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
  videoRefs: PreviewStageVideoRefs;
}) {
  usePreviewStageVideoSync({ ...props, syncedClips: props.activeClips });
  return null;
}

async function renderHarness(props: React.ComponentProps<typeof PreviewStageVideoSyncHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PreviewStageVideoSyncHarness {...props} />);
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

it('keeps slow-rate preview video aligned with the timeline speed', async () => {
  const clip = createVideoClip({ playbackRate: 0.4 });
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

  expect(video.currentTime).toBeCloseTo(3.6);
  expect(video.playbackRate).toBeCloseTo(0.4);
});
