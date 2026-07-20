// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import type { VideoEditorPlaybackRange } from '../../interaction/playback/range';
import type { VideoEditorPlacementMode } from '../../contracts/placement';
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

interface PlaybackHarnessProps {
  clearPlacementMode: () => void;
  currentTime: number;
  deleteActionEvent: (actionEventId: string) => void;
  deleteClip: (clipId: string) => void;
  deleteCursorSample: (sampleId: string) => void;
  deleteMotionRegion: (motionRegionId: string) => void;
  deleteObjectTrack: (objectTrackId: string) => void;
  isPlaying: boolean;
  playbackRange?: VideoEditorPlaybackRange | null;
  placementMode?: VideoEditorPlacementMode | null;
  project: ReturnType<typeof createEmptyVideoProject>;
  selection: { kind: string; clipId?: string; actionEventId?: string; motionRegionId?: string };
  selectedActionEvent?: PlaybackHarnessActionEvent | null;
  selectedClipId: string | null;
  selectedMotionRegion?: PlaybackHarnessMotionRegion | null;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  splitClipAt: (clipId: string, time: number) => void;
  updateActionEventDetails: (actionEventId: string, patch: Record<string, unknown>) => void;
  updateClipTransform: (clipId: string, patch: Record<string, unknown>) => void;
  updateMotionRegion: (motionRegionId: string, patch: Record<string, unknown>) => void;
  useVideoEditorPlayback: (typeof import('./playback'))['useVideoEditorPlayback'];
  onSeekReady?: (seekTo: (time: number) => void) => void;
}

type PlaybackHarnessActionEvent = ReturnType<
  typeof createEmptyVideoProject
>['actionEvents'][number];
type PlaybackHarnessMotionRegion = NonNullable<
  ReturnType<typeof createEmptyVideoProject>['motionRegions']
>[number];

function PlaybackHarness(props: PlaybackHarnessProps) {
  const playback = props.useVideoEditorPlayback(
    props.project,
    {
      currentTime: props.currentTime,
      isPlaying: props.isPlaying,
      playbackRange: props.playbackRange ?? null,
      selection: props.selection as never,
      placementMode: props.placementMode ?? null,
      selectedClipId: props.selectedClipId,
      selectedActionEvent: props.selectedActionEvent ?? null,
      selectedMotionRegion: props.selectedMotionRegion ?? null,
    },
    {
      setCurrentTime: props.setCurrentTime,
      setPlaying: props.setPlaying,
      splitClipAt: props.splitClipAt,
      deleteClip: props.deleteClip,
      deleteActionEvent: props.deleteActionEvent,
      deleteCursorSample: props.deleteCursorSample,
      deleteMotionRegion: props.deleteMotionRegion,
      deleteObjectTrack: props.deleteObjectTrack,
      clearPlacementMode: props.clearPlacementMode,
      updateClipTransform: props.updateClipTransform,
      updateActionEventDetails: props.updateActionEventDetails,
      updateMotionRegion: props.updateMotionRegion,
    }
  );
  props.onSeekReady?.(playback.seekTo);
  return null;
}

