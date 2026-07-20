// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  type VideoProjectAudioClip,
  type VideoProjectVideoClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { PreviewStageAudioBank } from './audio-bank';
import type { PreviewStageAudioRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAudioClip(overrides: Partial<VideoProjectAudioClip> = {}): VideoProjectAudioClip {
  return {
    id: 'clip-audio',
    trackId: 'track-audio',
    type: VideoProjectClipType.AUDIO,
    name: 'Audio',
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
    assetId: 'asset-audio',
    sourceStart: 0,
    sourceDuration: 5,
    ...overrides,
  };
}

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

it('registers hidden audio refs for audio clips and audio-capable video clips', async () => {
  const audioRefs: PreviewStageAudioRefs = { current: {} };
  const audioClip = createAudioClip();
  const videoClip = createVideoClip({ id: 'clip-video-audio' });

  await act(async () => {
    root?.render(
      <PreviewStageAudioBank
        assetUrls={{
          [audioClip.assetId]: 'blob:audio',
          [videoClip.assetId]: 'blob:video',
        }}
        audioBankClips={[audioClip, videoClip]}
        audioRefs={audioRefs}
      />
    );
  });

  expect(Object.keys(audioRefs.current)).toEqual([audioClip.id, videoClip.id]);
  expect(audioRefs.current[audioClip.id]).toBeInstanceOf(HTMLAudioElement);
  expect(audioRefs.current[videoClip.id]).toBeInstanceOf(HTMLAudioElement);
});
