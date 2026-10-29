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
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  installDiagnosticLogObserver,
  type DiagnosticLogEvent,
} from '@sniptale/platform/observability/logger';

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
}));
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

it('uses manual Current playback for enabled captions and releases it when disabled', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES };
  props.playing = true;
  props.scene.captions = {
    document: { version: 1, fragments: [] },
    settings: { ...createReviewCaptionSettings(), enabled: true },
    segments: buildReviewTimeMap(3, []),
  };
  await render();
  await step(0);
  expect(result.active).toBe(true);
  expect(io.prepare).toHaveBeenCalled();
  expect(io.prepare.mock.calls[0]![0].captions.settings.enabled).toBe(true);
  props = {
    ...props,
    scene: {
      ...props.scene,
      captions: {
        ...props.scene.captions,
        settings: { ...createReviewCaptionSettings(), enabled: false },
      },
    },
  };
  await render();
  expect(result.active).toBe(false);
  expect(io.dispose).toHaveBeenCalled();
});

it('waits for native source readiness without partial publication', async () => {
  const available = globalThis.VideoFrame;
  vi.stubGlobal(
    'VideoFrame',
    class {
      constructor() {
        throw new DOMException('Invalid source state', 'InvalidStateError');
      }
    }
  );
  let ready!: VideoFrameRequestCallback;
  props.video.current!.requestVideoFrameCallback = vi.fn((callback) => {
    ready = callback;
    return 7;
  });
  props.video.current!.cancelVideoFrameCallback = vi.fn();
  await render();
  await step(0);
  expect(result.status.phase).toBe('pending');
  expect(props.video.current!.requestVideoFrameCallback).toHaveBeenCalledOnce();
  expect(io.render).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  expect(io.bytes).not.toHaveBeenCalled();
  await step(50);
  expect(props.video.current!.requestVideoFrameCallback).toHaveBeenCalledOnce();
  vi.stubGlobal('VideoFrame', available);
  act(() => ready(60, {} as VideoFrameCallbackMetadata));
  await step(60);
  expect(result.status.phase).toBe('ready');
  expect(io.render).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
});

it('cancels the pending native source callback when the presentation owner is disposed', async () => {
  vi.stubGlobal(
    'VideoFrame',
    class {
      constructor() {
        throw new DOMException('Invalid source state', 'InvalidStateError');
      }
    }
  );
  props.video.current!.requestVideoFrameCallback = vi.fn(() => 7);
  const cancel = (props.video.current!.cancelVideoFrameCallback = vi.fn());
  await render();
  await step(0);
  props = { ...props, visible: false };
  await render();
  expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
  expect(io.bytes).not.toHaveBeenCalled();
});

it('keeps non-transient source construction failures visible rather than treating them as readiness', async () => {
  vi.stubGlobal(
    'VideoFrame',
    class {
      constructor() {
        throw new TypeError('Source capture unavailable');
      }
    }
  );
  props.video.current!.requestVideoFrameCallback = vi.fn(() => 7);
  await render();
  await step(0);
  expect(result.status.phase).toBe('failed');
  expect(props.video.current!.requestVideoFrameCallback).not.toHaveBeenCalled();
  expect(io.bytes).not.toHaveBeenCalled();
});

it('writes one content-free caption-scene failure summary per failed preview attempt', async () => {
  const events: DiagnosticLogEvent[] = [];
  const stop = installDiagnosticLogObserver((event) => events.push(event));
  vi.stubGlobal('__SNIPTALE_RELEASE_BUILD__', true);
  try {
    io.render.mockRejectedValueOnce(
      new Error('private-frame.webm https://private.example user text')
    );
    props.scene.captions = {
      document: { version: 1, fragments: [] },
      settings: { ...createReviewCaptionSettings(), enabled: true },
      segments: buildReviewTimeMap(3, []),
    };
    await render();
    await step(0);
    expect(result.status.phase).toBe('failed');
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toBe(
      'preview outcome=failed route=render destination=preview stage=compose code=compose-failed'
    );
    await step(50);
    expect(events).toHaveLength(1);
    act(() => result.retry());
    await step(100);
    expect(result.status.phase).toBe('ready');
  } finally {
    stop();
  }
});
