import { beforeEach, expect, it, vi } from 'vitest';

const { loggerDebugMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));
import {
  createRecordingVideoElement,
  startCanvasBackedFrameLoop,
  startVideoBackedFrameLoop,
  waitForVideoReady,
  wrapCanvasTrackStop,
} from './video';

type ReadyVideo = Pick<HTMLVideoElement, 'oncanplay' | 'onerror' | 'onloadeddata'> & {
  play: () => Promise<void>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

it('configures a muted inline recording video element', () => {
  const stream = { id: 'stream-1' } as unknown as MediaStream;
  const fakeVideo = {
    autoplay: false,
    muted: false,
    playsInline: false,
    srcObject: null as MediaProvider | null,
  } as HTMLVideoElement;
  vi.stubGlobal('document', {
    createElement: vi.fn(() => fakeVideo),
  });
  const video = createRecordingVideoElement(stream);

  expect(video.srcObject).toBe(stream);
  expect(video.autoplay).toBe(true);
  expect(video.muted).toBe(true);
  expect(video.playsInline).toBe(true);
  vi.unstubAllGlobals();
});

it('cleans up listeners once the video becomes ready', async () => {
  const video: ReadyVideo = {
    oncanplay: null,
    onerror: null,
    onloadeddata: null,
    play: vi.fn().mockResolvedValue(undefined),
  };

  const readyPromise = waitForVideoReady(video, 'timeout', 'load error');
  expect(video.play).toHaveBeenCalled();
  const onLoadedData = video.onloadeddata;
  if (!onLoadedData) {
    throw new Error('waitForVideoReady should register an onloadeddata handler.');
  }
  onLoadedData.call(video as unknown as GlobalEventHandlers, new Event('loadeddata'));
  await expect(readyPromise).resolves.toBeUndefined();
  expect(video.onloadeddata).toBeNull();
  expect(video.oncanplay).toBeNull();
  expect(video.onerror).toBeNull();
});

it('resolves when the recording viewport video becomes ready via canplay', async () => {
  const video: ReadyVideo = {
    oncanplay: null,
    onerror: null,
    onloadeddata: null,
    play: vi.fn().mockResolvedValue(undefined),
  };

  const readyPromise = waitForVideoReady(video, 'timeout', 'load error');
  const onCanPlay = video.oncanplay;
  if (!onCanPlay) {
    throw new Error('waitForVideoReady should register an oncanplay handler.');
  }

  onCanPlay.call(video as unknown as GlobalEventHandlers, new Event('canplay'));
  await expect(readyPromise).resolves.toBeUndefined();
  expect(video.onloadeddata).toBeNull();
  expect(video.oncanplay).toBeNull();
  expect(video.onerror).toBeNull();
});

it('logs a low-noise debug trace when play() rejects before readiness', async () => {
  const video: ReadyVideo = {
    oncanplay: null,
    onerror: null,
    onloadeddata: null,
    play: vi.fn().mockRejectedValue(new Error('autoplay blocked')),
  };

  const readyPromise = waitForVideoReady(video, 'timeout', 'load error');
  const onLoadedData = video.onloadeddata;
  if (!onLoadedData) {
    throw new Error('waitForVideoReady should register an onloadeddata handler.');
  }

  await Promise.resolve();
  onLoadedData.call(video as unknown as GlobalEventHandlers, new Event('loadeddata'));
  await expect(readyPromise).resolves.toBeUndefined();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Recording viewport video play() rejected before readiness',
    expect.any(Error)
  );
});

it('rejects when the recording viewport video emits an error', async () => {
  const video: ReadyVideo = {
    oncanplay: null,
    onerror: null,
    onloadeddata: null,
    play: vi.fn().mockResolvedValue(undefined),
  };

  const readyPromise = waitForVideoReady(video, 'timeout', 'load error');
  const onError = video.onerror;
  if (!onError) {
    throw new Error('waitForVideoReady should register an onerror handler.');
  }

  onError.call(video as unknown as OnErrorEventHandlerNonNull, new Event('error'));
  await expect(readyPromise).rejects.toThrow('load error');
  expect(video.onloadeddata).toBeNull();
  expect(video.oncanplay).toBeNull();
  expect(video.onerror).toBeNull();
});

it('wraps canvas track stop with additional cleanup', () => {
  const onStop = vi.fn();
  const originalStop = vi.fn();
  const track = { stop: originalStop };

  wrapCanvasTrackStop(track, onStop);
  track.stop();

  expect(onStop).toHaveBeenCalledTimes(1);
  expect(originalStop).toHaveBeenCalledTimes(1);
});

