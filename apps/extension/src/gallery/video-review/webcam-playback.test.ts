// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { createReviewWebcamPlayback } from './webcam-playback';

function media(frames = true) {
  const node = document.createElement('video');
  const state = { time: 0, paused: true, seeking: false, ended: false, ready: 2, rate: 1 };
  const callbacks = new Map<number, VideoFrameRequestCallback>();
  let serial = 0;
  const seeks: number[] = [];
  const play = vi.fn(async () => {
    state.paused = false;
  });
  const pause = vi.fn(() => {
    state.paused = true;
  });
  Object.defineProperties(node, {
    currentTime: {
      get: () => state.time,
      set: (time: number) => {
        state.time = time;
        state.seeking = true;
        seeks.push(time);
      },
    },
    duration: { get: () => 10 },
    paused: { get: () => state.paused },
    seeking: { get: () => state.seeking },
    ended: { get: () => state.ended },
    readyState: { get: () => state.ready },
    playbackRate: {
      configurable: true,
      get: () => state.rate,
      set: (rate: number) => {
        state.rate = rate;
      },
    },
    play: { value: play },
    pause: { value: pause },
    ...(frames
      ? {
          requestVideoFrameCallback: {
            value: (callback: VideoFrameRequestCallback) => {
              callbacks.set(++serial, callback);
              return serial;
            },
          },
          cancelVideoFrameCallback: {
            value: (id: number) => {
              callbacks.delete(id);
            },
          },
        }
      : {}),
  });
  const metadata = (time: number): VideoFrameCallbackMetadata => ({
    mediaTime: time,
    width: 100,
    height: 100,
    presentedFrames: 1,
    presentationTime: 0,
    expectedDisplayTime: 0,
    processingDuration: 0,
  });
  return {
    node,
    state,
    seeks,
    play,
    pause,
    callbacks,
    metadata,
    decode(time = state.time) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(0, metadata(time));
    },
    seeked() {
      state.seeking = false;
      node.dispatchEvent(new Event('seeked'));
    },
  };
}

let now = 0;
let frames: Map<number, FrameRequestCallback>;
let cleanups: Array<() => void>;
beforeEach(() => {
  now = 0;
  frames = new Map();
  cleanups = [];
  let serial = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++serial, callback);
    return serial;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function tick(milliseconds = 16) {
  now += milliseconds;
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(now));
}
function setup(frameCallbacks = true, frameDuration = 1 / 30) {
  const main = media();
  const camera = media(frameCallbacks);
  const settings = createQuickEditWebcam(
    'project-asset:camera',
    { width: 100, height: 100 },
    { width: 160, height: 90 }
  );
  const paint = vi.fn();
  const failed = vi.fn();
  const stop = createReviewWebcamPlayback({
    frameDuration,
    main: main.node,
    camera: camera.node,
    settings: () => settings,
    paint,
    failed,
  });
  cleanups.push(stop);
  return { main, camera, settings, paint, failed, stop };
}

it('enters positive-offset coverage during continuous playback and matches main rate', async () => {
  const { main, camera, settings, paint } = setup();
  settings.offsetSeconds = 2;
  main.state.paused = false;
  main.state.rate = 0.25;
  main.state.time = 1.9;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  expect(camera.seeks).toEqual([]);
  main.state.time = 2.1;
  tick();
  expect(camera.seeks[0]).toBeCloseTo(0.1);
  camera.decode(0.1);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBeCloseTo(0.1);
  expect(camera.play).toHaveBeenCalledTimes(1);
  expect(camera.state.rate).toBe(0.25);
  expect(camera.node.muted).toBe(true);
  expect(camera.node.volume).toBe(0);
  await Promise.resolve();
  main.state.time = 12;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  expect(camera.state.paused).toBe(true);
});

it('does not seek an aligned running decoder just because its frame callback is late', () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.rate = 2;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  const seeks = camera.seeks.length;
  main.state.time = 1.18;
  camera.state.time = 1.18;
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1);
  expect(camera.seeks).toHaveLength(seeks);
  expect(camera.state.paused).toBe(false);
  camera.decode(1.18);
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.18);
});

