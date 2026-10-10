// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewPlayback } from './use-playback';

it('previews cuts, speed and mute in source time, restores audio, and cancels its frame loop', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const cancel = vi.fn();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 7)
  );
  vi.stubGlobal('cancelAnimationFrame', cancel);
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  function Harness() {
    hook = useReviewPlayback({
      duration: 10,
      boundaries: () => [0, 2, 4, 6, 8, 10],
      edits: [
        { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
        {
          id: 'speed',
          kind: 'speed',
          start: 4,
          end: 6,
          requestedStart: 4,
          requestedEnd: 6,
          rate: 4,
          audio: 'mute',
        },
      ],
      onSeek: vi.fn(),
      onFailure: vi.fn(),
      original: { muted: false, volume: 0.25 },
    });
    return <video ref={hook.video} />;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.seek(2.7));
    expect(hook.time).toBe(2);
    act(() => hook.seek(2.7, false));
    expect(hook.time).toBe(2.7);
    act(() => hook.setPlaying(true));
    act(() => hook.onTime(2.7));
    expect(hook.time).toBe(4);
    expect(hook.video.current!.playbackRate).toBe(4);
    expect(hook.video.current!.muted).toBe(true);
    expect(hook.video.current!.preservesPitch).toBe(true);
    act(() => hook.onTime(6));
    expect(hook.video.current!.playbackRate).toBe(1);
    expect(hook.video.current!.muted).toBe(false);
    expect(hook.video.current!.volume).toBe(0.25);
    act(() => hook.onTime(10));
    expect(pause).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    expect(cancel).toHaveBeenCalledWith(7);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it('mutes source playback for recording and restores the authored audio setting', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  let silent = false;
  function Harness() {
    hook = useReviewPlayback({
      duration: 10,
      boundaries: () => undefined,
      edits: [],
      onSeek: vi.fn(),
      onFailure: vi.fn(),
      original: { muted: false, volume: 0.75 },
      silent,
    });
    return <video ref={hook.video} />;
  }
  try {
    act(() => root.render(<Harness />));
    expect(hook.video.current!.muted).toBe(false);
    silent = true;
    act(() => root.render(<Harness />));
    act(() => hook.onTime(2));
    expect(hook.video.current!.muted).toBe(true);
    silent = false;
    act(() => root.render(<Harness />));
    expect(hook.video.current!.muted).toBe(false);
    expect(hook.video.current!.volume).toBe(0.75);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it.each([2.123456789, 0.12956810631229235])(
  'lands past fractional cut end %s without an endless seek loop',
  (end) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const root = createRoot(document.createElement('div'));
    let hook!: ReturnType<typeof useReviewPlayback>;
    function Harness() {
      hook = useReviewPlayback({
        duration: 10,
        boundaries: () => undefined,
        edits: [
          {
            id: 'cut',
            kind: 'cut',
            start: end / 2,
            end,
            requestedStart: end / 2,
            requestedEnd: end,
          },
        ],
        onSeek: vi.fn(),
        onFailure: vi.fn(),
        original: { muted: true, volume: 1 },
      });
      return <video ref={hook.video} />;
    }
    try {
      act(() => root.render(<Harness />));
      let currentTime = end / 2 + 0.01;
      const seek = vi.fn((value: number) => {
        currentTime = Math.floor(value * 1e6) / 1e6;
      });
      Object.defineProperty(hook.video.current!, 'currentTime', {
        get: () => currentTime,
        set: seek,
      });
      act(() => hook.setPlaying(true));
      act(() => hook.onTime(currentTime));
      act(() => hook.onTime(currentTime));
      expect(currentTime).toBeGreaterThanOrEqual(end);
      expect(seek).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);

it('traverses cut source time while recording, preserves kept speed and restores cut skipping', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  let recording = true;
  function Harness() {
    hook = useReviewPlayback({
      duration: 12,
      boundaries: () => undefined,
      onSeek: vi.fn(),
      onFailure: vi.fn(),
      original: { muted: false, volume: 1 },
      silent: recording,
      retainCutTime: recording,
      edits: [
        { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
        {
          id: 'speed',
          kind: 'speed',
          start: 1,
          end: 8,
          requestedStart: 1,
          requestedEnd: 8,
          rate: 2,
          audio: 'speed',
        },
      ],
    });
    return <video ref={hook.video} />;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.setPlaying(true));
    act(() => hook.onTime(3));
    expect(hook.time).toBe(3);
    expect(hook.video.current!.playbackRate).toBe(1);
    expect(hook.video.current!.muted).toBe(true);
    act(() => hook.onTime(4));
    expect(hook.video.current!.playbackRate).toBe(2);
    recording = false;
    act(() => root.render(<Harness />));
    act(() => hook.onTime(3));
    expect(hook.time).toBe(4);
    expect(hook.video.current!.muted).toBe(false);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('owns replaceable unsnapped loops, rejects cut-only ranges and clears only explicit outside seeks', () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 1.23, end: 5 }));
    expect(test.hook.time).toBe(1.23);
    expect(test.play).not.toHaveBeenCalled();
    act(() => test.hook.setPlaying(true));
    const beforeCut = test.hook.seekRevision;
    act(() => test.hook.onTime(2.5));
    expect(test.hook.seekRevision).toBe(beforeCut);
    expect(test.hook.time).toBe(4);
    expect(test.hook.video.current!.playbackRate).toBe(2);
    expect(test.hook.video.current!.muted).toBe(true);
    act(() => test.hook.onTime(5.01));
    expect(test.hook.time).toBe(1.23);
    expect(test.hook.video.current!.playbackRate).toBe(1);
    expect(test.hook.video.current!.muted).toBe(false);
    act(() => test.hook.setPlaybackRange({ start: 2.5, end: 3.5 }));
    expect(test.invalid).toHaveBeenCalledOnce();
    expect(test.hook.playbackRange).toEqual({ start: 1.23, end: 5 });
    act(() => test.hook.setPlaybackRange({ start: 4.1, end: 4.2 }));
    expect(test.hook.playing).toBe(true);
    const revision = test.hook.seekRevision;
    act(() => test.hook.onTime(4.2));
    expect(test.hook.time).toBeCloseTo(4.1, 5);
    expect(test.hook.seekRevision).toBeGreaterThan(revision);
    act(() => test.hook.seek(4.15, false));
    expect(test.hook.playbackRange).not.toBeNull();
    act(() => test.hook.setPlaybackRange(null));
    expect(test.hook.time).toBe(4.15);
    expect(test.hook.playing).toBe(true);
    act(() => test.hook.setPlaybackRange({ start: 4.1, end: 4.2 }));
    act(() => test.hook.seek(6, false));
    expect(test.hook.playbackRange).toBeNull();
    expect(test.hook.time).toBe(6);
  } finally {
    test.dispose();
  }
});

it('returns before a cut crossing the loop end, restarts native ended, and suspends during recording', () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 1, end: 3 }));
    act(() => test.hook.setPlaying(true));
    act(() => test.hook.onTime(2.1));
    expect(test.hook.time).toBe(1);
    act(() => test.hook.setPlaybackRange({ start: 8, end: 10 }));
    act(() => test.hook.setPlaying(false)); // Native pause may precede ended.
    act(() => test.hook.onEnded());
    expect(test.hook.time).toBe(8);
    expect(test.play).toHaveBeenCalledOnce();
    test.update({ retainCutTime: true, silent: true });
    act(() => test.hook.seek(2.5, false));
    act(() => test.hook.onTime(3));
    expect(test.hook.time).toBe(3);
    expect(test.hook.playbackRange).toEqual({ start: 8, end: 10 });
    test.update({ retainCutTime: false, silent: false });
    expect(test.hook.time).toBe(8);
  } finally {
    test.dispose();
  }
});

