// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewPlayback } from './use-playback';

function mediaReadyEvents(hook: ReturnType<typeof useReviewPlayback>) {
  return {
    onLoadedMetadata: () => hook.onMediaReady('metadata'),
    onSeeked: () => hook.onMediaReady('seeked'),
    onCanPlay: () => hook.onMediaReady('ready'),
  };
}

function signalNativePlayback(hook: ReturnType<typeof useReviewPlayback>, playing: boolean) {
  const node = hook.video.current;
  if (node && node.paused === playing)
    Object.defineProperty(node, 'paused', { configurable: true, value: !playing });
  const readiness =
    playing && !hook.transport.getStatusSnapshot().playing ? hook.play() : undefined;
  hook.onMediaPlayback(playing);
  return readiness;
}

function sample(hook: ReturnType<typeof useReviewPlayback>, time: number) {
  if (hook.video.current!.currentTime !== time) hook.video.current!.currentTime = time;
  return hook.onTime();
}

it('previews cuts, speed and mute in source time, restores audio, and cancels its frame loop', async () => {
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
    return <video ref={hook.video} {...mediaReadyEvents(hook)} />;
  }
  try {
    act(() => root.render(<Harness />));
    act(() => hook.seek(2.7));
    expect(hook.time).toBe(2);
    act(() => hook.seek(2.7, false));
    expect(hook.time).toBe(2.7);
    await act(async () => signalNativePlayback(hook, true));
    act(() => sample(hook, 2.7));
    expect(hook.playheadClock?.read()).toBe(4);
    expect(hook.video.current!.playbackRate).toBe(4);
    expect(hook.video.current!.muted).toBe(true);
    expect(hook.video.current!.preservesPitch).toBe(true);
    act(() => sample(hook, 6));
    expect(hook.video.current!.playbackRate).toBe(1);
    expect(hook.video.current!.muted).toBe(false);
    expect(hook.video.current!.volume).toBe(0.25);
    act(() => sample(hook, 10));
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
    return <video ref={hook.video} {...mediaReadyEvents(hook)} />;
  }
  try {
    act(() => root.render(<Harness />));
    expect(hook.video.current!.muted).toBe(false);
    silent = true;
    act(() => root.render(<Harness />));
    act(() => sample(hook, 2));
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
  async (end) => {
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
      return <video ref={hook.video} {...mediaReadyEvents(hook)} />;
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
      await act(async () => signalNativePlayback(hook, true));
      act(() => sample(hook, currentTime));
      act(() => sample(hook, currentTime));
      expect(currentTime).toBeGreaterThanOrEqual(end);
      expect(seek).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  }
);

it('traverses cut source time while recording, preserves kept speed and restores cut skipping', async () => {
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
    return <video ref={hook.video} {...mediaReadyEvents(hook)} />;
  }
  try {
    act(() => root.render(<Harness />));
    await act(async () => signalNativePlayback(hook, true));
    act(() => sample(hook, 3));
    expect(hook.playheadClock?.read()).toBe(3);
    expect(hook.video.current!.playbackRate).toBe(1);
    expect(hook.video.current!.muted).toBe(true);
    act(() => sample(hook, 4));
    expect(hook.video.current!.playbackRate).toBe(2);
    recording = false;
    act(() => root.render(<Harness />));
    act(() => sample(hook, 3));
    expect(hook.playheadClock?.read()).toBe(4);
    expect(hook.video.current!.muted).toBe(false);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('owns replaceable unsnapped loops, rejects cut-only ranges and clears only explicit outside seeks', async () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 1.23, end: 5 }));
    expect(test.hook.time).toBe(1.23);
    expect(test.play).not.toHaveBeenCalled();
    await act(async () => signalNativePlayback(test.hook, true));
    const beforeCut = test.hook.seekRevision;
    act(() => sample(test.hook, 2.5));
    expect(test.hook.seekRevision).toBe(beforeCut);
    expect(test.hook.playheadClock?.read()).toBe(4);
    expect(test.hook.video.current!.playbackRate).toBe(2);
    expect(test.hook.video.current!.muted).toBe(true);
    act(() => sample(test.hook, 5.01));
    expect(test.hook.time).toBe(1.23);
    expect(test.hook.video.current!.playbackRate).toBe(1);
    expect(test.hook.video.current!.muted).toBe(false);
    act(() => test.hook.setPlaybackRange({ start: 2.5, end: 3.5 }));
    expect(test.invalid).toHaveBeenCalledOnce();
    expect(test.hook.playbackRange).toEqual({ start: 1.23, end: 5 });
    act(() => test.hook.setPlaybackRange({ start: 4.1, end: 4.2 }));
    expect(test.hook.playing).toBe(false);
    await act(async () => signalNativePlayback(test.hook, true));
    const revision = test.hook.seekRevision;
    const navigationRevision = test.hook.navigationRevision;
    act(() => sample(test.hook, 4.2));
    expect(test.hook.time).toBeCloseTo(4.1, 5);
    expect(test.hook.seekRevision).toBeGreaterThan(revision);
    expect(test.hook.navigationRevision).toBe(navigationRevision);
    act(() => test.hook.seek(4.15, false));
    expect(test.hook.navigationRevision).toBe(navigationRevision + 1);
    expect(test.hook.playbackRange).not.toBeNull();
    act(() => test.hook.setPlaybackRange(null));
    expect(test.hook.time).toBe(4.15);
    expect(test.hook.playing).toBe(false);
    act(() => test.hook.setPlaybackRange({ start: 4.1, end: 4.2 }));
    act(() => test.hook.seek(6, false));
    expect(test.hook.playbackRange).toBeNull();
    expect(test.hook.time).toBe(6);
  } finally {
    test.dispose();
  }
});

