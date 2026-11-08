// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useReviewPreviewPresentation,
  type ReviewPreviewPresentationInput,
} from './use-preview-presentation';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
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
  vi.useFakeTimers();
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
    maximumInFlight: () => 2,
    prepare: io.prepare,
    renderPresentation: io.render,
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
  vi.useRealTimers();
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
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
  });
};

function cameraBinding() {
  const settings = createQuickEditWebcam(
    'project-asset:camera',
    { width: 160, height: 90 },
    props.canonical
  );
  const released = vi.fn();
  const frame = {
    allocationBytes: 500,
    representedMediaTime: 1.2,
    generation: 2,
    source: { width: 160, height: 90 },
    placement: settings.placement,
    drawable: { draw: vi.fn() },
    release: released,
  };
  const captureFrame = vi.fn<(request: unknown, resources: RenderResources) => unknown>(() => ({
    status: 'ready',
    frame,
  }));
  const dispose = vi.fn();
  io.camera.mockReturnValue({ captureFrame, dispose });
  props.webcam = {
    settings,
    disabled: false,
    onResourceReady: vi.fn(),
    editor: {
      selection: { kind: 'webcam' },
      placement: settings.placement,
      crop: { zoom: 1.2, panX: 0.1, panY: 0.2 },
      resourceAttempt: 0,
      place: vi.fn(),
      retry: vi.fn(),
      selectVisible: vi.fn(),
      time: 1.2,
    },
  };
  return {
    settings,
    frame,
    released,
    captureFrame,
    dispose,
    events: () =>
      io.camera.mock.lastCall![3] as {
        loaded(duration: number): void;
        ready(visible: boolean): void;
        failed(): void;
      },
  };
}

it('waits for camera load, admits selected crop and releases both camera reservations', async () => {
  const camera = cameraBinding();
  camera.captureFrame.mockImplementation((_request, resources) => {
    const retained = resources.bytes('webcam.retained', 500);
    const active = resources.bytes('webcam.active', 500);
    return {
      status: 'ready',
      frame: {
        ...camera.frame,
        release() {
          camera.released();
          active.release();
          retained.release();
        },
      },
    };
  });
  await render();
  await step(0);
  expect(result.status.phase).toBe('pending');
  expect(closed).toHaveBeenCalledOnce();
  act(() => {
    camera.events().loaded(20);
    camera.events().ready(true);
  });
  await step(50);
  expect(result.status.phase).toBe('ready');
  expect(props.webcam!.onResourceReady).toHaveBeenCalledOnce();
  expect(camera.captureFrame.mock.lastCall![0]).toEqual({
    sourceTime: props.pausedSourceTime,
    settings: camera.settings,
    placement: camera.settings.placement,
    crop: props.webcam!.editor.crop,
  });
  expect(io.render.mock.lastCall![1].camera.representedMediaTime).toBe(1.2);
  expect(camera.released).toHaveBeenCalledOnce();
  expect(
    io.graph.mock.calls.some(
      ([graph]) => graph.camera.retainedBytes === 500 && graph.camera.activeBytes === 500
    )
  ).toBe(true);
  props = { ...props, visible: false };
  await render();
  expect(camera.dispose).toHaveBeenCalledOnce();
});

it.each(['unavailable', 'failed'] as const)(
  'releases source capture when camera admission is %s',
  async (status) => {
    const camera = cameraBinding();
    camera.captureFrame.mockReturnValue({ status });
    await render();
    act(() => camera.events().loaded(20));
    await step(0);
    expect(result.status.phase).toBe(status === 'failed' ? 'failed' : 'pending');
    expect(closed).toHaveBeenCalledOnce();
    expect(io.render).not.toHaveBeenCalled();
    camera.captureFrame.mockReturnValue({ status: 'ready', frame: camera.frame });
    act(() => (status === 'failed' ? result.retry() : camera.events().ready(true)));
    await step(50);
    expect(result.status.phase).toBe('ready');
    expect(camera.released).toHaveBeenCalledOnce();
  }
);

