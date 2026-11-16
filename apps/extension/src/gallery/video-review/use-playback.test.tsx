import { useReviewFreezePlayback } from './use-freeze-playback';
// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewPlayback } from './use-playback';

function signalNativePlayback(hook: ReturnType<typeof useReviewPlayback>, playing: boolean) {
  const node = hook.video.current;
  if (node && node.paused === playing)
    Object.defineProperty(node, 'paused', { configurable: true, value: !playing });
  hook.setPlaying(playing);
}

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
    act(() => signalNativePlayback(hook, true));
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
      act(() => signalNativePlayback(hook, true));
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
    act(() => signalNativePlayback(hook, true));
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
    act(() => signalNativePlayback(test.hook, true));
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
    const navigationRevision = test.hook.navigationRevision;
    act(() => test.hook.onTime(4.2));
    expect(test.hook.time).toBeCloseTo(4.1, 5);
    expect(test.hook.seekRevision).toBeGreaterThan(revision);
    expect(test.hook.navigationRevision).toBe(navigationRevision);
    act(() => test.hook.seek(4.15, false));
    expect(test.hook.navigationRevision).toBe(navigationRevision + 1);
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
    act(() => signalNativePlayback(test.hook, true));
    act(() => test.hook.onTime(2.1));
    expect(test.hook.time).toBe(1);
    act(() => test.hook.setPlaybackRange({ start: 8, end: 10 }));
    act(() => signalNativePlayback(test.hook, false)); // Native pause may precede ended.
    act(() => test.hook.onEnded());
    expect(test.hook.time).toBe(8);
    expect(test.play).toHaveBeenCalledOnce();
    test.update({ retainCutTime: true, silent: true });
    act(() => test.hook.seek(2.5, false));
    act(() => test.hook.onTime(3));
    expect(test.hook.time).toBe(3);
    expect(test.hook.playbackRange).toBeNull();
    test.update({ retainCutTime: false, silent: false });
    expect(test.hook.time).toBe(2.5);
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
    act(() => signalNativePlayback(test.hook, true));
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
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 101));
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
  });
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
      act(() => signalNativePlayback(test.hook, true));
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
    act(() => signalNativePlayback(test.hook, true));
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

it('keeps native playback exact while the current manual publication owns the display clock', () => {
  const test = playbackHarness();
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const video = test.hook.video.current!;
  Object.defineProperty(video, 'paused', { configurable: true, value: false });
  try {
    act(() => signalNativePlayback(test.hook, true));
    const active = test.hook.setPresentationActive;
    const publish = test.hook.onPresentedTime;
    act(() => active('first', true));
    video.currentTime = 2.7;
    act(() => frame!(0));
    expect(video.currentTime).toBe(4);
    expect(video.playbackRate).toBe(2);
    expect(video.muted).toBe(true);
    expect(test.hook.time).toBe(0);
    act(() => publish('first', 3.9));
    expect(test.hook.time).toBe(3.9);
    expect(test.hook.setPresentationActive).toBe(active);
    expect(test.hook.onPresentedTime).toBe(publish);
    act(() => {
      active('second', true);
      active('first', false);
      publish('first', 1);
    });
    video.currentTime = 6.5;
    act(() => frame!(1));
    expect(test.hook.time).toBe(3.9);
    act(() => publish('second', 6.4));
    expect(test.hook.time).toBe(6.4);
    act(() => active('second', false));
    act(() => frame!(2));
    expect(test.hook.time).toBe(6.5);
    act(() => active('second', true));
    video.currentTime = 6.8;
    Object.defineProperty(video, 'paused', { configurable: true, value: true });
    act(() => video.dispatchEvent(new Event('pause')));
    expect(test.hook.time).toBe(6.8);
    act(() => publish('second', 6.4));
    expect(test.hook.time).toBe(6.8);
    act(() => test.hook.seek(7.1, false));
    expect(test.hook.time).toBe(7.1);
  } finally {
    test.dispose();
  }
});

