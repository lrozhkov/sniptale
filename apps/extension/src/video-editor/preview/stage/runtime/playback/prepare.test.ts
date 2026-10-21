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

it('does not prime camera video or audio outside metadata coverage', async () => {
  const { createEmptyVideoProject, createVideoProjectAsset } =
    await import('../../../../../features/video/project/factories/creation');
  vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }) as typeof requestAnimationFrame);
  const project = createEmptyVideoProject();
  const clip = {
    ...createVideoClip(),
    startTime: 0,
    sourceStart: 0,
    duration: 12,
    sourceDuration: 12,
    playbackRate: 1,
    cameraTiming: { offsetSeconds: 3, transitions: 'bounded' as const },
  };
  const asset = createVideoProjectAsset(
    'Camera',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'camera' },
    {
      duration: 4,
      width: 100,
      height: 100,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: true,
      audioPeaks: null,
    }
  );
  asset.id = clip.assetId;
  project.assets = [asset];
  project.clips = [clip];
  const video = createPreparedVideoElement();
  const audio = createPreparedAudioElement();
  video.currentTime = 17;
  audio.currentTime = 19;
  const state = {
    project,
    videoBankClips: [clip],
    audioBankClips: [clip],
    videoRefs: { current: { [clip.id]: video } },
    audioRefs: { current: { [clip.id]: audio } },
  };
  for (const time of [0, 2.9, 7, 11]) await preparePreviewStagePlayback(state, time);
  expect(video.currentTime).toBe(17);
  expect(audio.currentTime).toBe(19);
  await preparePreviewStagePlayback(state, 3);
  expect(video.currentTime).toBe(0);
  expect(audio.currentTime).toBe(0);
});