it('returns before a cut crossing the loop end, restarts native ended, and suspends during recording', async () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 1, end: 3 }));
    await act(async () => signalNativePlayback(test.hook, true));
    act(() => sample(test.hook, 2.1));
    expect(test.hook.time).toBe(1);
    act(() => test.hook.setPlaybackRange({ start: 8, end: 10 }));
    await act(async () => signalNativePlayback(test.hook, true));
    test.play.mockClear();
    Object.defineProperty(test.hook.video.current!, 'ended', { configurable: true, value: true });
    test.hook.video.current!.currentTime = 10;
    act(() => signalNativePlayback(test.hook, false)); // Native pause may precede ended.
    act(() => test.hook.onEnded());
    expect(test.hook.time).toBe(8);
    expect(test.play).toHaveBeenCalledOnce();
    test.update({ retainCutTime: true, silent: true });
    act(() => test.hook.seek(2.5, false));
    await act(async () => signalNativePlayback(test.hook, true));
    act(() => sample(test.hook, 3));
    expect(test.hook.readPosition().media?.time).toBe(3);
    expect(test.hook.readPosition().resultTime).toBeNull();
    expect(test.hook.playbackRange).toBeNull();
    test.update({ retainCutTime: false, silent: false });
    expect(test.hook.time).toBe(2.5);
  } finally {
    test.dispose();
  }
});

it('clamps duration changes, clears and pauses an invalidated range, and never plays all-cut media', async () => {
  const test = playbackHarness();
  try {
    act(() => test.hook.setPlaybackRange({ start: 4, end: 9 }));
    test.update({ duration: 7 });
    expect(test.hook.playbackRange).toEqual({ start: 4, end: 7 });
    await act(async () => signalNativePlayback(test.hook, true));
    test.update({
      edits: [{ id: 'all', kind: 'cut', start: 0, end: 7, requestedStart: 0, requestedEnd: 7 }],
    });
    expect(test.hook.playbackRange).toBeNull();
    expect(test.hook.playing).toBe(false);
    expect(test.pause).toHaveBeenCalled();
    test.play.mockClear();
    act(() => {
      void test.hook.play();
    });
    expect(test.play).not.toHaveBeenCalled();
  } finally {
    test.dispose();
  }
});

