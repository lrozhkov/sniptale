// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createPlaybackLatestState } from './state';
import { usePlaybackTicker } from './ticker';
import type { PlaybackRefState, PlaybackPreviewRuntime } from '../../../interaction/playback/types';

it('holds its initial frame for stale RAF time and keeps the anchor through inspector edits', () => {
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
  const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const root = createRoot(document.createElement('div'));
  let project = createEmptyVideoProject('Playback');
  project.duration = 20;
  project.fps = 60;
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
      editCommentDocument: vi.fn(),
      deleteSourceVoiceover: vi.fn(),
      duplicateSourceVoiceover: vi.fn(() => null),
      deleteEffectInstance: vi.fn(),
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
    act(() => callback(984));
    expect(present).toHaveBeenLastCalledWith(4);
    expect(handlersRef.current.setCurrentTime).toHaveBeenLastCalledWith(4);
    for (let i = 1; i <= 8; i++) {
      clock.mockReturnValue(1000 + i * 100);
      project = { ...project, name: `Edit ${i}` };
      act(() => root.render(<Harness />));
      act(() => callback(1000 + i * 100));
      expect(playbackRef.current).toBe(anchor);
    }
    const times = present.mock.calls.map(([time]) => time as number);
    expect(times.at(-1)).toBeCloseTo(4.8);
    expect(times.every((time, index) => index === 0 || time > times[index - 1]!)).toBe(true);
    project = { ...project, duration: 4.85 };
    act(() => root.render(<Harness />));
    act(() => callback(1900));
    expect(handlersRef.current.setPlaying).toHaveBeenCalledWith(false);
    project = { ...project, id: 'another-project', duration: 20 };
    clock.mockReturnValue(2000);
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

function controlledWakes(fps = 5, range: Parameters<typeof createPlaybackLatestState>[2] = null) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let sequence = 0,
    now = 0,
    playing = true;
  const raf = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { callback: () => void; delay: number }>();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++sequence;
      raf.set(id, callback);
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => raf.delete(id))
  );
  vi.stubGlobal(
    'setTimeout',
    vi.fn((callback: () => void, delay: number) => {
      const id = ++sequence;
      timers.set(id, { callback, delay });
      return id;
    })
  );
  vi.stubGlobal(
    'clearTimeout',
    vi.fn((id: number) => timers.delete(id))
  );
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
  const project = { ...createEmptyVideoProject('Controlled wakes'), duration: 1, fps };
  const playback = { current: null as PlaybackRefState | null };
  const latest = {
    current: createPlaybackLatestState(
      0,
      true,
      range,
      project,
      { kind: 'scene' },
      null,
      false,
      null,
      null,
      null
    ),
  };
  const runtime = {
    current: {
      present: vi.fn(),
      settle: vi.fn(),
      prepare: vi.fn(),
      cancel: vi.fn(),
      subscribe: () => () => {},
    } as PlaybackPreviewRuntime,
  };
  const handlers = {
    current: {
      setPlaying: vi.fn(),
      setCurrentTime: vi.fn(),
      splitClipAt: vi.fn(),
      deleteClip: vi.fn(),
      duplicateClip: vi.fn(),
      deleteActionEvent: vi.fn(),
      deleteCursorSample: vi.fn(),
      editCommentDocument: vi.fn(),
      deleteSourceVoiceover: vi.fn(),
      duplicateSourceVoiceover: vi.fn(() => null),
      deleteEffectInstance: vi.fn(),
      deleteMotionRegion: vi.fn(),
      deleteObjectTrack: vi.fn(),
      clearPlacementMode: vi.fn(),
      updateClipTransform: vi.fn(),
      updateActionEventDetails: vi.fn(),
      updateMotionRegion: vi.fn(),
    },
  };
  const root = createRoot(document.createElement('div'));
  function Harness() {
    usePlaybackTicker(playback, runtime, latest, handlers, project, playing);
    return null;
  }
  act(() => root.render(<Harness />));
  return {
    raf,
    timers,
    runtime,
    handlers,
    timer(time: number) {
      const first = timers.entries().next().value;
      if (!first) throw new Error('Expected a scheduled timer wake');
      timers.delete(first[0]);
      now = time;
      act(() => first[1].callback());
    },
    frame(timestamp: number, actualNow = timestamp) {
      const first = raf.entries().next().value;
      if (!first) throw new Error('Expected a scheduled RAF wake');
      raf.delete(first[0]);
      now = actualNow;
      act(() => first[1](timestamp));
    },
    stop() {
      playing = false;
      act(() => root.render(<Harness />));
    },
    dispose() {
      act(() => root.unmount());
      clock.mockRestore();
      vi.unstubAllGlobals();
    },
  };
}

it('advances the shared clock and reaches EOF while RAF delivery is withheld', () => {
  const f = controlledWakes();
  try {
    expect([...f.timers.values()][0]?.delay).toBe(200);
    f.timer(200);
    f.timer(600);
    expect(vi.mocked(f.runtime.current.present).mock.calls).toEqual([[0.2], [0.6]]);
    expect(f.handlers.current.setCurrentTime).toHaveBeenLastCalledWith(0.6);
    f.timer(1000);
    expect(f.runtime.current.settle).toHaveBeenCalledWith(0);
    expect(f.handlers.current.setPlaying).toHaveBeenCalledWith(false);
    expect(f.raf.size).toBe(0);
    expect(f.timers.size).toBe(0);
  } finally {
    f.dispose();
  }
});

it('does not regress or duplicate presentation when a stale RAF arrives after a timer wake', () => {
  const f = controlledWakes();
  try {
    f.timer(600);
    f.frame(200, 600);
    expect(vi.mocked(f.runtime.current.present).mock.calls).toEqual([[0.6]]);
    expect(f.handlers.current.setCurrentTime).toHaveBeenCalledTimes(1);
  } finally {
    f.dispose();
  }
});

it.each(['stop', 'unmount', 'range-stop'] as const)(
  'cancels both wakes on %s and ignores a late callback',
  (reason) => {
    const f = controlledWakes(
      5,
      reason === 'range-stop' ? { start: 0.2, end: 0.6, loop: false } : null
    );
    try {
      const lateRaf = [...f.raf.values()][0]!;
      const lateTimer = [...f.timers.values()][0]?.callback;
      if (reason === 'range-stop') f.timer(400);
      else if (reason === 'stop') f.stop();
      else f.dispose();
      expect(f.raf.size).toBe(0);
      expect(f.timers.size).toBe(0);
      const calls = vi.mocked(f.runtime.current.present).mock.calls.length;
      act(() => {
        lateRaf(900);
        lateTimer?.();
      });
      expect(f.runtime.current.present).toHaveBeenCalledTimes(calls);
      expect(f.raf.size).toBe(0);
      expect(f.timers.size).toBe(0);
    } finally {
      if (reason !== 'unmount') f.dispose();
    }
  }
);

it('retains 60fps visual RAF requests while the timer and UI use the existing publish interval', () => {
  const f = controlledWakes(60);
  try {
    f.frame(1000 / 60);
    f.frame(2000 / 60);
    f.frame(3000 / 60);
    expect(f.runtime.current.present).toHaveBeenCalledTimes(3);
    expect(f.handlers.current.setCurrentTime).toHaveBeenCalledTimes(2);
    expect([...f.timers.values()][0]?.delay).toBeCloseTo(1000 / 30);
  } finally {
    f.dispose();
  }
});