it('bridges short presentation jitter but hides sustained stalls and stays strict when paused', () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.rate = 2;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 1.1;
  camera.state.time = 1.1;
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.1);
  main.state.time = 1.18;
  camera.state.time = 1.18;
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.1);
  main.state.time = 1.7;
  tick(260);
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.decode(1.1);
  main.state.paused = true;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
});

it('aligns explicit source discontinuities exactly without predicting seek latency', () => {
  const { main, camera } = setup();
  main.state.time = 1;
  tick();
  tick(60);
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 3;
  main.node.dispatchEvent(new Event('seeking'));
  main.state.rate = 2;
  main.state.paused = false;
  tick();
  expect(camera.seeks.at(-1)).toBe(3);
  camera.decode(3.12);
  camera.seeked();
  main.state.time = 3.12;
  tick();
  main.state.paused = true;
  main.state.time = 6;
  tick();
  expect(camera.seeks.at(-1)).toBe(6);
});

it('accepts the first paused frame of a low-cadence camera without waiting for playback', () => {
  const { main, camera, paint } = setup(true, 0.1);
  main.state.time = 0.09;
  tick();
  camera.decode(0);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(0.09);
  expect(camera.seeks).toEqual([0.09]);
});

it('pauses on main clock stagnation and resumes from the matching decoded frame', async () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  tick();
  camera.decode();
  camera.seeked();
  tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  tick(110);
  expect(camera.state.paused).toBe(true);
  main.state.time = 0.02;
  tick();
  expect(camera.play).toHaveBeenCalledTimes(2);
  expect(paint.mock.lastCall?.[0]?.time).toBe(0.02);
  main.node.dispatchEvent(new Event('waiting'));
  expect(camera.state.paused).toBe(true);
});

it('hides stalled camera pixels and coalesces rapid seeks without accepting a late callback', () => {
  const { main, camera, paint } = setup();
  tick();
  camera.decode();
  camera.seeked();
  tick();
  const oldCallback = [...camera.callbacks.values()][0]!;
  main.state.time = 3;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  main.state.time = 7;
  tick();
  expect(camera.seeks).toEqual([0, 3]);
  oldCallback(0, camera.metadata(7));
  camera.decode(3);
  camera.seeked();
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  expect(camera.seeks).toEqual([0, 3, 7]);
  camera.decode(7);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(7);
});

it('re-enters after hidden ranges and a loop without frozen end frames', () => {
  const { main, camera, settings, paint } = setup();
  settings.offsetSeconds = -1;
  settings.hiddenRanges = [{ id: 'hidden', start: 2, end: 4 }];
  main.state.time = 2;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  main.state.time = 4;
  tick();
  expect(camera.seeks).toEqual([5]);
  camera.decode(5);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(5);
  main.state.time = 9;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  main.state.time = 0;
  tick();
  expect(camera.seeks).toEqual([5, 1]);
});

it('supports native seeked fallback and releases scheduled work and listeners', () => {
  const { main, camera, paint, stop } = setup(false);
  main.state.time = 3;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(3);
  stop();
  expect(frames.size).toBe(0);
  const calls = paint.mock.calls.length;
  tick();
  main.node.dispatchEvent(new Event('playing'));
  expect(paint).toHaveBeenCalledTimes(calls);
});

it('hides a decoded frame when main is seeking and cancels camera frame callbacks on disposal', () => {
  const { main, camera, paint, failed, stop } = setup();
  tick();
  camera.decode();
  camera.seeked();
  tick();
  main.state.seeking = true;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.node.dispatchEvent(new Event('error'));
  expect(failed).toHaveBeenCalledOnce();
  stop();
  expect(camera.callbacks.size).toBe(0);
});

it('waits for a frame delivered after seeked instead of continually restarting the same seek', () => {
  const { main, camera, paint } = setup();
  main.state.time = 2;
  tick();
  camera.seeked();
  tick();
  tick();
  expect(camera.seeks).toEqual([2]);
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.decode(2);
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(2);
});