it.each(['time', 'presented', 'ended', 'frame', 'pause'] as const)(
  'publishes the project endpoint from browser-rounded EOF via %s without a corrective media seek',
  (path) => {
    const test = playbackHarness();
    const duration = 26.283316666666664;
    const browserTime = 26.283317;
    try {
      test.update({ duration, edits: [] });
      const node = test.hook.video.current!;
      const seek = vi.fn();
      Object.defineProperty(node, 'currentTime', { get: () => browserTime, set: seek });
      Object.defineProperty(node, 'paused', {
        value: path !== 'presented' && path !== 'frame',
        configurable: true,
      });
      let advance: FrameRequestCallback | undefined;
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        advance = callback;
        return 1;
      });
      act(() => signalNativePlayback(test.hook, true));
      if (path === 'presented') {
        act(() => test.hook.setPresentationActive('source', true));
        act(() => test.hook.onPresentedTime('source', browserTime));
      } else if (path === 'frame') {
        expect(advance).toBeDefined();
        act(() => advance!(0));
      } else if (path === 'pause') act(() => node.dispatchEvent(new Event('pause')));
      else if (path === 'ended') act(() => test.hook.onEnded());
      else act(() => test.hook.onTime(browserTime));
      expect(test.hook.time).toBe(duration);
      expect(node.currentTime).toBe(browserTime);
      expect(seek).not.toHaveBeenCalled();
      expect(node.playbackRate).toBe(1);
      expect(node.volume).toBe(1);
      if (path === 'ended') expect(test.hook.playing).toBe(false);
    } finally {
      test.dispose();
    }
  }
);

it('keeps presented-time callbacks stable and uses the current duration without publishing invalid numbers', () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    const publish = test.hook.onPresentedTime;
    Object.defineProperty(test.hook.video.current!, 'paused', { value: false });
    act(() => test.hook.setPresentationActive('source', true));
    act(() => publish('source', 7));
    expect(test.hook.time).toBe(7);
    test.update({ duration: 5 });
    expect(test.hook.onPresentedTime).toBe(publish);
    act(() => publish('source', 5.0000001));
    expect(test.hook.time).toBe(5);
    act(() => publish('source', NaN));
    act(() => publish('source', Infinity));
    act(() => publish('other-source', 1));
    expect(test.hook.time).toBe(5);
    act(() => publish('source', -0.000001));
    expect(test.hook.time).toBe(0);
  } finally {
    test.dispose();
  }
});

it('clears a previous transport failure only after an explicit Play succeeds', async () => {
  const test = playbackHarness();
  const recovered = vi.fn(),
    failure = vi.fn();
  let accept!: () => void;
  test.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      })
  );
  try {
    test.update({ onRecovered: recovered, onFailure: failure });
    act(() => test.hook.play());
    expect(recovered).not.toHaveBeenCalled();
    await act(async () => {
      Object.defineProperty(test.hook.video.current!, 'paused', {
        configurable: true,
        value: false,
      });
      accept();
    });
    expect(recovered).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
    act(() => test.hook.pause());
    test.play.mockRejectedValueOnce(new Error('Playback refused'));
    await act(async () => test.hook.play());
    expect(recovered).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledOnce();
  } finally {
    test.dispose();
  }
});

it('ignores late Play success after the playback owner unmounts', async () => {
  const test = playbackHarness();
  const recovered = vi.fn(),
    failure = vi.fn();
  let accept!: () => void;
  test.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      })
  );
  test.update({ onRecovered: recovered, onFailure: failure });
  act(() => test.hook.play());
  test.dispose();
  await act(async () => accept());
  expect(recovered).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});

