// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  type VideoProject,
  type VideoProjectAudioClip,
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { usePreviewStageAudioSync } from './audio';
import {
  flushPreviewAudioGraphTasks,
  installPreviewAudioContextHarness,
} from './playback/audio-graph.test-support';
import type { PreviewStageAudioRefs } from '../types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAudioClip(trackId: string): VideoProjectAudioClip {
  return {
    id: 'clip-audio',
    trackId,
    type: VideoProjectClipType.AUDIO,
    name: 'Audio',
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
    assetId: 'asset-audio',
    sourceStart: 2,
    sourceDuration: 6,
  };
}

function createProject(clip: VideoProjectAudioClip): VideoProject {
  const project = createEmptyVideoProject('Preview');
  project.clips = [clip];
  project.duration = clip.startTime + clip.duration;
  return project;
}

function createAudioElement() {
  return {
    currentTime: 4.05,
    muted: false,
    pause: vi.fn(),
    paused: false,
    play: vi.fn().mockResolvedValue(undefined),
    volume: 1,
  } as unknown as HTMLAudioElement;
}

function AudioSyncHarness(props: {
  audioRefs: PreviewStageAudioRefs;
  currentTime: number;
  isPlaying: boolean;
  project: VideoProject;
  syncedClips: VideoProjectAudioClip[];
}) {
  usePreviewStageAudioSync(props);
  return null;
}

async function renderHarness(props: {
  audioRefs: PreviewStageAudioRefs;
  currentTime: number;
  isPlaying: boolean;
  project: VideoProject;
  syncedClips: VideoProjectAudioClip[];
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  installPreviewAudioContextHarness();
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

it('keeps 1x preview audio free-running across modest playback drift between render ticks', async () => {
  const project = createEmptyVideoProject('Preview');
  const clip = createAudioClip(project.tracks[1]!.id);
  const audio = createAudioElement();
  const props = {
    audioRefs: { current: { [clip.id]: audio } },
    currentTime: 6,
    isPlaying: true,
    project: createProject(clip),
    syncedClips: [clip],
  };

  await renderHarness(props);

  audio.currentTime = 4.05;
  await renderHarness({
    ...props,
    currentTime: 6.28,
  });

  expect(audio.currentTime).toBe(4.05);
  expect(audio.play).not.toHaveBeenCalled();
  expect(audio.pause).not.toHaveBeenCalled();
});