it('clears a retained jitter frame immediately on an explicit main seek', () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 1.1;
  camera.state.time = 1.1;
  tick();
  expect(paint.mock.lastCall?.[0]).not.toBeNull();
  main.node.dispatchEvent(new Event('seeking'));
  expect(paint).toHaveBeenLastCalledWith(null);
});

it('retains the accepted raster during a brief camera decoder underflow', () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  camera.state.ready = 1;
  main.state.time = 1.08;
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1);
  main.state.time = 1.4;
  tick(260);
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.state.ready = 2;
  camera.state.time = 1.4;
  camera.decode(1.4);
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.4);
});

it('recovers after waiting when the source clock resumes without another playing event', async () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  await Promise.resolve();
  await Promise.resolve();
  main.node.dispatchEvent(new Event('waiting'));
  expect(camera.state.paused).toBe(true);
  main.state.time = 1.03;
  camera.state.time = 1.03;
  camera.decode(1.03);
  tick();
  expect(camera.state.paused).toBe(false);
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.03);
});

it('recovers a slow camera seek by running forward rather than chasing the advancing source', () => {
  const { main, camera } = setup();
  main.state.paused = false;
  main.state.time = 1;
  tick();
  main.state.time = 1.3;
  tick(300);
  camera.decode(1);
  camera.seeked();
  tick();
  expect(camera.seeks).toEqual([1]);
  expect(camera.state.paused).toBe(false);
  expect(camera.state.rate).toBe(1.25);
});

it('publishes represented decoded timestamps and invalidates admission generation after main seeks', () => {
  const { main, camera, paint } = setup();
  main.state.time = 0.03;
  tick();
  camera.decode(0);
  camera.seeked();
  tick();
  const before = paint.mock.lastCall?.[0];
  expect(before).toMatchObject({ time: 0.03, representedMediaTime: 0, tolerance: 2 / 30 });
  main.node.dispatchEvent(new Event('seeking'));
  expect(paint).toHaveBeenLastCalledWith(null);
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.decode(0.03);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.generation).toBeGreaterThan(before.generation);
});

it('lets a running decoder recover the recorded 65ms startup lag without restarting its seek', () => {
  const { main, camera, paint } = setup(true, 1 / 60);
  main.state.paused = false;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  expect(camera.state.paused).toBe(false);
  main.state.time = 1.065;
  camera.state.time = 1.018;
  tick(65);
  expect(camera.seeks).toEqual([1]);
  expect(camera.state.paused).toBe(false);
  expect(camera.state.rate).toBeGreaterThan(main.state.rate);
  expect(paint.mock.lastCall?.[0]?.representedMediaTime).toBe(1);
  main.state.time = 1.4;
  camera.state.time = 1.018;
  tick(270);
  expect(paint).toHaveBeenLastCalledWith(null);
});

it('does not turn a completed variable-latency seek into another prediction-driven seek', () => {
  const { main, camera, paint } = setup(true, 1 / 60);
  main.state.paused = false;
  main.state.time = 5;
  tick();
  main.state.time = 5.31;
  now += 310;
  camera.decode(5);
  camera.seeked();
  tick();
  expect(camera.seeks).toEqual([5]);
  expect(camera.state.paused).toBe(false);
  expect(paint).toHaveBeenLastCalledWith(null);
});

it('holds an ahead running camera for the source instead of seeking backward', () => {
  const { main, camera, paint } = setup(true, 1 / 60);
  main.state.paused = false;
  main.state.time = 5;
  tick();
  camera.decode(5);
  camera.seeked();
  tick();
  main.state.time = 5.05;
  camera.state.time = 5.35;
  camera.decode(5.35);
  tick(50);
  expect(camera.seeks).toEqual([5]);
  expect(camera.state.paused).toBe(true);
  main.state.time = 5.35;
  tick(300);
  expect(camera.seeks).toEqual([5]);
  expect(paint.mock.lastCall?.[0]?.representedMediaTime).toBe(5.35);
});

