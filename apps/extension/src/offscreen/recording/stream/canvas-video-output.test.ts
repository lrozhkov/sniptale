// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createCanvasVideoOutput } from './canvas-video-output';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function installCanvas(stream: MediaStream) {
  const [track] = stream.getVideoTracks();
  if (track && !('requestFrame' in track)) Object.assign(track, { requestFrame: vi.fn() });
  const context = { drawImage: vi.fn() };
  const canvas = Object.assign(document.createElement('canvas'), {
    captureStream: vi.fn(() => stream),
    getContext: vi.fn(() => context),
  });
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  return { canvas, context };
}

it('keeps drawing a static source through one constant-rate canvas stream', () => {
  vi.useFakeTimers();
  const output = createTrackedStream({ frameRate: 30, height: 720, width: 1280 });
  const { canvas } = installCanvas(output);
  const drawLiveFrame = vi.fn(() => true);
  const release = vi.fn();

  const stream = createCanvasVideoOutput({
    dimensions: { height: 720, width: 1280 },
    frameRate: 30,
    initializeDrawing: () => ({ drawLiveFrame }),
    release,
  });

  expect(stream).toBe(output);
  expect(canvas.captureStream).toHaveBeenCalledOnce();
  expect(canvas.captureStream).toHaveBeenCalledWith(0);
  expect(drawLiveFrame).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  expect(drawLiveFrame).toHaveBeenCalledTimes(31);

  output.track.stop();
  output.track.stop();
  vi.advanceTimersByTime(1000);
  expect(drawLiveFrame).toHaveBeenCalledTimes(31);
  expect(release).toHaveBeenCalledOnce();
});

it('requests frames explicitly so canvas capture does not impose a second cadence clock', () => {
  const output = createTrackedStream({ frameRate: 24, height: 480, width: 854 });
  const requestFrame = vi.fn();
  Object.assign(output.track, { requestFrame });
  const { canvas } = installCanvas(output);

  createCanvasVideoOutput({
    dimensions: { height: 480, width: 854 },
    frameRate: 24,
    initializeDrawing: () => ({ drawLiveFrame: () => true }),
    release: vi.fn(),
  });

  expect(canvas.captureStream).toHaveBeenCalledOnce();
  expect(canvas.captureStream).toHaveBeenCalledWith(0);
  expect(requestFrame).toHaveBeenCalledOnce();
  output.track.stop();
});