it('clamps duration changes, clears and pauses an invalidated range, and never plays all-cut media', () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 4, end: 9 }));
    test.update({ duration: 7 });
    expect(test.hook.playbackRange).toEqual({ start: 4, end: 7 });
    act(() => test.hook.setPlaying(true));
    test.update({
      edits: [{ id: 'all', kind: 'cut', start: 0, end: 7, requestedStart: 0, requestedEnd: 7 }],
    });
    expect(test.hook.playbackRange).toBeNull();
    expect(test.hook.playing).toBe(false);
    expect(test.pause).toHaveBeenCalled();
    act(() => test.hook.play());
    expect(test.play).not.toHaveBeenCalled();
  } finally {
    test.dispose();
  }
});

function playbackHarness() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const invalid = vi.fn();
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  let props: Parameters<typeof useReviewPlayback>[0] = {
    duration: 10,
    boundaries: () => [0, 10],
    edits: [
      { id: 'cut', kind: 'cut', start: 2, end: 4, requestedStart: 2, requestedEnd: 4 },
      {
        id: 'speed',
        kind: 'speed',
        start: 4,
        end: 6,
        requestedStart: 4,
        requestedEnd: 6,
        rate: 2,
        audio: 'mute',
      },
    ],
    original: { muted: false, volume: 1 },
    onSeek: vi.fn(),
    onFailure: vi.fn(),
    onInvalidRange: invalid,
  };
  function Harness() {
    hook = useReviewPlayback(props);
    return <video ref={hook.video} />;
  }
  act(() => root.render(<Harness />));
  return {
    get hook() {
      return hook;
    },
    play,
    pause,
    invalid,
    update(patch: Partial<typeof props>) {
      props = { ...props, ...patch };
      act(() => root.render(<Harness />));
    },
    dispose() {
      act(() => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it.each([1.123456789, 3.123456789])(
  'rounds loop start %s forward on a microsecond media clock',
  (start) => {
    const test = playbackHarness();
    try {
      test.update({
        edits:
          start > 2
            ? [
                {
                  id: 'fractional',
                  kind: 'cut',
                  start: 2,
                  end: start,
                  requestedStart: 2,
                  requestedEnd: start,
                },
              ]
            : [],
      });
      let currentTime = 0;
      const seek = vi.fn((value: number) => {
        currentTime = Math.floor(value * 1e6) / 1e6;
      });
      Object.defineProperty(test.hook.video.current!, 'currentTime', {
        get: () => currentTime,
        set: seek,
      });
      act(() => test.hook.setPlaybackRange({ start: start > 2 ? 2.5 : start, end: 5 }));
      expect(currentTime).toBeGreaterThanOrEqual(start);
      act(() => test.hook.setPlaying(true));
      act(() => test.hook.onTime(currentTime));
      expect(seek).toHaveBeenCalledOnce();
      act(() => test.hook.onTime(5));
      expect(currentTime).toBeGreaterThanOrEqual(start);
      act(() => test.hook.onTime(currentTime));
      expect(seek).toHaveBeenCalledTimes(2);
    } finally {
      test.dispose();
    }
  }
);

it('clears a loop when duration leaves less than the minimum and discards it on remount', () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 8, end: 10 }));
    test.update({ duration: 8.02 });
    expect(test.hook.playbackRange).toBeNull();
    expect(test.pause).toHaveBeenCalled();
  } finally {
    test.dispose();
  }
  const reopened = playbackHarness();
  try {
    expect(reopened.hook.playbackRange).toBeNull();
  } finally {
    reopened.dispose();
  }
});

