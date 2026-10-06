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
  expect(paint).toHaveBeenLastCalledWith(null);
  expect(camera.seeks).toHaveLength(seeks);
  expect(camera.state.paused).toBe(false);
  camera.decode(1.18);
  tick();
  expect(paint.mock.lastCall?.[0]?.time).toBe(1.18);
});

it('keeps two presentation frames visible at 2x but hides a stalled frame and stays strict when paused', () => {
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
  expect(paint).toHaveBeenLastCalledWith(null);
  camera.decode(1.1);
  main.state.paused = true;
  tick();
  expect(paint).toHaveBeenLastCalledWith(null);
});

it('compensates measured seek latency only while the main clock is running', () => {
  const { main, camera } = setup();
  main.state.time = 1;
  tick();
  tick(60);
  camera.decode(1);
  camera.seeked();
  tick();
  main.state.time = 3;
  main.state.rate = 2;
  main.state.paused = false;
  tick();
  expect(camera.seeks.at(-1)).toBeCloseTo(3.12);
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
