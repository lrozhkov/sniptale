import { expect, it, vi } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectAudioClip,
  type VideoProjectVideoClip,
} from '../../../../../features/video/project/types';
import { preparePreviewStagePlayback } from './prepare';

function createAudioClip(): VideoProjectAudioClip {
  return {
    assetId: 'asset-audio',
    duration: 6,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id: 'clip-audio',
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: 'Audio',
    playbackRate: 0.5,
    sourceDuration: 6,
    sourceStart: 2,
    startTime: 4,
    trackId: 'track-audio',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.AUDIO,
    volume: 1,
  };
}

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
    playbackRate: 0.5,
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

function createPreparedAudioElement() {
  return {
    addEventListener: vi.fn(),
    currentTime: 0,
    pause: vi.fn(),
    readyState: 4,
    removeEventListener: vi.fn(),
  } as unknown as HTMLAudioElement;
}

function createPreparedVideoElement() {
  return {
    addEventListener: vi.fn(),
    currentTime: 0,
    defaultMuted: false,
    muted: false,
    pause: vi.fn(),
    readyState: 4,
    removeEventListener: vi.fn(),
    volume: 1,
  } as unknown as HTMLVideoElement;
}

it('primes active preview media without handing clock authority to DOM media time', async () => {
  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame);

  const audioClip = createAudioClip();
  const videoClip = createVideoClip();
  const audio = createPreparedAudioElement();
  const video = createPreparedVideoElement();

  await preparePreviewStagePlayback(
    {
      audioBankClips: [audioClip],
      audioRefs: { current: { [audioClip.id]: audio } },
      videoBankClips: [videoClip],
      videoRefs: { current: { [videoClip.id]: video } },
    },
    6
  );

  expect(audio.currentTime).toBeCloseTo(3);
  expect(audio.pause).toHaveBeenCalledTimes(1);
  expect(audio.playbackRate).toBeCloseTo(0.5);
  expect((audio as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch).toBe(true);
  expect(video.currentTime).toBeCloseTo(2.5);
  expect(video.pause).toHaveBeenCalledTimes(1);
  expect(video.playbackRate).toBeCloseTo(0.5);
  expect(video.defaultMuted).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.volume).toBe(0);
});
