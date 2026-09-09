// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createPlaybackLatestState } from './state';
import { usePlaybackTicker } from './ticker';
import type { PlaybackRefState, PlaybackPreviewRuntime } from '../../../interaction/playback/types';

it('keeps the transport anchor through inspector edits while reading current project limits', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let callback: FrameRequestCallback = () => {};
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const root = createRoot(document.createElement('div'));
  let project = createEmptyVideoProject('Playback');
  project.duration = 20;
  let playing = true;
  const playbackRef = { current: null as PlaybackRefState | null };
  const latestStateRef = {
    current: createPlaybackLatestState(
      4,
      true,
      null,
      project,
      { kind: 'scene' },
      null,
      false,
      null,
      null,
      null
    ),
  };
  const present = vi.fn();
  const previewRuntimeRef = {
    current: {
      present,
      settle: vi.fn(),
      prepare: vi.fn(),
      cancel: vi.fn(),
      subscribe: () => () => {},
    } as PlaybackPreviewRuntime,
  };
  const handlersRef = {
    current: {
      setPlaying: vi.fn(),
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
    },
  };
  function Harness() {
    latestStateRef.current = { ...latestStateRef.current, project };
    usePlaybackTicker(
      playbackRef,
      previewRuntimeRef,
      latestStateRef,
      handlersRef,
      project,
      playing
    );
    return null;
  }
  try {
    act(() => root.render(<Harness />));
    const anchor = playbackRef.current;
    for (let i = 1; i <= 8; i++) {
      clock.mockReturnValue(i * 100);
      project = { ...project, name: `Edit ${i}` };
      act(() => root.render(<Harness />));
      act(() => callback(i * 100));
      expect(playbackRef.current).toBe(anchor);
    }
    const times = present.mock.calls.map(([time]) => time as number);
    expect(times.at(-1)).toBeCloseTo(4.8);
    expect(times.every((time, index) => index === 0 || time > times[index - 1]!)).toBe(true);
    project = { ...project, duration: 4.85 };
    act(() => root.render(<Harness />));
    act(() => callback(900));
    expect(handlersRef.current.setPlaying).toHaveBeenCalledWith(false);
    project = { ...project, id: 'another-project', duration: 20 };
    clock.mockReturnValue(1000);
    act(() => root.render(<Harness />));
    expect(playbackRef.current).not.toBe(anchor);
    playing = false;
    act(() => root.render(<Harness />));
    expect(playbackRef.current).toBeNull();
  } finally {
    act(() => root.unmount());
    clock.mockRestore();
    vi.unstubAllGlobals();
  }
});