it('updates authored source ranges while paused and respects half-open mute boundaries', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  let ranges = [{ id: 'manual', start: 2, end: 6, volume: 0.25 }];
  function Harness() {
    hook = useReviewPlayback({
      duration: 10,
      boundaries: () => undefined,
      edits: [],
      onSeek: vi.fn(),
      onFailure: vi.fn(),
      original: {
        muted: false,
        volume: 2,
        ranges,
      },
    });
    return <video ref={hook.video} />;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.seek(4, false));
    expect(hook.video.current!.volume).toBe(0.5);
    ranges = [];
    act(() => root.render(<Harness />));
    expect(hook.video.current!.volume).toBe(1);
    ranges = [{ id: 'manual', start: 2, end: 6, volume: 0 }];
    act(() => root.render(<Harness />));
    expect(hook.video.current!.muted).toBe(true);
    act(() => hook.seek(6, false));
    expect(hook.video.current!.muted).toBe(false);
    expect(hook.video.current!.volume).toBe(1);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('reloads a failed decoder once, restores the source position and audio, and resumes transport', async () => {
  const test = playbackHarness();
  vi.useFakeTimers();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const recovered = vi.fn();
  const failure = vi.fn();
  try {
    test.update({ onRecovered: recovered, onFailure: failure });
    act(() => test.hook.setPlaybackRange({ start: 4, end: 8 }));
    act(() => test.hook.seek(5, false));
    act(() => test.hook.setPlaying(true));
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'error', { configurable: true, value: { code: 3 } });
    Object.defineProperty(node, 'readyState', { configurable: true, value: 3 });
    act(() => test.hook.onMediaError());
    expect(test.hook.playing).toBe(false);
    expect(test.hook.time).toBe(5);
    act(() => vi.advanceTimersByTime(500));
    expect(load).toHaveBeenCalledOnce();
    node.currentTime = 0;
    act(() => test.hook.onTime(0));
    expect(test.hook.time).toBe(5);
    act(() => node.dispatchEvent(new Event('loadedmetadata')));
    expect(node.currentTime).toBe(5);
    expect(node.playbackRate).toBe(2);
    expect(node.muted).toBe(true);
    await act(async () => node.dispatchEvent(new Event('canplay')));
    expect(test.play).toHaveBeenCalledOnce();
    expect(recovered).toHaveBeenCalledOnce();
    expect(test.hook.playbackRange).toEqual({ start: 4, end: 8 });
    act(() => test.hook.onMediaError());
    expect(failure).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(10000));
    expect(load).toHaveBeenCalledOnce();
  } finally {
    test.dispose();
    vi.useRealTimers();
  }
});