function playbackHarness(strict = false, videoMounted = true) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
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
  let renders = 0;
  function Harness() {
    renders++;
    hook = useReviewPlayback(props);
    return videoMounted ? <video ref={hook.video} {...mediaReadyEvents(hook)} /> : null;
  }
  const render = () =>
    root.render(
      strict ? (
        <StrictMode>
          <Harness />
        </StrictMode>
      ) : (
        <Harness />
      )
    );
  act(render);
  return {
    get renders() {
      return renders;
    },
    get hook() {
      return hook;
    },
    play,
    pause,
    invalid,
    get activeFrames() {
      return frames.size;
    },
    tick(time: number) {
      act(() => {
        clock = time;
        const batch = [...frames.values()];
        frames.clear();
        batch.forEach((callback) => callback(time));
      });
    },
    update(patch: Partial<typeof props>) {
      props = { ...props, ...patch };
      act(render);
    },
    mountVideo() {
      videoMounted = true;
      act(render);
    },
    dispose() {
      act(() => root.unmount());
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    },
  };
}

it('observes a video mounted after the initial editor render without duplicating seek acknowledgements', () => {
  const test = playbackHarness(false, false);
  try {
    test.update({ edits: [] });
    test.mountVideo();
    const before = test.hook.readPosition().epoch;
    act(() => {
      test.hook.video.current!.currentTime = 4;
      test.hook.video.current!.dispatchEvent(new Event('seeked'));
    });
    expect(test.hook.time).toBe(4);
    expect(test.hook.readPosition()).toMatchObject({ epoch: before + 1, resultTime: 4 });
    act(() => test.hook.seek(6, false));
    const accepted = test.hook.readPosition();
    const status = test.hook.transport.getStatusSnapshot();
    act(() => test.hook.video.current!.dispatchEvent(new Event('seeked')));
    expect(test.hook.readPosition()).toEqual(accepted);
    expect(test.hook.transport.getStatusSnapshot()).toBe(status);
    test.update({
      edits: [
        {
          id: 'hold',
          kind: 'freeze',
          start: 4,
          end: 4,
          requestedStart: 4,
          requestedEnd: 4,
          duration: 2,
          frameTime: 3.98,
          frameDuration: 0.04,
        },
      ],
    });
    act(() => test.hook.seekResult(5));
    const held = test.hook.readPosition();
    expect(held).toMatchObject({
      resultTime: 5,
      source: { kind: 'freeze', sourceTime: 4, mediaTime: 3.98 },
    });
    act(() => test.hook.video.current!.dispatchEvent(new Event('seeked')));
    expect(test.hook.readPosition()).toEqual(held);
  } finally {
    test.dispose();
  }
});

it('retains one controller frame driver through StrictMode replay without clock-driven root commits', async () => {
  const test = playbackHarness(true);
  try {
    test.update({ edits: [] });
    const transport = test.hook.transport;
    await act(async () => test.hook.play());
    expect(test.hook.playing).toBe(true);
    expect(test.activeFrames).toBe(1);
    const renders = test.renders;
    test.hook.video.current!.currentTime = 1;
    test.tick(100);
    test.tick(200);
    expect(test.hook.transport).toBe(transport);
    expect(test.renders).toBe(renders);
    expect(test.activeFrames).toBe(1);
    act(() => test.hook.pause());
    expect(test.hook.time).toBe(1);
    expect(test.activeFrames).toBe(0);
  } finally {
    test.dispose();
  }
});

it('does not render the editor when a guarded action pauses an already paused transport', () => {
  const test = playbackHarness();
  try {
    const before = test.renders;
    act(() => test.hook.pause());
    act(() => test.hook.pause());
    expect(test.renders).toBe(before);
    expect(test.hook.playing).toBe(false);
  } finally {
    test.dispose();
  }
});

