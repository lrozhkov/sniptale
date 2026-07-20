// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { usePreviewStageAudioSync } from './audio';
import {
  flushPreviewAudioGraphTasks,
  installPreviewAudioContextHarness,
} from './playback/audio-graph.test-support';
import type { PreviewStageAudioBankClip, PreviewStageAudioRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createClipBase(trackId: string, overrides: Partial<VideoProjectClip> = {}) {
  return {
    id: 'clip-1',
    trackId,
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
    ...overrides,
  };
}

function createVideoClip(trackId: string, overrides: Partial<VideoProjectVideoClip> = {}) {
  return {
    ...createClipBase(trackId, overrides),
    type: VideoProjectClipType.VIDEO,
    assetId: 'asset-video',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 2,
    sourceDuration: 6,
    ...overrides,
  } satisfies VideoProjectVideoClip;
}

function createAudioClip(trackId: string, overrides: Partial<VideoProjectAudioClip> = {}) {
  return {
    ...createClipBase(trackId, overrides),
    type: VideoProjectClipType.AUDIO,
    assetId: 'asset-audio',
    sourceStart: 2,
    sourceDuration: 6,
    ...overrides,
  } satisfies VideoProjectAudioClip;
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
        duration: 6,
        mimeType: 'video/mp4',
        size: 1,
        hasAudio,
        audioPeaks: null,
      }
    ),
    id: assetId,
  };
}

function createProject(
  clips: PreviewStageAudioBankClip[],
  audioCapableVideoAssetIds: string[] = []
): VideoProject {
  const project = createEmptyVideoProject('Preview');
  const audioCapableVideoSet = new Set(audioCapableVideoAssetIds);

  project.assets = clips.map((clip) =>
    createAsset(
      clip.assetId,
      clip.type === VideoProjectClipType.AUDIO
        ? VideoProjectAssetType.AUDIO
        : VideoProjectAssetType.VIDEO,
      clip.type === VideoProjectClipType.AUDIO || audioCapableVideoSet.has(clip.assetId)
    )
  );
  project.clips = clips;
  project.duration = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
  return project;
}

function createAudioElement(overrides: Partial<HTMLAudioElement> = {}) {
  return {
    currentTime: 0,
    muted: true,
    pause: vi.fn(),
    paused: true,
    play: vi.fn().mockResolvedValue(undefined),
    volume: 0,
    ...overrides,
  } as unknown as HTMLAudioElement;
}

function AudioSyncHarness(props: {
  audioRefs: PreviewStageAudioRefs;
  currentTime: number;
  isPlaying: boolean;
  project: VideoProject;
  syncedClips: PreviewStageAudioBankClip[];
}) {
  usePreviewStageAudioSync(props);
  return null;
}

async function renderHarness(props: {
  audioRefs: PreviewStageAudioRefs;
  currentTime: number;
  isPlaying: boolean;
  project: VideoProject;
  syncedClips: PreviewStageAudioBankClip[];
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AudioSyncHarness {...props} />);
  });
  await flushPreviewAudioGraphTasks();
}

async function unmountHarness() {
  await act(async () => {
    root?.unmount();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installPreviewAudioContextHarness();
});

afterEach(async () => {
  await unmountHarness();
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function verifiesActiveVideoClipAudio() {
  const project = createEmptyVideoProject('Preview');
  const clip = createVideoClip(project.tracks[0]!.id);
  const audio = createAudioElement();

  await renderHarness({
    audioRefs: { current: { [clip.id]: audio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject([clip], [clip.assetId]),
    syncedClips: [clip],
  });

  expect(audio.currentTime).toBe(4);
  expect(audio.muted).toBe(false);
  expect(audio.play).toHaveBeenCalledTimes(1);
}

async function verifiesActiveAudioClipPlayback() {
  const project = createEmptyVideoProject('Preview');
  const clip = createAudioClip(project.tracks[1]!.id);
  const audio = createAudioElement();

  await renderHarness({
    audioRefs: { current: { [clip.id]: audio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject([clip]),
    syncedClips: [clip],
  });

  expect(audio.currentTime).toBe(4);
  expect(audio.muted).toBe(false);
  expect(audio.play).toHaveBeenCalledTimes(1);
}

async function verifiesPausedSeekSync() {
  const project = createEmptyVideoProject('Preview');
  const clip = createAudioClip(project.tracks[1]!.id);
  const audio = createAudioElement({ currentTime: 3.9 });

  await renderHarness({
    audioRefs: { current: { [clip.id]: audio } },
    currentTime: 6,
    isPlaying: false,
    project: createProject([clip]),
    syncedClips: [clip],
  });

  expect(audio.currentTime).toBe(4);
  expect(audio.play).not.toHaveBeenCalled();
}

async function verifiesStableAcceleratedAudioPlayback() {
  const project = createEmptyVideoProject('Preview');
  const clip = createAudioClip(project.tracks[1]!.id, { playbackRate: 3 });
  const audio = createAudioElement({
    currentTime: 8.22,
    muted: false,
    paused: false,
    volume: 1,
  });

  await renderHarness({
    audioRefs: { current: { [clip.id]: audio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject([clip]),
    syncedClips: [clip],
  });

  expect(audio.currentTime).toBe(8.22);
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.pause).not.toHaveBeenCalled();
}

async function verifiesSlowPlaybackRateAudioSync() {
  const project = createEmptyVideoProject('Preview');
  const clips = [0.5, 1, 2].map((playbackRate) =>
    createAudioClip(project.tracks[1]!.id, {
      id: `clip-audio-${playbackRate}`,
      playbackRate,
    })
  );
  const audioRefs = Object.fromEntries(clips.map((clip) => [clip.id, createAudioElement()]));

  await renderHarness({
    audioRefs: { current: audioRefs },
    currentTime: 8,
    isPlaying: true,
    project: createProject(clips),
    syncedClips: clips,
  });

  for (const clip of clips) {
    const audio = audioRefs[clip.id] as HTMLAudioElement &
      Partial<Record<'mozPreservesPitch' | 'preservesPitch' | 'webkitPreservesPitch', boolean>>;
    const expectedTime = 2 + (8 - clip.startTime) * (clip.playbackRate ?? 1);
    expect(audio.currentTime).toBeCloseTo(expectedTime);
    expect(audio.playbackRate).toBeCloseTo(clip.playbackRate ?? 1);
    expect(audio.preservesPitch).toBe(true);
    expect(audio.mozPreservesPitch).toBe(true);
    expect(audio.webkitPreservesPitch).toBe(true);
  }
}
describe('preview-stage-audio-runtime', () => {
  it(
    'plays video clip audio through the hidden preview audio driver',
    verifiesActiveVideoClipAudio
  );
  it('plays active audio-only clips in preview playback', verifiesActiveAudioClipPlayback);
  it('updates paused audio-only clip time on seek', verifiesPausedSeekSync);
  it(
    'keeps accelerated preview audio free-running when drift stays inside the playback sync window',
    verifiesStableAcceleratedAudioPlayback
  );
  it(
    'keeps 0.5x, 1x, and 2x preview audio aligned with pitch preservation',
    verifiesSlowPlaybackRateAudioSync
  );
});