it('leaves cleanup untouched when there is no canvas track to wrap', () => {
  const onStop = vi.fn();

  expect(wrapCanvasTrackStop(undefined, onStop)).toBeUndefined();
  expect(onStop).not.toHaveBeenCalled();
});

it('prefers requestVideoFrameCallback when the browser provides it', () => {
  const drawFrame = vi.fn();
  const requestVideoFrameCallback = vi.fn();
  const cancelVideoFrameCallback = vi.fn();
  let queuedCallback: ((nowMs: number) => void) | null = null;
  let nextCallbackId = 1;

  requestVideoFrameCallback.mockImplementation((callback) => {
    queuedCallback = callback as (nowMs: number) => void;
    return nextCallbackId++;
  });

  const stopLoop = startVideoBackedFrameLoop(
    {
      cancelVideoFrameCallback,
      requestVideoFrameCallback,
    } as unknown as HTMLVideoElement,
    30,
    drawFrame
  );

  if (!queuedCallback) {
    throw new Error('requestVideoFrameCallback should queue a callback');
  }

  const callback = queuedCallback as (nowMs: number) => void;
  callback(0);
  stopLoop();

  expect(drawFrame).toHaveBeenCalledOnce();
  expect(requestVideoFrameCallback).toHaveBeenCalledTimes(2);
  expect(cancelVideoFrameCallback).toHaveBeenCalledWith(2);
});

it('drives canvas-backed recording from a timer loop', () => {
  const drawFrame = vi.fn();
  const setIntervalMock = vi.fn().mockImplementation(() => 41);
  const clearIntervalMock = vi.fn();

  vi.stubGlobal('window', {
    clearInterval: clearIntervalMock,
    setInterval: setIntervalMock,
  });

  const stopLoop = startCanvasBackedFrameLoop(25, drawFrame);
  stopLoop();

  expect(setIntervalMock).toHaveBeenCalledWith(drawFrame, 40);
  expect(clearIntervalMock).toHaveBeenCalledWith(41);
  vi.unstubAllGlobals();
});

it('falls back to a timer loop when video frame callbacks are unavailable', () => {
  const drawFrame = vi.fn();
  const setIntervalMock = vi.fn().mockImplementation(() => 42);
  const clearIntervalMock = vi.fn();

  vi.stubGlobal('window', {
    clearInterval: clearIntervalMock,
    setInterval: setIntervalMock,
  });

  const stopLoop = startVideoBackedFrameLoop({} as HTMLVideoElement, 30, drawFrame);
  stopLoop();

  expect(setIntervalMock).toHaveBeenCalledWith(drawFrame, 33);
  expect(clearIntervalMock).toHaveBeenCalledWith(42);
  expect(drawFrame).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it('ignores late video-frame callbacks after the loop is stopped', () => {
  const drawFrame = vi.fn();
  const requestVideoFrameCallback = vi.fn();
  const cancelVideoFrameCallback = vi.fn();
  let queuedCallback: ((nowMs: number) => void) | null = null;

  requestVideoFrameCallback.mockImplementation((callback) => {
    queuedCallback = callback as (nowMs: number) => void;
    return 7;
  });

  const stopLoop = startVideoBackedFrameLoop(
    {
      cancelVideoFrameCallback,
      requestVideoFrameCallback,
    } as unknown as HTMLVideoElement,
    30,
    drawFrame
  );

  stopLoop();
  if (!queuedCallback) {
    throw new Error('requestVideoFrameCallback should queue a callback');
  }

  const callback = queuedCallback as (nowMs: number) => void;
  callback(0);

  expect(drawFrame).not.toHaveBeenCalled();
  expect(cancelVideoFrameCallback).toHaveBeenCalledWith(7);
});

it('clears the fallback timer loop when stopped', () => {
  const drawFrame = vi.fn();
  const clearIntervalMock = vi.fn();

  vi.stubGlobal('window', {
    clearInterval: clearIntervalMock,
    setInterval: vi.fn().mockImplementation(() => 41),
  });

  const stopLoop = startVideoBackedFrameLoop({} as HTMLVideoElement, 30, drawFrame);
  stopLoop();

  expect(drawFrame).not.toHaveBeenCalled();
  expect(clearIntervalMock).toHaveBeenCalledWith(41);
  vi.unstubAllGlobals();
});
