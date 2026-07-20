// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProjectVideoClip,
} from '../../../features/video/project/types';

function createVideoClip(trackId: string): VideoProjectVideoClip {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: 1,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 1,
  };
}

async function importPlaybackHook() {
  return (await import('./playback')).useVideoEditorPlayback;
}

function PlaybackLoopHarness(props: {
  currentTime: number;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  useVideoEditorPlayback: (typeof import('./playback'))['useVideoEditorPlayback'];
}) {
  const project = createEmptyVideoProject('Playback loop');
  project.duration = 2;
  project.clips = [createVideoClip(project.tracks[0]!.id)];

  props.useVideoEditorPlayback(
    project,
    {
      currentTime: props.currentTime,
      isPlaying: true,
      playbackRange: { start: 0.5, end: 0.8 },
      selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' } as never,
      placementMode: null,
      selectedClipId: 'clip-1',
      selectedActionEvent: null,
      selectedMotionRegion: null,
    },
    {
      setCurrentTime: props.setCurrentTime,
      setPlaying: props.setPlaying,
      splitClipAt: vi.fn(),
      deleteClip: vi.fn(),
      deleteActionEvent: vi.fn(),
      deleteCursorSample: vi.fn(),
      deleteMotionRegion: vi.fn(),
      deleteObjectTrack: vi.fn(),
      clearPlacementMode: vi.fn(),
      updateClipTransform: vi.fn(),
      updateActionEventDetails: vi.fn(),
      updateMotionRegion: vi.fn(),
    }
  );

  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let frameCallback: FrameRequestCallback | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  frameCallback = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallback = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loops inside the selected playback range instead of stopping at the project end', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const setCurrentTime = vi.fn<(time: number) => void>();
  const setPlaying = vi.fn<(playing: boolean) => void>();

  act(() => {
    root?.render(
      <PlaybackLoopHarness
        currentTime={0.7}
        setCurrentTime={setCurrentTime}
        setPlaying={setPlaying}
        useVideoEditorPlayback={useVideoEditorPlayback}
      />
    );
  });

  act(() => {
    frameCallback?.(1350);
  });

  expect(setCurrentTime).toHaveBeenCalledWith(0.5);
  expect(setPlaying).not.toHaveBeenCalledWith(false);
});

it('starts playback from the loop range start when the playhead is outside the selected range', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const setCurrentTime = vi.fn<(time: number) => void>();

  act(() => {
    root?.render(
      <PlaybackLoopHarness
        currentTime={0.1}
        setCurrentTime={setCurrentTime}
        setPlaying={vi.fn<(playing: boolean) => void>()}
        useVideoEditorPlayback={useVideoEditorPlayback}
      />
    );
  });

  expect(setCurrentTime).toHaveBeenCalledWith(0.5);
});