it('bounds catch-up rate and restores authored rate when the decoder catches up', () => {
  const { main, camera } = setup(true, 1 / 60);
  main.state.paused = false;
  main.state.time = 1;
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 1.1;
  camera.state.time = 1.02;
  tick(100);
  expect(camera.state.rate).toBe(1.25);
  main.state.time = 1.2;
  camera.state.time = 1.19;
  camera.decode(1.19);
  tick(100);
  expect(camera.state.rate).toBe(1);
  main.state.rate = 2;
  main.state.time = 1.22;
  camera.state.time = 1.22;
  tick();
  expect(camera.state.rate).toBe(2);
  expect(camera.seeks).toEqual([1]);
});

it('realigns same-object offset changes but preserves transport for appearance edits', () => {
  const { main, camera, settings } = setup();
  main.state.paused = false;
  main.state.time = 2;
  tick();
  camera.decode(2);
  camera.seeked();
  tick();
  settings.appearance.zoom = 1.5;
  main.state.time = 2.02;
  camera.state.time = 2.02;
  tick();
  expect(camera.seeks).toEqual([2]);
  settings.offsetSeconds = 1;
  tick();
  expect(camera.seeks).toEqual([2, 1.02]);
});

it('coalesces explicit seeks while ordinary running time never supersedes an in-flight target', () => {
  const { main, camera, paint } = setup();
  main.state.paused = false;
  main.state.time = 1;
  tick();
  main.state.time = 1.2;
  tick(200);
  expect(camera.seeks).toEqual([1]);
  main.state.time = 4;
  main.node.dispatchEvent(new Event('seeking'));
  tick();
  main.state.time = 6;
  main.node.dispatchEvent(new Event('seeking'));
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
  expect(camera.seeks).toEqual([1, 6]);
  camera.decode(6);
  camera.seeked();
  tick();
  expect(paint.mock.lastCall?.[0]?.representedMediaTime).toBe(6);
});

it('keeps catch-up within the native playback-rate maximum at supported 16x source speed', () => {
  const { main, camera } = setup(true, 1 / 60);
  main.state.paused = false;
  main.state.rate = 16;
  main.state.time = 1;
  Object.defineProperty(camera.node, 'playbackRate', {
    get: () => camera.state.rate,
    set: (rate: number) => {
      if (rate > 16) throw new DOMException('Unsupported rate', 'NotSupportedError');
      camera.state.rate = rate;
    },
  });
  tick();
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 1.8;
  camera.state.time = 1.05;
  expect(() => tick(50)).not.toThrow();
  expect(camera.state.rate).toBe(16);
  expect(camera.seeks).toEqual([1]);
});

it('requests one exact paused alignment when currentTime is aligned but decoded evidence is stale', () => {
  const { main, camera, paint } = setup(true, 1 / 60);
  tick();
  camera.decode(0);
  camera.seeked();
  tick();
  main.state.time = 0.1;
  camera.state.time = 0.1;
  tick();
  expect(camera.seeks).toEqual([0, 0.1]);
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.seeked();
  tick();
  tick();
  expect(camera.seeks).toEqual([0, 0.1]);
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.decode(0.1);
  tick();
  expect(paint.mock.lastCall?.[0]?.representedMediaTime).toBe(0.1);
  expect(camera.play).not.toHaveBeenCalled();
});

it('accepts proven initial decoded alignment delivered before loadeddata without seeking the same frame again', () => {
  const { main, camera, paint } = setup(true, 1 / 60);
  camera.state.ready = 1;
  tick();
  camera.decode(0);
  camera.state.ready = 2;
  tick();
  expect(camera.seeks).toEqual([]);
  expect(paint.mock.lastCall?.[0]).toMatchObject({ time: 0, representedMediaTime: 0 });
  tick(10_000);
  expect(camera.seeks).toEqual([]);
  expect(paint.mock.lastCall?.[0]).toMatchObject({ time: 0, representedMediaTime: 0 });
  main.node.dispatchEvent(new Event('seeking'));
  tick();
  expect(camera.seeks).toEqual([0]);
  expect(paint).toHaveBeenLastCalledWith(null);
});