it('bounds recovery, allows explicit Play retry, preserves paused intent and ignores disposed completion', () => {
  const test = playbackHarness();
  vi.useFakeTimers();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const failure = vi.fn();
  try {
    test.update({ onFailure: failure });
    act(() => test.hook.seek(7, false));
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'error', { configurable: true, value: { code: 3 } });
    Object.defineProperty(node, 'readyState', { configurable: true, value: 3 });
    act(() => test.hook.onMediaError());
    act(() => vi.advanceTimersByTime(10000));
    expect(failure).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    Object.defineProperty(node, 'error', { configurable: true, value: null });
    act(() => test.hook.play());
    act(() => vi.advanceTimersByTime(500));
    expect(load).toHaveBeenCalledTimes(2);
    act(() => test.hook.seek(8, false));
    act(() => node.dispatchEvent(new Event('loadedmetadata')));
    expect(node.currentTime).toBe(8);
  } finally {
    const node = test.hook.video.current!;
    test.dispose();
    node.dispatchEvent(new Event('canplay'));
    vi.advanceTimersByTime(20000);
    expect(test.play).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledOnce();
    vi.useRealTimers();
  }
});

it.each([1, 2, 4])('reports native error %s without an automatic reload', (code) => {
  const test = playbackHarness();
  const failure = vi.fn();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  try {
    test.update({ onFailure: failure });
    Object.defineProperty(test.hook.video.current!, 'error', { value: { code } });
    act(() => test.hook.onMediaError());
    expect(failure).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  } finally {
    test.dispose();
  }
});

it('restores a paused frame only after new metadata and seek readiness', () => {
  const test = playbackHarness();
  vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const recovered = vi.fn();
  try {
    test.update({ onRecovered: recovered });
    act(() => test.hook.seek(7, false));
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'error', { value: { code: 3 } });
    Object.defineProperty(node, 'readyState', { value: 3 });
    Object.defineProperty(node, 'seeking', { configurable: true, value: true });
    act(() => test.hook.onMediaError());
    act(() => node.dispatchEvent(new Event('canplay')));
    expect(recovered).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    act(() => node.dispatchEvent(new Event('loadedmetadata')));
    act(() => node.dispatchEvent(new Event('canplay')));
    expect(test.hook.recovering).toBe(true);
    Object.defineProperty(node, 'seeking', { value: false });
    act(() => node.dispatchEvent(new Event('seeked')));
    expect(test.hook.recovering).toBe(false);
    expect(test.hook.time).toBe(7);
    expect(recovered).toHaveBeenCalledOnce();
    expect(test.play).not.toHaveBeenCalled();
  } finally {
    test.dispose();
    vi.useRealTimers();
  }
});

it('cancels a second decoder failure without reloading again', () => {
  const test = playbackHarness();
  vi.useFakeTimers();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const failure = vi.fn();
  try {
    test.update({ onFailure: failure });
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'error', { value: { code: 3 } });
    act(() => test.hook.onMediaError());
    act(() => vi.advanceTimersByTime(500));
    act(() => test.hook.onMediaError());
    act(() => vi.advanceTimersByTime(20000));
    expect(test.hook.recovering).toBe(false);
    expect(load).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledOnce();
  } finally {
    test.dispose();
    vi.useRealTimers();
  }
});
