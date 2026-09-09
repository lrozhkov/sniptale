// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { useVideoEditorPlayback, type VideoEditorPlaybackController } from './index';
import type { PlaybackPreviewRuntime } from '../../../interaction/playback/types';

it('exposes pending preparation and cancels it on a second toggle without starting late', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const project = createEmptyVideoProject('Preparation');
  project.duration = 5;
  const controls: { current: VideoEditorPlaybackController | null } = { current: null };
  let playing = false;
  let activeProject: typeof project | null = project;
  const setPlaying = vi.fn((value: boolean) => {
    playing = value;
  });
  const deferred = Promise.withResolvers<'video-cache-ready'>();
  const runtime: PlaybackPreviewRuntime = {
    prepare: vi.fn(() => deferred.promise),
    cancel: vi.fn(),
    present: vi.fn(),
    settle: vi.fn(),
    subscribe: () => () => {},
  };
  function Harness() {
    controls.current = useVideoEditorPlayback(
      activeProject,
      {
        currentTime: 0,
        isPlaying: playing,
        playbackRange: null,
        projectHistoryTransactionActive: false,
        shortcutsEnabled: false,
        selection: { kind: 'scene' },
        placementMode: null,
        selectedClipId: null,
        selectedActionOccurrence: null,
        selectedMotionRegion: null,
      },
      {
        setPlaying,
        setCurrentTime: vi.fn(),
        splitClipAt: vi.fn(),
        deleteClip: vi.fn(),
        duplicateClip: vi.fn(),
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
  try {
    act(() => root.render(<Harness />));
    expect(controls.current?.isPreparingPlayback).toBe(false);
    act(() => controls.current?.registerPreviewRuntime(runtime));
    act(() => controls.current?.seekTo(2));
    expect(controls.current?.isPreparingPlayback).toBe(false);
    act(() => controls.current?.togglePlayback());
    expect(controls.current?.isPreparingPlayback).toBe(true);
    act(() => controls.current?.togglePlayback());
    expect(controls.current?.isPreparingPlayback).toBe(false);
    expect(runtime.cancel).toHaveBeenCalled();
    await act(async () => {
      deferred.resolve('video-cache-ready');
      await deferred.promise;
    });
    expect(setPlaying).not.toHaveBeenCalledWith(true);
    act(() => controls.current?.togglePlayback());
    await act(async () => {
      await deferred.promise;
    });
    expect(controls.current?.isPreparingPlayback).toBe(false);
    expect(setPlaying).toHaveBeenCalledWith(true);
    act(() => root.render(<Harness />));
    act(() => controls.current?.stepByFrames(1));
    act(() => controls.current?.stepByFrames(Number.NaN));
    act(() => controls.current?.stepByFrames(0));
    activeProject = null;
    act(() => root.render(<Harness />));
    act(() => controls.current?.stepByFrames(1));

    expect(controls.current?.isPreparingPlayback).toBe(false);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