it('publishes continuous playback clocks without rendering the editor and commits the final pause', async () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    const node = test.hook.video.current!;
    await act(async () => signalNativePlayback(test.hook, true));
    const before = test.renders;
    for (const time of [1, 1.2, 1.4, 1.6]) {
      node.currentTime = time;
      act(() => test.hook.onTime());
      expect(test.hook.playheadClock?.read()).toBe(time);
    }
    expect(test.renders).toBe(before);
    act(() => test.hook.pause());
    expect(test.hook.time).toBe(1.6);
    expect(test.hook.playing).toBe(false);
  } finally {
    test.dispose();
  }
});

it.each([1.123456789, 3.123456789])(
  'rounds loop start %s forward on a microsecond media clock',
  async (start) => {
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
      await act(async () => signalNativePlayback(test.hook, true));
      act(() => sample(test.hook, currentTime));
      expect(seek).toHaveBeenCalledOnce();
      act(() => {
        currentTime = 5;
        test.hook.onTime();
      });
      expect(currentTime).toBeGreaterThanOrEqual(start);
      act(() => sample(test.hook, currentTime));
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
    return <video ref={hook.video} {...mediaReadyEvents(hook)} />;
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
    await act(async () => signalNativePlayback(test.hook, true));
    recovered.mockClear(); // Count recovery separately from the completed initial Play.
    const node = test.hook.video.current!;
    node.currentTime = 5.5;
    act(() => test.hook.onTime());
    expect(test.hook.time).toBe(5);
    Object.defineProperty(node, 'error', { configurable: true, value: { code: 3 } });
    Object.defineProperty(node, 'readyState', { configurable: true, value: 3 });
    act(() => test.hook.onMediaError());
    expect(test.hook.playing).toBe(false);
    expect(test.hook.time).toBe(5.5);
    act(() => vi.advanceTimersByTime(500));
    expect(load).toHaveBeenCalledOnce();
    node.currentTime = 0;
    act(() => sample(test.hook, 0));
    expect(test.hook.time).toBe(5.5);
    act(() => node.dispatchEvent(new Event('loadedmetadata')));
    expect(node.currentTime).toBe(5.5);
    expect(node.playbackRate).toBe(2);
    expect(node.muted).toBe(true);
    Object.defineProperty(node, 'error', { configurable: true, value: null });
    await act(async () => node.dispatchEvent(new Event('canplay')));
    expect(test.play).toHaveBeenCalledTimes(2);
    expect(recovered).toHaveBeenCalledOnce();
    expect(test.hook.playbackRange).toEqual({ start: 4, end: 8 });
    Object.defineProperty(node, 'error', { configurable: true, value: { code: 3 } });
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
    act(() => {
      void test.hook.play();
    });
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

it('keeps native playback exact and prevents a frame receipt from moving the logical clock', async () => {
  const test = playbackHarness();
  try {
    const node = test.hook.video.current!;
    await act(async () => signalNativePlayback(test.hook, true));
    node.currentTime = 2.7;
    act(() => test.hook.onTime());
    expect(node.currentTime).toBe(4);
    expect(node.playbackRate).toBe(2);
    expect(node.muted).toBe(true);
    const position = test.hook.readPosition();
    const readPosition = test.hook.readPosition;
    expect(
      test.hook.transport.acceptsPresentation({
        epoch: position.epoch,
        mapRevision: position.mapRevision,
        resultTime: 1,
      })
    ).toBe(true);
    expect(test.hook.playheadClock.read()).toBe(4);
    expect(test.hook.readPosition).toBe(readPosition);
    node.currentTime = 6.5;
    act(() => test.hook.onTime());
    expect(test.hook.playheadClock.read()).toBe(6.5);
    act(() => test.hook.pause());
    expect(test.hook.time).toBe(6.5);
    act(() => test.hook.seek(7.1, false));
    expect(
      test.hook.transport.acceptsPresentation({
        epoch: position.epoch,
        mapRevision: position.mapRevision,
        resultTime: 1,
      })
    ).toBe(false);
    expect(test.hook.time).toBe(7.1);
  } finally {
    test.dispose();
  }
});

it.each(['time', 'ended', 'frame', 'pause'] as const)(
  'publishes the project endpoint from browser-rounded EOF via %s without a corrective media seek',
  async (path) => {
    const test = playbackHarness();
    const duration = 26.283316666666664;
    const browserTime = 26.283317;
    try {
      test.update({ duration, edits: [] });
      const node = test.hook.video.current!;
      const seek = vi.fn();
      Object.defineProperty(node, 'paused', {
        value: false,
        configurable: true,
      });
      let advance: FrameRequestCallback | undefined;
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        advance = callback;
        return 1;
      });
      await act(async () => signalNativePlayback(test.hook, true));
      Object.defineProperty(node, 'currentTime', { get: () => browserTime, set: seek });
      if (path === 'frame') {
        expect(advance).toBeDefined();
        act(() => advance!(0));
      } else if (path === 'pause') act(() => signalNativePlayback(test.hook, false));
      else if (path === 'ended') {
        Object.defineProperty(node, 'ended', { value: true });
        act(() => test.hook.onEnded());
      } else act(() => sample(test.hook, browserTime));
      expect(test.hook.playheadClock?.read()).toBe(duration);
      if (path !== 'frame') expect(test.hook.time).toBe(duration);
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

it('keeps the atomic port stable and rejects invalid receipts against the accepted map', () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    act(() => test.hook.seek(7, false));
    const read = test.hook.readPosition;
    test.update({ duration: 5 });
    expect(test.hook.readPosition).toBe(read);
    expect(test.hook.readPosition().resultTime).toBe(5);
    const position = test.hook.readPosition();
    for (const resultTime of [NaN, Infinity, -0.000001, 5.000001])
      expect(test.hook.transport.acceptsPresentation({ ...position, resultTime })).toBe(false);
    expect(test.hook.playheadClock.read()).toBe(5);
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
    act(() => {
      void test.hook.play();
    });
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
  act(() => {
    void test.hook.play();
  });
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
    test.update({ edits: [] });
    act(() => test.hook.setPlaybackRange({ start: 1, end: 2 }));
    await act(async () => test.hook.play());
    test.play.mockClear();
    test.update({ prepareAfterSeek });
    await act(async () => sample(test.hook, 2.1));
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
    await act(async () => {
      test.hook.seek(3, false);
      void test.hook.play();
    });
    expect(prepareAfterSeek).toHaveBeenCalledOnce();
    expect(paused).toBe(true);
    await act(async () => {
      test.hook.seek(5, false);
      void test.hook.play();
    });
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
    await act(async () => {
      test.hook.seek(3, false);
      void test.hook.play();
    });
    await act(async () => accept(false));
    expect(test.play).not.toHaveBeenCalled();
    expect(paused).toBe(true);
    paused = false;
    await act(async () => {
      test.hook.seek(5, false);
      void test.hook.play();
    });
    test.dispose();
    await act(async () => accept(true));
    expect(test.play).not.toHaveBeenCalled();
  } catch (error) {
    test.dispose();
    throw error;
  }
});

it('keeps an urgent seek and pause ahead of a delayed old frame receipt', () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    act(() => test.hook.seek(3, false));
    const before = test.hook.readPosition();
    act(() => test.hook.seek(7, false));
    expect(test.hook.transport.acceptsPresentation({ ...before, resultTime: 3 })).toBe(false);
    act(() => test.hook.pause());
    expect(test.hook.time).toBe(7);
    expect(test.hook.video.current!.currentTime).toBe(7);
  } finally {
    test.dispose();
  }
});

