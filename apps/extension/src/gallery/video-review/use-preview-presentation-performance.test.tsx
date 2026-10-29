// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useReviewPreviewPresentation,
  type ReviewPreviewPresentationInput,
} from './use-preview-presentation';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { createCanvasComment } from '../../features/video/review/comments';

const io = vi.hoisted(() => ({
  factory: vi.fn(),
  prepare: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  cut: vi.fn<(time: number) => unknown>(() => null),
  cutRetry: vi.fn(),
  provider: vi.fn(),
  graph: vi.fn(),
  limits: vi.fn(),
  bytes: vi.fn(),
  ledgerDispose: vi.fn(),
  camera: vi.fn(),
  cameraPlans: vi.fn(),
  hookRender: vi.fn(),
}));
vi.mock('../../features/video/review/advanced/camera-plan-preparation', async (original) => {
  const actual =
    await original<typeof import('../../features/video/review/advanced/camera-plan-preparation')>();
  return {
    ...actual,
    prepareReviewCameraPlans: (...args: Parameters<typeof actual.prepareReviewCameraPlans>) => {
      io.cameraPlans(...args);
      return actual.prepareReviewCameraPlans(...args);
    },
  };
});
vi.mock('../../workflows/video-review/render-preview', () => ({
  createReviewPreviewRenderer: io.factory,
}));
vi.mock('../../workflows/video-review/preview-render-resources', () => ({
  createPreviewRenderResources: () => ({
    replaceLimits: io.limits,
    bytes: io.bytes,
    canvas: vi.fn(),
    dispose: io.ledgerDispose,
  }),
}));
vi.mock('../../workflows/video-review/preview-render-allocation', () => ({
  resolvePreviewRenderAllocation: io.graph,
  calculatePreviewRenderAllocation: (graph: unknown) => graph,
}));
vi.mock('./cut-transition-preview', () => ({
  useReviewCutTransitionProvider: (...args: unknown[]) => {
    io.provider(...args);
    return { read: io.cut, retry: io.cutRetry, current: null };
  },
}));
vi.mock('./webcam-preview', () => ({ createReviewWebcamPreviewSource: io.camera }));
let root: Root;
let host: HTMLDivElement;
let props: ReviewPreviewPresentationInput;
let result: ReturnType<typeof useReviewPreviewPresentation>;
let time: number;
let nextTick: number;
let ticks: Map<number, FrameRequestCallback>;
let closed: ReturnType<typeof vi.fn>;
let preparedRelease: ReturnType<typeof vi.fn>;
let releases: ReturnType<typeof vi.fn>[];
const assets = {
  headerBitmap: null,
  backgroundBitmap: null,
  watermark: null,
  previousWatermarkCache: null,
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  time = 0;
  nextTick = 0;
  ticks = new Map();
  releases = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    ticks.set(++nextTick, callback);
    return nextTick;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => ticks.delete(id));
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  closed = vi.fn();
  class Frame {
    timestamp = 765432;
    allocationSize() {
      return 1234;
    }
    close = closed;
  }
  vi.stubGlobal('VideoFrame', Frame);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const video = createRef<HTMLVideoElement>();
  video.current = document.createElement('video');
  Object.defineProperty(video.current, 'readyState', { configurable: true, value: 2 });
  video.current.currentTime = 1.234567;
  const output = createRef<HTMLDivElement>();
  output.current = document.createElement('div');
  host.append(output.current);
  const comment = createCanvasComment({ id: 'comment' });
  props = {
    video,
    host: output,
    sourceIdentity: 'source',
    canonical: { width: 200, height: 100 },
    css: { width: 200, height: 100 },
    scene: {
      source: { width: 100, height: 50 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [{ ...comment, renderToVideo: false, resolvedText: 'Live' }],
      keys: [],
      clicks: [],
    },
    preferences: { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, rasterPreset: '360p', frameRate: '30' },
    playing: false,
    pausedSourceTime: 1.234567,
    pausedResultTime: 0.987654,
    sourceToResult: (value) => value - 0.25,
  };
  preparedRelease = vi.fn();
  io.prepare.mockResolvedValue({
    generation: 1,
    watermarkBounds: null,
    allocationAssets: assets,
    release: preparedRelease,
  });
  io.render.mockImplementation((_prepared, frame) => {
    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 360;
    const release = vi.fn();
    releases.push(release);
    return {
      canvas,
      context: { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn() },
      release,
      generation: frame.generation,
    };
  });
  io.factory.mockImplementation(() => ({
    prepare: io.prepare,
    render: io.render,
    dispose: io.dispose,
  }));
  io.bytes.mockImplementation(() => ({ release: vi.fn() }));
  io.graph.mockImplementation((value) => value);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
function Harness() {
  io.hookRender();
  result = useReviewPreviewPresentation(props);
  return null;
}
const render = async () => {
  await act(async () => root.render(<Harness />));
};
const step = async (value: number) => {
  time = value;
  await act(async () => {
    const callbacks = [...ticks.values()];
    ticks.clear();
    callbacks.forEach((callback) => callback(time));
    await Promise.resolve();
    await Promise.resolve();
  });
};

it('waits for a mapped result clock and reports completed playing cadence', async () => {
  props.preferences = { ...props.preferences, showFrameRate: true };
  props = { ...props, playing: true, sourceToResult: () => null };
  await render();
  await step(0);
  expect(result.status.phase).toBe('pending');
  expect(io.render).not.toHaveBeenCalled();
  props = { ...props, sourceToResult: (value) => value - 0.25 };
  await render();
  act(() => props.video.current!.dispatchEvent(new Event('timeupdate')));
  await step(50);
  await step(100);
  await step(1200);
  expect(result.status.phase).toBe('ready');
  expect(result.status.presentedFPS).toBeGreaterThan(0);
  expect(io.render.mock.lastCall![1].resultTime).toBeCloseTo(0.984567, 6);
});

it('publishes a completed renderer buffer directly and releases the hidden previous lease', async () => {
  await render();
  await step(0);
  const canvas = props.host.current!.querySelector('canvas[data-preview-front="true"]');
  props = { ...props, pausedSourceTime: 2, pausedResultTime: 1.75, seekRevision: 1 };
  await render();
  await step(50);
  expect(io.render).toHaveBeenCalledTimes(2);
  expect(props.host.current!.querySelector('canvas[data-preview-front="true"]')).not.toBe(canvas);
  expect(props.host.current!.querySelectorAll('canvas')).toHaveLength(2);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[1]).not.toHaveBeenCalled();
});