it('leaves an offset-hidden loaded camera uncaptured', async () => {
  const camera = cameraBinding();
  props.webcam!.settings.offsetSeconds = 10;
  await render();
  act(() => camera.events().loaded(20));
  await step(0);
  expect(result.status.phase).toBe('ready');
  expect(camera.captureFrame).not.toHaveBeenCalled();
  expect(io.render.mock.lastCall![1].camera).toBeUndefined();
});

it.each([
  ['webcam.retained', 'limits'],
  ['webcam.retained', 'bytes'],
  ['webcam.active', 'limits'],
  ['webcam.active', 'bytes'],
] as const)('rolls back %s charge when %s admission fails', async (role, failure) => {
  const camera = cameraBinding();
  camera.captureFrame.mockImplementation((_request, resources) => {
    resources.bytes(role, 500);
    return { status: 'ready', frame: camera.frame };
  });
  if (failure === 'bytes') {
    io.bytes.mockImplementation((requested) => {
      if (requested === role) throw new Error('Camera reservation refused');
      return { release: vi.fn() };
    });
  } else {
    io.limits.mockImplementation(() => {
      const graph = io.graph.mock.lastCall![0];
      const charge =
        role === 'webcam.retained' ? graph.camera.retainedBytes : graph.camera.activeBytes;
      if (charge === 500) throw new Error('Camera limit refused');
    });
  }
  await render();
  act(() => camera.events().loaded(20));
  await step(0);
  expect(result.status.phase).toBe('failed');
  expect(closed).toHaveBeenCalledOnce();
  io.limits.mockReset();
  io.bytes.mockImplementation(() => ({ release: vi.fn() }));
  props.webcam!.settings.offsetSeconds = 10;
  act(() => result.retry());
  await step(50);
  expect(result.status.phase).toBe('ready');
  expect(io.graph.mock.lastCall![0].camera).toEqual({ retainedBytes: null, activeBytes: null });
});

it('retries a failed camera through its acquisition owner and rejects disposed-source callbacks', async () => {
  const camera = cameraBinding();
  const binding = props.webcam!;
  const retry: ReturnType<typeof vi.fn<() => undefined>> = vi.fn(() => {
    props = {
      ...props,
      webcam: {
        ...binding,
        editor: {
          ...binding.editor,
          resourceAttempt: binding.editor.resourceAttempt + 1,
          retry,
        },
      },
    };
    return undefined;
  });
  binding.editor.retry = retry;
  await render();
  const oldEvents = camera.events();
  act(() => oldEvents.failed());
  await step(0);
  expect(result.status.phase).toBe('failed');
  act(() => result.retry());
  expect(retry).toHaveBeenCalledOnce();
  await render();
  expect(camera.dispose).toHaveBeenCalledOnce();
  expect(io.camera).toHaveBeenCalledTimes(2);
  expect(result.webcamManual.phase).toBe('loading');
  const freshEvents = camera.events();
  expect(freshEvents).not.toBe(oldEvents);
  act(() => {
    freshEvents.loaded(20);
    freshEvents.ready(true);
  });
  await step(50);
  expect(result.status.phase).toBe('ready');
  const published = props.host.current!.firstChild;
  const readyCalls = vi.mocked(binding.onResourceReady!).mock.calls.length;
  act(() => {
    oldEvents.failed();
    oldEvents.loaded(900);
    oldEvents.ready(false);
  });
  await step(100);
  expect(result.webcamManual.phase).toBe('ready');
  expect(result.webcamManual.duration).toBe(20);
  expect(result.webcamManual.ready).toBe(true);
  expect(binding.onResourceReady).toHaveBeenCalledTimes(readyCalls);
  expect(props.host.current!.firstChild).toBe(published);
});

