// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { PlaybackPreviewRuntime } from '../../interaction/playback/types';

interface PlaybackControls {
  registerPreviewRuntime: (runtime: PlaybackPreviewRuntime | null) => void;
  setPlaybackPlaying: (playing: boolean) => void;
}

interface PlaybackHarnessProps {
  currentTime: number;
  project: ReturnType<typeof createEmptyVideoProject>;
  setCurrentTime: (time: number) => void;
  setPlaying: (playing: boolean) => void;
  useVideoEditorPlayback: (typeof import('./playback'))['useVideoEditorPlayback'];
  onPlaybackReady: (controls: PlaybackControls) => void;
}

function PlaybackHarness(props: PlaybackHarnessProps) {
  const playback = props.useVideoEditorPlayback(
    props.project,
    {
      currentTime: props.currentTime,
      isPlaying: false,
      playbackRange: null,
      selection: { kind: VideoEditorSelectionKind.CLIP, clipId: 'clip-1' } as never,
      placementMode: null,
      selectedClipId: null,
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

  props.onPlaybackReady({
    registerPreviewRuntime: playback.registerPreviewRuntime,
    setPlaybackPlaying: playback.setPlaybackPlaying,
  });
  return null;
}

function renderPlaybackHarness(root: Root | null, props: PlaybackHarnessProps): void {
  act(() => {
    root?.render(<PlaybackHarness {...props} />);
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('returns playback to paused when async preview preparation rejects', async () => {
  const useVideoEditorPlayback = (await import('./playback')).useVideoEditorPlayback;
  const project = createEmptyVideoProject('Playback rejection');
  const setCurrentTime = vi.fn<(time: number) => void>();
  const setPlaying = vi.fn<(playing: boolean) => void>();
  const controlsRef: { current: PlaybackControls | null } = { current: null };

  renderPlaybackHarness(root, {
    currentTime: 0.25,
    onPlaybackReady: (value) => {
      controlsRef.current = value;
    },
    project,
    setCurrentTime,
    setPlaying,
    useVideoEditorPlayback,
  });

  const controls = controlsRef.current;
  if (controls === null) {
    throw new Error('Expected playback controls');
  }

  controls.registerPreviewRuntime({
    cancel: vi.fn(),
    prepare: () => Promise.reject(new Error('prep failed')),
    present: vi.fn(),
    settle: vi.fn(),
    subscribe: () => () => undefined,
  });
  await act(async () => {
    controls.setPlaybackPlaying(true);
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(setCurrentTime).toHaveBeenCalledWith(0.25);
  expect(setPlaying).toHaveBeenCalledWith(false);
  expect(setPlaying).not.toHaveBeenCalledWith(true);
});