it('keeps the last visible frame and releases the candidate when its publication fails', async () => {
  await render();
  await step(0);
  const front = props.host.current!.querySelector('canvas[data-preview-front="true"]');
  vi.spyOn(props.host.current!, 'appendChild').mockImplementationOnce(() => {
    throw new Error('Publication failed');
  });
  props = { ...props, pausedSourceTime: 2, pausedResultTime: 1.75, seekRevision: 1 };
  await render();
  await step(50);
  expect(result.status.phase).toBe('failed');
  expect(props.host.current!.querySelector('canvas[data-preview-front="true"]')).toBe(front);
  expect(releases[0]).not.toHaveBeenCalled();
  expect(releases[1]).toHaveBeenCalledOnce();
  act(() => result.retry());
  await step(100);
  expect(result.status.phase).toBe('ready');
  expect(props.host.current!.querySelector('canvas[data-preview-front="true"]')).not.toBe(front);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[2]).not.toHaveBeenCalled();
});

it('replaces the retained canvas only when the completed frame needs a different backing size', async () => {
  await render();
  await step(0);
  const front = props.host.current!.querySelector('canvas[data-preview-front="true"]');
  io.render.mockImplementationOnce((_prepared, frame) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const release = vi.fn();
    releases.push(release);
    return {
      canvas,
      context: { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), drawImage: vi.fn() },
      release,
      generation: frame.generation,
    };
  });
  props = { ...props, pausedSourceTime: 2, pausedResultTime: 1.75, seekRevision: 1 };
  await render();
  await step(50);
  expect(props.host.current!.querySelector('canvas[data-preview-front="true"]')).not.toBe(front);
  expect(result.status.actualRaster).toEqual({ width: 1280, height: 720 });
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[1]).not.toHaveBeenCalled();
});