it('keeps a healthy camera lifetime when retrying an unrelated renderer failure', async () => {
  const camera = cameraBinding();
  io.render.mockImplementationOnce(() => {
    throw new Error('Renderer failed');
  });
  await render();
  act(() => {
    camera.events().loaded(20);
    camera.events().ready(true);
  });
  await step(0);
  expect(result.status.phase).toBe('failed');
  act(() => result.retry());
  await step(50);
  expect(result.status.phase).toBe('ready');
  expect(props.webcam!.editor.retry).not.toHaveBeenCalled();
  expect(camera.dispose).not.toHaveBeenCalled();
  expect(io.camera).toHaveBeenCalledOnce();
});

it('retains one detailed renderer across native playback and waits for the new paused publication', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, pausedQuality: 'detailed' };
  const camera = cameraBinding();
  await render();
  act(() => {
    camera.events().loaded(20);
    camera.events().ready(true);
  });
  await step(0);
  expect(result.status.actualRaster).not.toBeNull();
  props = { ...props, playing: true };
  await render();
  await step(50);
  expect(result.active).toBe(false);
  expect(io.dispose).not.toHaveBeenCalled();
  expect(camera.dispose).toHaveBeenCalledOnce();
  expect(io.render).toHaveBeenCalledOnce();
  props = { ...props, playing: false, pausedSourceTime: 2, pausedResultTime: 1.75 };
  await render();
  expect(result.status.actualRaster).toBeNull();
  expect(io.camera).toHaveBeenCalledTimes(2);
  act(() => {
    camera.events().loaded(20);
    camera.events().ready(true);
  });
  await step(100);
  expect(result.status.actualRaster).not.toBeNull();
  expect(io.factory).toHaveBeenCalledOnce();
  expect(io.render.mock.lastCall![1].sourceTime).toBe(2);
});

it.each(['shift', 'overlay'] as const)(
  'keeps the resolved camera panel when selected in %s mode',
  async (screenBehavior) => {
    const camera = cameraBinding();
    camera.settings.split = 'left';
    camera.settings.screenBehavior = screenBehavior;
    await render();
    await step(0);
    act(() => {
      camera.events().loaded(20);
      camera.events().ready(true);
    });
    await step(50);
    expect(result.status.phase).toBe('ready');
    expect(camera.captureFrame.mock.lastCall![0]).toEqual({
      sourceTime: props.pausedSourceTime,
      settings: camera.settings,
      placement: undefined,
      crop: props.webcam!.editor.crop,
    });
  }
);

it('freezes primary HTML pixels and source clock before a pending canonical camera', async () => {
  const camera = cameraBinding();
  const gate = Promise.withResolvers<{ status: 'ready'; frame: typeof camera.frame }>();
  camera.captureFrame.mockImplementation(() => {
    expect(io.bytes).toHaveBeenCalledWith('preview-source-frame', 1234);
    return gate.promise;
  });
  await render();
  act(() => camera.events().loaded(20));
  await step(0);
  expect(io.render).not.toHaveBeenCalled();
  expect(camera.captureFrame.mock.lastCall![0]).toMatchObject({ sourceTime: 1.234567 });
  props.video.current!.currentTime = 99;
  await act(async () => {
    gate.resolve({ status: 'ready', frame: camera.frame });
  });
  expect(io.render.mock.lastCall![1]).toMatchObject({
    sourceTime: 1.234567,
    resultTime: 0.987654,
    camera: { representedMediaTime: 1.2 },
  });
  expect(camera.released).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
});

it('retains camera and primary through active rendering after owner disposal', async () => {
  const camera = cameraBinding();
  const fence = Promise.withResolvers<void>();
  const draw = io.render.getMockImplementation()!;
  io.render.mockImplementation(async (...args: unknown[]) => {
    await fence.promise;
    return draw(...args);
  });
  await render();
  act(() => camera.events().loaded(20));
  await step(0);
  expect(io.render).toHaveBeenCalledOnce();
  props = { ...props, visible: false };
  await render();
  expect(camera.dispose).toHaveBeenCalledOnce();
  expect(camera.released).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  await act(async () => {
    fence.resolve();
  });
  expect(camera.released).toHaveBeenCalledOnce();
  expect(closed).toHaveBeenCalledOnce();
  expect(props.host.current!.querySelector('[data-preview-front="true"]')).toBeNull();
});
