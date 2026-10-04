// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoFrameCache, sampleVideoTime } from './video-frame-cache';

let decoder: HTMLVideoElement;
let surface: HTMLCanvasElement;
let notify: ReturnType<typeof vi.fn<() => void>>;
let draw: ReturnType<typeof vi.fn>;
let frameNumber: number;
let finishSeek: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  notify = vi.fn<() => void>();
  draw = vi.fn();
  frameNumber = 0;
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const element = create(tag, options);
    if (element instanceof HTMLVideoElement) {
      decoder = element;
      let currentTime = 0;
      let seeking = false;
      finishSeek = () => {
        seeking = false;
      };
      Object.defineProperties(decoder, {
        readyState: { configurable: true, value: 2 },
        seeking: { configurable: true, get: () => seeking },
        currentTime: {
          configurable: true,
          get: () => currentTime,
          set: (value: number) => {
            currentTime = value;
            seeking = true;
          },
        },
        videoWidth: { configurable: true, value: 1280 },
        videoHeight: { configurable: true, value: 720 },
      });
    }
    if (element instanceof HTMLCanvasElement) surface = element;
    return element;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: draw,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
    () => `data:image/jpeg;base64,${++frameNumber}`
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function loaded() {
  decoder.dispatchEvent(new Event('loadeddata'));
}
function sought() {
  finishSeek();
  decoder.dispatchEvent(new Event('seeked'));
}

it('samples at one-second positions and reuses a frame with its exact timestamp', () => {
  expect(sampleVideoTime(4.49, 30)).toBe(4);
  expect(sampleVideoTime(4.5, 30)).toBe(5);
  expect(sampleVideoTime(4.7, Number.POSITIVE_INFINITY)).toBe(5);
  const cache = createVideoFrameCache('blob:borrowed', notify);
  expect(cache.request(4.4, 60)).toMatchObject({ sampleTime: 4, status: 'loading' });
  loaded();
  expect(decoder.currentTime).toBe(4);
  sought();
  const frame = cache.get(4.4, 60);
  expect(frame).toMatchObject({
    sampleTime: 4,
    status: 'ready',
    dataUrl: 'data:image/jpeg;base64,1',
  });
  expect(cache.request(4.2, 60)).toEqual(frame);
  expect(draw).toHaveBeenCalledTimes(1);
  cache.dispose();
  expect(decoder.hasAttribute('src')).toBe(false);
});

it('replaces pending hover, discards stale seek output, and warms only the latest long window', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(5, 120);
  loaded();
  expect(decoder.currentTime).toBe(5);
  cache.request(50, 120);
  cache.request(80, 120);
  expect(decoder.currentTime).toBe(80);
  decoder.currentTime = 5;
  sought();
  expect(draw).not.toHaveBeenCalled();
  decoder.currentTime = 80;
  sought();
  expect(cache.get(80, 120).status).toBe('ready');
  vi.runOnlyPendingTimers();
  expect([78, 79, 80, 81, 82]).toContain(decoder.currentTime);
  expect(decoder.currentTime).not.toBe(5);
  cache.dispose();
});

it('supersedes a stalled foreground seek before its timeout', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(4, 60);
  loaded();
  expect(decoder.currentTime).toBe(4);
  cache.request(9, 60);
  expect(decoder.currentTime).toBe(9);
  decoder.currentTime = 4;
  sought();
  expect(draw).not.toHaveBeenCalled();
  decoder.currentTime = 9;
  sought();
  expect(cache.get(9, 60).status).toBe('ready');
  cache.dispose();
});

it('starts short prewarm only after finite duration and keeps one active seek', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(10, 0);
  loaded();
  expect(decoder.currentTime).toBe(0);
  expect(draw).not.toHaveBeenCalled();
  cache.setDuration(Number.POSITIVE_INFINITY);
  expect(draw).not.toHaveBeenCalled();
  cache.setDuration(30);
  expect(decoder.currentTime).toBe(10);
  sought();
  vi.advanceTimersByTime(0);
  expect(decoder.currentTime).toBe(0);
  cache.dispose();
});

it('abandons short prewarm when metadata changes to a long clip', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.setDuration(30);
  loaded();
  expect(decoder.currentTime).toBe(0);
  cache.setDuration(120);
  sought();
  expect(draw).not.toHaveBeenCalled();
  vi.advanceTimersByTime(0);
  expect(decoder.currentTime).toBe(0);
  cache.request(80, 120);
  expect(decoder.currentTime).toBe(80);
  sought();
  vi.advanceTimersByTime(0);
  expect([78, 79, 80, 81, 82]).toContain(decoder.currentTime);
  cache.dispose();
});

it('reports decoder load errors and refuses further work for that source', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(4, 60);
  decoder.dispatchEvent(new Event('error'));
  expect(cache.get(4, 60).status).toBe('error');
  cache.request(5, 60);
  loaded();
  expect(cache.get(5, 60).status).toBe('error');
  expect(draw).not.toHaveBeenCalled();
  cache.dispose();
});

it('limits surfaces and LRU frame count, and drops all late work after disposal', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(1, 120);
  loaded();
  for (let index = 1; index <= 52; index++) {
    if (index > 1) cache.request(index, 120);
    sought();
    vi.clearAllTimers();
  }
  expect(cache.get(1, 120).status).not.toBe('ready');
  expect(cache.get(52, 120).status).toBe('ready');
  expect(surface.width).toBeLessThanOrEqual(192);
  expect(surface.height).toBeLessThanOrEqual(144);
  const calls = notify.mock.calls.length;
  cache.dispose();
  sought();
  vi.runAllTimers();
  expect(notify).toHaveBeenCalledTimes(calls);
  expect(decoder.hasAttribute('src')).toBe(false);
});

it('times out a seek, reports failure, and retries only after a new target intent', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(4, 60);
  loaded();
  vi.advanceTimersByTime(8000);
  expect(cache.get(4, 60).status).toBe('error');
  cache.request(4, 60);
  expect(cache.get(4, 60).status).toBe('error');
  sought();
  expect(draw).not.toHaveBeenCalled();
  cache.request(5, 60);
  cache.request(4, 60);
  decoder.currentTime = 5;
  sought();
  expect(draw).not.toHaveBeenCalled();
  decoder.currentTime = 4;
  sought();
  expect(cache.get(4, 60).status).toBe('ready');
  cache.dispose();
});

it('does not attribute a late seeked event to a newer target', () => {
  const cache = createVideoFrameCache('blob:borrowed', notify);
  cache.request(4, 60);
  loaded();
  vi.advanceTimersByTime(8000);
  cache.request(9, 60);
  decoder.currentTime = 4;
  sought();
  expect(draw).not.toHaveBeenCalled();
  expect(cache.get(9, 60).status).toBe('loading');
  decoder.currentTime = 9;
  sought();
  expect(cache.get(9, 60).status).toBe('ready');
  cache.dispose();
});