function renderPlaybackHarness(root: Root | null, props: PlaybackHarnessProps) {
  act(() => {
    root?.render(<PlaybackHarness {...props} />);
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let seekTo: ((time: number) => void) | null = null;
let frameCallback: FrameRequestCallback | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  frameCallback = null;
  seekTo = null;
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

it('returns playback to the session start when the project duration is reached', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const project = createEmptyVideoProject('Playback');
  project.duration = 0.5;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const setCurrentTime = vi.fn<(time: number) => void>();
  const setPlaying = vi.fn<(playing: boolean) => void>();
  renderPlaybackHarness(root, {
    currentTime: 0.2,
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn<(actionEventId: string) => void>(),
    deleteClip: vi.fn<(clipId: string) => void>(),
    deleteCursorSample: vi.fn<(sampleId: string) => void>(),
    deleteMotionRegion: vi.fn<(motionRegionId: string) => void>(),
    deleteObjectTrack: vi.fn<(objectTrackId: string) => void>(),
    isPlaying: true,
    playbackRange: null,
    placementMode: null,
    onSeekReady: (value) => {
      seekTo = value;
    },
    project,
    selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' },
    selectedClipId: 'clip-1',
    setCurrentTime,
    setPlaying,
    splitClipAt: vi.fn<(clipId: string, time: number) => void>(),
    updateActionEventDetails: vi.fn(),
    updateClipTransform: vi.fn(),
    updateMotionRegion: vi.fn(),
    useVideoEditorPlayback,
  });

  expect(frameCallback).not.toBeNull();

  act(() => {
    frameCallback?.(1600);
  });

  expect(setPlaying).toHaveBeenCalledWith(false);
  expect(setCurrentTime).toHaveBeenCalledWith(0.2);

  act(() => {
    seekTo?.(0.25);
  });

  expect(setCurrentTime).toHaveBeenCalledWith(0.25);
});

it('routes playback shortcuts through the supplied callbacks', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const project = createEmptyVideoProject('Playback shortcuts');
  project.duration = 2;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const setPlaying = vi.fn<(playing: boolean) => void>();
  const splitClipAt = vi.fn<(clipId: string, time: number) => void>();
  const deleteClip = vi.fn<(clipId: string) => void>();
  const updateClipTransform = vi.fn<(clipId: string, patch: Record<string, unknown>) => void>();
  renderPlaybackHarness(root, {
    currentTime: 0.75,
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn<(actionEventId: string) => void>(),
    deleteClip,
    deleteCursorSample: vi.fn<(sampleId: string) => void>(),
    deleteMotionRegion: vi.fn<(motionRegionId: string) => void>(),
    deleteObjectTrack: vi.fn<(objectTrackId: string) => void>(),
    isPlaying: false,
    playbackRange: null,
    placementMode: null,
    project,
    selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' },
    selectedClipId: 'clip-1',
    setCurrentTime: vi.fn<(time: number) => void>(),
    setPlaying,
    splitClipAt,
    updateActionEventDetails: vi.fn(),
    updateClipTransform,
    updateMotionRegion: vi.fn(),
    useVideoEditorPlayback,
  });

  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Delete', bubbles: true }));
  });

  expect(setPlaying).toHaveBeenCalledWith(true);
  expect(splitClipAt).toHaveBeenCalledWith('clip-1', 0.75);
  expect(updateClipTransform).toHaveBeenCalledWith('clip-1', { x: 1, y: 0 });
  expect(deleteClip).toHaveBeenCalledWith('clip-1');
});

it('keeps modified arrow shortcuts inert for selection nudging', async () => {
  const useVideoEditorPlayback = await importPlaybackHook();
  const project = createEmptyVideoProject('Playback modifier shortcuts');
  project.duration = 2;
  project.clips = [createVideoClip(project.tracks[0]!.id)];
  const updateClipTransform = vi.fn<(clipId: string, patch: Record<string, unknown>) => void>();
  renderPlaybackHarness(root, {
    currentTime: 0.75,
    clearPlacementMode: vi.fn(),
    deleteActionEvent: vi.fn<(actionEventId: string) => void>(),
    deleteClip: vi.fn<(clipId: string) => void>(),
    deleteCursorSample: vi.fn<(sampleId: string) => void>(),
    deleteMotionRegion: vi.fn<(motionRegionId: string) => void>(),
    deleteObjectTrack: vi.fn<(objectTrackId: string) => void>(),
    isPlaying: false,
    playbackRange: null,
    placementMode: null,
    project,
    selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' },
    selectedClipId: 'clip-1',
    setCurrentTime: vi.fn<(time: number) => void>(),
    setPlaying: vi.fn<(playing: boolean) => void>(),
    splitClipAt: vi.fn<(clipId: string, time: number) => void>(),
    updateActionEventDetails: vi.fn(),
    updateClipTransform,
    updateMotionRegion: vi.fn(),
    useVideoEditorPlayback,
  });

  act(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, bubbles: true, code: 'ArrowRight' })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'ArrowRight', ctrlKey: true })
    );
    window.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, code: 'ArrowRight', metaKey: true })
    );
  });

  expect(updateClipTransform).not.toHaveBeenCalled();
});