it('holds an automatic loop at its exact target until audio is prepared', async () => {
  const test = playbackHarness();
  let paused = true;
  let accept!: (ready: boolean) => void;
  const prepareAfterSeek = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        accept = resolve;
      })
  );
  const node = test.hook.video.current!;
  Object.defineProperty(node, 'paused', { configurable: true, get: () => paused });
  test.pause.mockImplementation(() => {
    paused = true;
  });
  test.play.mockImplementation(async () => {
    paused = false;
  });
  try {
    test.update({ prepareAfterSeek, edits: [] });
    act(() => test.hook.setPlaybackRange({ start: 1, end: 2 }));
    paused = false;
    act(() => signalNativePlayback(test.hook, true));
    await act(async () => test.hook.onTime(2.1));
    expect(paused).toBe(true);
    expect(node.currentTime).toBe(1);
    expect(prepareAfterSeek).toHaveBeenCalledOnce();
    expect(test.play).not.toHaveBeenCalled();
    await act(async () => accept(true));
    expect(test.play).toHaveBeenCalledOnce();
    expect(node.currentTime).toBe(1);
  } finally {
    test.dispose();
  }
});
it('replaces pending seek preparation without allowing an old result to resume playback', async () => {
  const test = playbackHarness();
  let paused = false;
  const gates: ((ready: boolean) => void)[] = [];
  const prepareAfterSeek = vi.fn(() => new Promise<boolean>((resolve) => gates.push(resolve)));
  const node = test.hook.video.current!;
  Object.defineProperty(node, 'paused', { configurable: true, get: () => paused });
  test.pause.mockImplementation(() => {
    paused = true;
  });
  test.play.mockImplementation(async () => {
    paused = false;
  });
  try {
    test.update({ prepareAfterSeek, edits: [] });
    await act(async () => test.hook.seek(3, false));
    expect(prepareAfterSeek).toHaveBeenCalledOnce();
    expect(paused).toBe(true);
    await act(async () => test.hook.seek(5, false));
    expect(prepareAfterSeek).toHaveBeenCalledTimes(2);
    await act(async () => gates[0]!(true));
    expect(test.play).not.toHaveBeenCalled();
    await act(async () => gates[1]!(true));
    expect(test.play).toHaveBeenCalledOnce();
    expect(node.currentTime).toBe(5);
  } finally {
    test.dispose();
  }
});
it('keeps a refused audio seek paused and ignores a preparation result after unmount', async () => {
  const test = playbackHarness();
  let paused = false;
  let accept!: (ready: boolean) => void;
  const prepareAfterSeek = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        accept = resolve;
      })
  );
  const node = test.hook.video.current!;
  Object.defineProperty(node, 'paused', { configurable: true, get: () => paused });
  test.pause.mockImplementation(() => {
    paused = true;
  });
  try {
    test.update({ prepareAfterSeek, edits: [] });
    await act(async () => test.hook.seek(3, false));
    await act(async () => accept(false));
    expect(test.play).not.toHaveBeenCalled();
    expect(paused).toBe(true);
    paused = false;
    await act(async () => test.hook.seek(5, false));
    test.dispose();
    await act(async () => accept(true));
    expect(test.play).not.toHaveBeenCalled();
  } catch (error) {
    test.dispose();
    throw error;
  }
});

it('keeps urgent seek and pause ahead of a pending presented-time transition', () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'paused', { configurable: true, value: false });
    act(() => test.hook.setPresentationActive('source', true));
    act(() => {
      test.hook.onPresentedTime('source', 3);
      test.hook.seek(7, false);
    });
    expect(test.hook.time).toBe(7);
    expect(node.currentTime).toBe(7);
    Object.defineProperty(node, 'paused', { configurable: true, value: true });
    act(() => {
      node.dispatchEvent(new Event('pause'));
      test.hook.onPresentedTime('source', 4);
    });
    expect(test.hook.time).toBe(7);
  } finally {
    test.dispose();
  }
});