it('publishes the final media sample on Pause before the queued native pause event', async () => {
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
    await act(async () => signalNativePlayback(test.hook, true));
    node.currentTime = 2.65;
    act(() => test.hook.onTime());
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
      test.hook.transport.acceptsPresentation({ ...test.hook.readPosition(), resultTime: 2.7 });
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
  let renders = 0;
  function Harness() {
    renders++;
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
        {...mediaReadyEvents(hook)}
        onPlay={() => hook.onMediaPlayback(true)}
        onPause={() => hook.onMediaPlayback(false)}
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
    const beforeHoldSample = renders;
    tick(800);
    expect(renders).toBe(beforeHoldSample);
    expect(hook.playing).toBe(true);
    expect(paused).toBe(true);
    expect(hook.video.current!.currentTime).toBe(3.98);
    expect(hook.readPosition().resultTime).toBeCloseTo(4.6);
    act(() => hook.pause());
    tick(1200);
    expect(hook.readPosition().resultTime).toBeCloseTo(4.6);
    await act(async () => hook.play());
    tick(1200);
    tick(2800);
    expect(hook.readPosition().source?.kind).toBe('video');
    expect(hook.readPosition().resultTime).toBe(6);
    expect(paused).toBe(false);
    hook.video.current!.currentTime = 3.99989;
    expect(hook.readPosition().resultTime).toBe(6);
    hook.video.current!.currentTime = 4;
    act(() => hook.pause());
    act(() => hook.setPlaybackRange({ start: 4, end: 7 }));
    await act(async () => hook.play());
    tick(2900);
    tick(3000);
    tick(3200);
    expect(hook.readPosition().resultTime).toBeCloseTo(4.3);
    act(() => hook.pause());
    act(() => hook.seekResult(5));
    expect(hook.playbackRange).toEqual({ start: 4, end: 7 });
    expect(hook.readPosition().resultTime).toBe(5);
    edits = [];
    act(() => root.render(<Harness />));
    expect(hook.readPosition().source?.kind).toBe('video');
    expect(hook.readPosition().resultTime).toBe(4);
    expect(hook.playing).toBe(false);
    expect(hook.video.current!.currentTime).toBe(4);
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  'reports a hold resume failure only while its request is current (superseded=%s)',
  async (superseded) => {
    const test = playbackHarness();
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
    const failure = vi.fn();
    try {
      test.update({ edits: [hold], onFailure: failure });
      Object.defineProperty(test.hook.video.current!, 'readyState', { value: 3 });
      act(() => test.hook.seekResult(4.5));
      await act(async () => test.hook.play());
      let rejectPlay!: (error: Error) => void;
      test.play.mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectPlay = reject;
          })
      );
      test.tick(0);
      test.tick(1500);
      expect(rejectPlay).toBeDefined();
      if (superseded) act(() => test.hook.seek(7, false));
      await act(async () =>
        rejectPlay(new DOMException('Interrupted by a new pause', 'AbortError'))
      );
      expect(failure).toHaveBeenCalledTimes(superseded ? 0 : 1);
    } finally {
      test.dispose();
    }
  }
);

it('does not replace a range restart while audio readiness and native seek are pending', async () => {
  const test = playbackHarness();
  try {
    test.update({ edits: [] });
    act(() =>
      test.hook.setPlaybackRange({ start: 3.865, end: 6.105, result: { start: 3.865, end: 6.105 } })
    );
    await act(async () => test.hook.play());
    let release!: (ready: boolean) => void;
    const prepare = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        })
    );
    test.update({ prepareAfterSeek: prepare });
    test.hook.video.current!.currentTime = 6.2;
    test.tick(100);
    const position = test.hook.readPosition();
    test.tick(200);
    test.tick(300);
    expect(prepare).toHaveBeenCalledOnce();
    expect(test.hook.readPosition().epoch).toBe(position.epoch);
    await act(async () => release(true));
    expect(test.hook.playheadClock.read()).toBeCloseTo(3.865, 6);
    expect(test.hook.playing).toBe(true);
  } finally {
    test.dispose();
  }
});
