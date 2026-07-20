// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { shouldRenderClipAudio } from '../media/audio';

const {
  clampClipPlaybackRateMock,
  getClipCompositeAudioGainMock,
  getMediaClipSourceTimeMock,
  isClipActiveAtTimeMock,
  getAssetByIdMock,
  isAudioClipMock,
  isVideoClipMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  clampClipPlaybackRateMock: vi.fn((value) => value),
  getClipCompositeAudioGainMock: vi.fn(),
  getMediaClipSourceTimeMock: vi.fn(),
  isClipActiveAtTimeMock: vi.fn(),
  getAssetByIdMock: vi.fn(),
  isAudioClipMock: vi.fn(),
  isVideoClipMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../../../features/video/project/timeline', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/timeline')>()),
  clampClipPlaybackRate: clampClipPlaybackRateMock,
  getClipCompositeAudioGain: getClipCompositeAudioGainMock,
  getMediaClipSourceTime: getMediaClipSourceTimeMock,
  isClipActiveAtTime: isClipActiveAtTimeMock,
}));

vi.mock('../../../features/video/project/timeline/basics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/video/project/timeline/basics')>()),
  getAssetById: getAssetByIdMock,
  isAudioClip: isAudioClipMock,
  isVideoClip: isVideoClipMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

import { syncClipPlayback } from './playback';

beforeEach(() => {
  vi.clearAllMocks();
});

function createProject() {
  return {
    tracks: [{ id: 'track-1', visible: true }],
    clips: [
      {
        id: 'clip-1',
        trackId: 'track-1',
        assetId: 'asset-1',
        muted: false,
        playbackRate: 1.5,
      },
    ],
  };
}

function createPlaybackFixture(initialTime = 0, initiallyPaused = true) {
  const pauseMock = vi.fn();
  const playMock = vi.fn();
  const currentTimeState = { value: initialTime };
  const element = document.createElement('video');
  let paused = initiallyPaused;

  Object.defineProperty(element, 'paused', {
    configurable: true,
    get: () => paused,
  });
  Object.defineProperty(element, 'currentTime', {
    configurable: true,
    get: () => currentTimeState.value,
    set: (value: number) => {
      currentTimeState.value = value;
    },
  });
  Object.defineProperty(element, 'play', { configurable: true, value: playMock });
  Object.defineProperty(element, 'pause', {
    configurable: true,
    value: () => {
      paused = true;
      pauseMock();
    },
  });

  return {
    currentTimeState,
    element,
    pauseMock,
    playMock,
    setPaused(value: boolean) {
      paused = value;
    },
  };
}

it('decides whether clip audio should render from clip, track, and asset state', () => {
  const project = createProject();
  const clip = project.clips[0] as never;

  isVideoClipMock.mockReturnValue(true);
  isAudioClipMock.mockReturnValue(false);
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });

  expect(shouldRenderClipAudio(project as never, clip)).toBe(true);

  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: false } });
  expect(shouldRenderClipAudio(project as never, clip)).toBe(false);

  project.tracks[0]!.visible = false;
  expect(shouldRenderClipAudio(project as never, clip)).toBe(false);

  isVideoClipMock.mockReturnValue(false);
  isAudioClipMock.mockReturnValue(false);
  project.tracks[0]!.visible = true;
  expect(shouldRenderClipAudio(project as never, clip)).toBe(false);
});

it('syncs clip playback and surfaces play failures through the logger seam', async () => {
  const playMock = vi.fn().mockRejectedValue(new Error('play failed'));
  const pauseMock = vi.fn();
  const currentTimeState = { value: 0 };
  const element = document.createElement('video');

  Object.defineProperty(element, 'paused', {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(element, 'currentTime', {
    configurable: true,
    get: () => currentTimeState.value,
    set: (value: number) => {
      currentTimeState.value = value;
    },
  });
  Object.defineProperty(element, 'play', { configurable: true, value: playMock });
  Object.defineProperty(element, 'pause', { configurable: true, value: pauseMock });

  isVideoClipMock.mockReturnValue(true);
  isAudioClipMock.mockReturnValue(false);
  isClipActiveAtTimeMock.mockReturnValue(true);
  getMediaClipSourceTimeMock.mockReturnValue(3);
  getClipCompositeAudioGainMock.mockReturnValue(0.8);
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });

  syncClipPlayback(
    {
      clipMediaElements: new Map([['clip-1', element]]),
      clipAudioNodes: new Map([['clip-1', { gain: { gain: { value: 0 } } }]]),
    } as never,
    createProject() as never,
    1.5
  );
  await Promise.resolve();

  expect(currentTimeState.value).toBe(3);
  expect(element.playbackRate).toBe(1.5);
  expect(clampClipPlaybackRateMock).toHaveBeenCalledWith(1.5);
  expect(playMock).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Media playback sync failed', expect.any(Error));
});

it('pauses inactive clips and preserves stable active playback without replaying', () => {
  const fixture = createPlaybackFixture(2.92, false);

  isVideoClipMock.mockReturnValue(true);
  isAudioClipMock.mockReturnValue(false);
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });
  getMediaClipSourceTimeMock.mockReturnValue(3);

  isClipActiveAtTimeMock.mockReturnValueOnce(false);
  syncClipPlayback(
    {
      clipMediaElements: new Map([['clip-1', fixture.element]]),
      clipAudioNodes: new Map([['clip-1', { gain: { gain: { value: 1 } } }]]),
    } as never,
    createProject() as never,
    1.5
  );

  expect(fixture.pauseMock).toHaveBeenCalledOnce();
  expect(fixture.playMock).not.toHaveBeenCalled();

  fixture.setPaused(false);
  isClipActiveAtTimeMock.mockReturnValueOnce(true);
  syncClipPlayback(
    {
      clipMediaElements: new Map([['clip-1', fixture.element]]),
      clipAudioNodes: new Map([['clip-1', { gain: { gain: { value: 1 } } }]]),
    } as never,
    createProject() as never,
    1.5
  );

  expect(fixture.currentTimeState.value).toBe(2.92);
  expect(fixture.playMock).not.toHaveBeenCalled();
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('keeps accelerated export playback stable when drift stays inside the sync tolerance', () => {
  const fixture = createPlaybackFixture(3.22, false);
  const project = createProject();
  project.clips[0]!.playbackRate = 3;

  isVideoClipMock.mockReturnValue(true);
  isAudioClipMock.mockReturnValue(false);
  getAssetByIdMock.mockReturnValue({ metadata: { hasAudio: true } });
  getMediaClipSourceTimeMock.mockReturnValue(3);
  getClipCompositeAudioGainMock.mockReturnValue(1);
  isClipActiveAtTimeMock.mockReturnValue(true);

  syncClipPlayback(
    {
      clipMediaElements: new Map([['clip-1', fixture.element]]),
      clipAudioNodes: new Map([['clip-1', { gain: { gain: { value: 1 } } }]]),
    } as never,
    project as never,
    1.5
  );

  expect(fixture.currentTimeState.value).toBe(3.22);
  expect(fixture.playMock).not.toHaveBeenCalled();
  expect(loggerWarnMock).not.toHaveBeenCalled();
});