it('publishes the final media sample on Pause before the queued native pause event', () => {
  const test = playbackHarness();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  );
  let paused = false;
  try {
    test.update({ edits: [] });
    const node = test.hook.video.current!;
    Object.defineProperty(node, 'paused', { configurable: true, get: () => paused });
    // Browsers queue the pause event; the command must be correct before that event arrives.
    test.pause.mockImplementation(() => {
      paused = true;
    });
    act(() => signalNativePlayback(test.hook, true));
    act(() => test.hook.setPresentationActive('source', true));
    node.currentTime = 2.65;
    act(() => test.hook.onPresentedTime('source', 2.65));
    node.currentTime = 2.8;
    const seekRevision = test.hook.seekRevision;
    const navigationRevision = test.hook.navigationRevision;
    const frames = vi.mocked(requestAnimationFrame).mock.calls.length;
    act(() => test.hook.pause());
    expect(test.hook.playing).toBe(false);
    expect(test.hook.time).toBe(2.8);
    expect(test.hook.playheadClock?.read()).toBe(2.8);
    expect(node.currentTime).toBe(2.8);
    expect(test.hook.seekRevision).toBe(seekRevision);
    expect(test.hook.navigationRevision).toBe(navigationRevision);
    expect(vi.mocked(requestAnimationFrame).mock.calls).toHaveLength(frames);
    act(() => {
      node.dispatchEvent(new Event('pause'));
      test.hook.onPresentedTime('source', 2.7);
    });
    expect(test.hook.time).toBe(2.8);
  } finally {
    test.dispose();
  }
});

it('holds the original sample while project time plays, pauses, resumes and is removed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let now = 0,
    paused = true,
    sequence = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(3);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (
    this: HTMLMediaElement
  ) {
    paused = false;
    this.dispatchEvent(new Event('play'));
  });
  const root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewPlayback>;
  const hold = {
    id: 'hold',
    kind: 'freeze' as const,
    start: 4,
    end: 4,
    requestedStart: 4,
    requestedEnd: 4,
    duration: 2,
    frameTime: 3.98,
    frameDuration: 0.04,
  };
  let edits = [hold];
  function Harness() {
    hook = useReviewPlayback({
      duration: 12,
      edits,
      boundaries: () => undefined,
      onSeek() {},
      onFailure() {},
      original: { muted: false, volume: 1 },
    });
    return (
      <video
        ref={hook.video}
        onPlay={() => hook.setPlaying(true)}
        onPause={() => hook.setPlaying(false)}
      />
    );
  }
  const tick = (time: number) =>
    act(() => {
      now = time;
      const batch = [...callbacks.values()];
      callbacks.clear();
      batch.forEach((callback) => callback(time));
    });
  try {
    act(() => root.render(<Harness />));
    act(() => hook.seek(3.9, false));
    await act(async () => hook.play());
    hook.video.current!.currentTime = 4.01;
    tick(100);
    tick(200);
    tick(800);
    expect(hook.playing).toBe(true);
    expect(paused).toBe(true);
    expect(hook.video.current!.currentTime).toBe(3.98);
    expect(hook.readResultTime()).toBeCloseTo(4.6);
    act(() => hook.pause());
    tick(1200);
    expect(hook.readResultTime()).toBeCloseTo(4.6);
    await act(async () => hook.play());
    tick(1200);
    tick(2800);
    expect(hook.readResultTime()).toBeNull();
    expect(paused).toBe(false);
    hook.video.current!.currentTime = 3.99989;
    expect(hook.readResultTime()).toBe(6);
    hook.video.current!.currentTime = 4;
    act(() => hook.pause());
    act(() => hook.setPlaybackRange({ start: 4, end: 7 }));
    await act(async () => hook.play());
    tick(2900);
    tick(3000);
    tick(3200);
    expect(hook.readResultTime()).toBeCloseTo(4.2);
    act(() => hook.pause());
    act(() => hook.seekResult(5));
    expect(hook.playbackRange).toEqual({ start: 4, end: 7 });
    expect(hook.readResultTime()).toBe(5);
    edits = [];
    act(() => root.render(<Harness />));
    expect(hook.readResultTime()).toBeNull();
    expect(hook.playing).toBe(false);
    expect(hook.video.current!.currentTime).toBe(4);
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  'reports a hold-resume failure only while its playback request is current (looped=%s)',
  async (looped) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let now = 0,
      sequence = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    const video = document.createElement('video');
    let paused = false;
    Object.defineProperty(video, 'paused', { get: () => paused });
    Object.defineProperty(video, 'readyState', { value: 3 });
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {
      paused = true;
    });
    let rejectPlay!: (error: Error) => void;
    vi.spyOn(video, 'play').mockImplementation(() => {
      paused = false;
      return new Promise<void>((_resolve, reject) => {
        rejectPlay = reject;
      });
    });
    const onMediaError = vi.fn();
    const base = {
      video: { current: video },
      playing: true,
      time: 0,
      playbackRange: null,
      setPlaybackRange: vi.fn(),
      setPlaying: vi.fn(),
      seek: (time: number) => {
        video.pause();
        video.currentTime = time;
      },
      onTime: (time: number) => time,
      onEnded: vi.fn(),
      onMediaError,
      play: vi.fn(),
    };
    const edits = [
      {
        id: 'hold',
        kind: 'freeze' as const,
        start: 4,
        end: 4,
        requestedStart: 4,
        requestedEnd: 4,
        duration: 2,
        frameTime: 3.98,
        frameDuration: 0.04,
      },
    ];
    const root = createRoot(document.createElement('div'));
    let hook!: ReturnType<typeof useReviewFreezePlayback<typeof base>>;
    function Harness() {
      hook = useReviewFreezePlayback(base, edits, 12);
      return null;
    }
    const tick = (time: number) =>
      act(() => {
        now = time;
        const batch = [...frames.values()];
        frames.clear();
        batch.forEach((callback) => callback(time));
      });
    try {
      act(() => root.render(<Harness />));
      if (looped)
        act(() =>
          hook.setPlaybackRange({ start: 3.865, end: 6.105, result: { start: 3.865, end: 6.105 } })
        );
      act(() => hook.seekResult(4.5));
      tick(0);
      tick(1500);
      expect(rejectPlay).toBeDefined();
      if (looped) {
        video.currentTime = 4.2;
        tick(1600);
        expect(video.currentTime).toBe(3.865);
      }
      await act(async () =>
        rejectPlay(new DOMException('Play was interrupted by a new pause request', 'AbortError'))
      );
      expect(onMediaError).toHaveBeenCalledTimes(looped ? 0 : 1);
      expect(pause).toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }
);

