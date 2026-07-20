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

function createProject(
  clips: PreviewStageAudioBankClip[],
  audioCapableVideoAssetIds: string[] = []
): VideoProject {
  const project = createEmptyVideoProject('Preview');
  const audioCapableVideoSet = new Set(audioCapableVideoAssetIds);

  project.assets = clips.map((clip) => ({
    ...createVideoProjectAsset(
      `${clip.assetId}-name`,
      clip.type === VideoProjectClipType.AUDIO
        ? VideoProjectAssetType.AUDIO
        : VideoProjectAssetType.VIDEO,
      { kind: 'project-asset', projectAssetId: `project-${clip.assetId}` },
      {
        width: 1920,
        height: 1080,
        duration: 6,
        mimeType: 'video/mp4',
        size: 1,
        hasAudio:
          clip.type === VideoProjectClipType.AUDIO || audioCapableVideoSet.has(clip.assetId),
        audioPeaks: null,
      }
    ),
    id: clip.assetId,
  }));
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

async function renderHarness(props: React.ComponentProps<typeof AudioSyncHarness>) {
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

async function verifiesInactiveAudioCleanupDuringSync() {
  const project = createEmptyVideoProject('Preview');
  const activeClip = createVideoClip(project.tracks[0]!.id, { id: 'clip-active' });
  const inactiveClip = createAudioClip(project.tracks[1]!.id, { id: 'clip-inactive' });
  const inactiveAudio = createAudioElement({ muted: false, paused: false, volume: 0.7 });

  await renderHarness({
    audioRefs: { current: { [inactiveClip.id]: inactiveAudio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject([activeClip, inactiveClip], [activeClip.assetId]),
    syncedClips: [activeClip],
  });

  expect(inactiveAudio.pause).toHaveBeenCalledTimes(1);
  expect(inactiveAudio.muted).toBe(false);
  expect(inactiveAudio.volume).toBe(1);
}

async function verifiesUnmountCleanup() {
  const project = createEmptyVideoProject('Preview');
  const audioClip = createAudioClip(project.tracks[1]!.id, { id: 'clip-audio' });
  const videoClip = createVideoClip(project.tracks[0]!.id, { id: 'clip-video' });
  const audio = createAudioElement({ muted: false, volume: 0.6 });
  const videoAudio = createAudioElement({ muted: false, volume: 0.8 });

  await renderHarness({
    audioRefs: { current: { [audioClip.id]: audio, [videoClip.id]: videoAudio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject([audioClip, videoClip], [videoClip.assetId]),
    syncedClips: [audioClip, videoClip],
  });
  await unmountHarness();

  expect(audio.pause).toHaveBeenCalled();
  expect(audio.muted).toBe(false);
  expect(audio.volume).toBe(1);
  expect(videoAudio.pause).toHaveBeenCalled();
  expect(videoAudio.muted).toBe(false);
  expect(videoAudio.volume).toBe(1);
}

describe('preview-stage-audio-runtime-cleanup', () => {
  it(
    'ramps down and pauses inactive audio elements during sync',
    verifiesInactiveAudioCleanupDuringSync
  );
  it('cleans preview audio media on unmount', verifiesUnmountCleanup);
});