it('prepares capture camera geometry once for a description before frame capture', async () => {
  props.playing = true;
  await render();
  await step(100);
  expect(io.cameraPlans).toHaveBeenCalledOnce();
  expect(io.cameraPlans.mock.calls[0]![1].output).toEqual(io.prepare.mock.calls[0]![1].backing);
  await step(200);
  expect(io.render).toHaveBeenCalledTimes(2);
  expect(io.cameraPlans).toHaveBeenCalledOnce();
  props = { ...props, canonical: { width: 400, height: 200 } };
  await render();
  await step(300);
  expect(io.cameraPlans).toHaveBeenCalledTimes(2);
});

it('publishes frames without rerendering unchanged controls when FPS is not requested', async () => {
  props.playing = true;
  await render();
  await step(100);
  await step(200);
  const renders = io.hookRender.mock.calls.length;
  for (const time of [300, 400, 500, 600, 700]) await step(time);
  expect(io.render).toHaveBeenCalledTimes(7);
  expect(io.hookRender).toHaveBeenCalledTimes(renders);
  expect(result.status.phase).toBe('ready');
  props.preferences = { ...props.preferences, showFrameRate: true };
  await render();
  await step(850);
  await step(1000);
  expect(result.status.presentedFPS).toBeGreaterThan(0);
});

it('keeps manual publication cadence available to an explicit statistics consumer', async () => {
  props.playing = true;
  const statistics = vi.fn();
  props.onStatistics = statistics;
  await render();
  await step(100);
  await step(200);
  expect(statistics.mock.calls.at(-1)![0].presentedFPS).toBe(10);
});

it('paints manual FPS at native readout cadence while reporting frames and failures immediately', async () => {
  props.playing = true;
  props.preferences = { ...props.preferences, showFrameRate: true };
  const statistics = vi.fn();
  props.onStatistics = statistics;
  await render();
  await step(100);
  await step(200);
  await step(250);
  const renders = io.hookRender.mock.calls.length;
  expect(result.status.presentedFPS).toBe(10);
  for (const now of [300, 400, 500, 600]) await step(now);
  expect(io.render).toHaveBeenCalledTimes(7);
  expect(io.hookRender).toHaveBeenCalledTimes(renders);
  expect(statistics.mock.calls.at(-1)![0].presentedFPS).not.toBe(10);
  await step(750);
  expect(result.status.presentedFPS).not.toBe(10);
  io.render.mockRejectedValueOnce(new Error('Frame refused'));
  await step(800);
  expect(result.status.phase).toBe('failed');
  expect(statistics.mock.calls.at(-1)![0].phase).toBe('failed');
});

it('publishes through a bounded reusable pair without front pixel copies or warm DOM replacement', async () => {
  const pair = [document.createElement('canvas'), document.createElement('canvas')];
  for (const canvas of pair) {
    canvas.width = 720;
    canvas.height = 360;
  }
  const contexts = pair.map(() => ({
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  }));
  let index = 0;
  io.render.mockImplementation((_prepared, frame) => {
    const slot = index++ % 2;
    const release = vi.fn();
    releases.push(release);
    return { canvas: pair[slot]!, context: contexts[slot]!, release, generation: frame.generation };
  });
  await render();
  await step(0);
  props = { ...props, pausedSourceTime: 2, pausedResultTime: 1.75, seekRevision: 1 };
  await render();
  await step(50);
  expect(contexts[0]!.drawImage).not.toHaveBeenCalled();
  expect(props.host.current!.querySelectorAll('canvas')).toHaveLength(2);
  const mutations: MutationRecord[] = [];
  const observer = new MutationObserver((records) => mutations.push(...records));
  observer.observe(props.host.current!, { childList: true });
  for (let count = 2; count < 5; count++) {
    props = {
      ...props,
      pausedSourceTime: count + 1,
      pausedResultTime: count + 0.75,
      seekRevision: count,
    };
    await render();
    await step(count * 50);
    expect([...props.host.current!.querySelectorAll('canvas')]).toEqual(pair);
    expect(props.host.current!.querySelectorAll('canvas[data-preview-front="true"]')).toHaveLength(
      1
    );
  }
  expect([...mutations, ...observer.takeRecords()]).toHaveLength(0);
  observer.disconnect();
  for (const context of contexts) expect(context.drawImage).not.toHaveBeenCalled();
  for (const release of releases.slice(0, -1)) expect(release).toHaveBeenCalledOnce();
  expect(releases.at(-1)).not.toHaveBeenCalled();
});