it('does not replace a range restart while its native seek and Play are pending', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const node = document.createElement('video');
  let paused = false;
  let sourceTime = 6.2;
  Object.defineProperty(node, 'paused', { get: () => paused });
  Object.defineProperty(node, 'currentTime', { get: () => sourceTime, set: () => {} });
  const seek = vi.fn(() => {
    paused = true;
  });
  const edits: Parameters<typeof useReviewFreezePlayback>[1] = [];
  let hook!: ReturnType<typeof useReviewFreezePlayback>;
  function Harness() {
    hook = useReviewFreezePlayback(
      {
        video: { current: node },
        playing: true,
        time: sourceTime,
        playbackRange: null,
        setPlaybackRange() {},
        setPlaying() {},
        seek,
        onTime: (value: number) => value,
        onEnded() {},
        onMediaError() {},
        play() {},
      },
      edits,
      12
    );
    return null;
  }
  const local = createRoot(document.createElement('div'));
  const tick = () =>
    act(() => {
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((callback) => callback(100));
    });
  try {
    act(() => local.render(<Harness />));
    act(() =>
      hook.setPlaybackRange({ start: 3.865, end: 6.105, result: { start: 3.865, end: 6.105 } })
    );
    paused = false;
    seek.mockClear();
    tick();
    expect(seek).toHaveBeenCalledOnce();
    tick();
    tick();
    expect(seek).toHaveBeenCalledOnce();
    sourceTime = 3.865;
    paused = false;
    tick();
    expect(seek).toHaveBeenCalledOnce();
  } finally {
    act(() => local.unmount());
    vi.unstubAllGlobals();
  }
});
