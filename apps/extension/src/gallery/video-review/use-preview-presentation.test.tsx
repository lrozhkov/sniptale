// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  useReviewPreviewPresentation,
  isReviewPreviewManual,
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
    return { canvas, context: {}, release, generation: frame.generation };
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

it('preserves Current mode and allocates no manual renderer for an FPS readout', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, showFrameRate: true };
  await render();
  expect(result.active).toBe(false);
  expect(io.factory).not.toHaveBeenCalled();
  expect(io.prepare).not.toHaveBeenCalled();
  expect(isReviewPreviewManual({ ...props.preferences, pausedQuality: 'detailed' }, false)).toBe(
    true
  );
  expect(isReviewPreviewManual({ ...props.preferences, pausedQuality: 'detailed' }, true)).toBe(
    false
  );
});

it('uses the manual owner at source cadence and releases disabled annotations', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES };
  props.sourceFrameRate = 24;
  props.scene.annotationEffects = {
    lane: {
      enabled: true,
      instances: [
        {
          id: 'frame',
          snapshotId: 'effect:frame',
          enabled: true,
          start: 0,
          end: 2,
          attachment: 'content',
          transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
          controls: {},
          order: 0,
        },
      ],
    },
    snapshots: [],
    segments: [],
  };
  const readAsset = vi.fn(async () => new Blob(['private image']));
  props.readAsset = readAsset;
  await render();
  expect(result.active).toBe(true);
  expect(io.factory.mock.lastCall![0].readAsset).toBe(readAsset);
  await step(0);
  expect(io.prepare.mock.calls[0]![0].annotationEffects).toEqual(props.scene.annotationEffects);
  expect(io.render.mock.calls[0]![1].fps).toBe(24);
  expect(props.host.current!.querySelectorAll('canvas')).toHaveLength(1);
  props.scene.annotationEffects.lane.enabled = false;
  await render();
  expect(result.active).toBe(false);
  expect(props.host.current!.querySelector('canvas')).toBeNull();
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(releases[0]).toHaveBeenCalledOnce();
  props.scene.annotationEffects.lane.enabled = true;
  props.scene.annotationEffects.lane.instances[0]!.enabled = false;
  await render();
  expect(result.active).toBe(false);
  expect(io.factory).toHaveBeenCalledOnce();
});

it('publishes a complete manual frame at exact paused clocks and retains only its front lease', async () => {
  const pause = vi.spyOn(props.video.current!, 'pause').mockImplementation(() => {});
  await render();
  await step(0);
  expect(io.prepare.mock.calls[0]![0].comments[0].renderToVideo).toBe(false);
  expect(io.prepare.mock.calls[0]![0].showEditorComments).toBe(true);
  expect(props.scene.comments[0]!.renderToVideo).toBe(false);
  const frame = io.render.mock.calls[0]![1];
  expect(frame.sourceTime).toBe(1.234567);
  expect(frame.resultTime).toBe(0.987654);
  expect(frame.source.timestamp).toBe(0.765432);
  expect(io.bytes).toHaveBeenCalledWith('preview-source-frame', 1234);
  expect(closed).toHaveBeenCalledOnce();
  expect(preparedRelease).toHaveBeenCalledOnce();
  expect(releases[0]).not.toHaveBeenCalled();
  expect(props.host.current!.querySelectorAll('canvas')).toHaveLength(1);
  expect(result.status).toMatchObject({
    phase: 'ready',
    actualRaster: { width: 720, height: 360 },
  });
  expect(pause).not.toHaveBeenCalled();
  props = { ...props, pausedSourceTime: 2, pausedResultTime: 1.75, seekRevision: 1 };
  await render();
  await step(50);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[1]).not.toHaveBeenCalled();
  expect(result.status.presentedFPS).toBeNull();
});

it('does not capture stale source pixels after asynchronous preparation finishes for a replaced source', async () => {
  let resolve!: (value: unknown) => void;
  io.prepare.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await render();
  await step(0);
  props = { ...props, sourceIdentity: 'replacement' };
  await render();
  await act(async () =>
    resolve({
      generation: 1,
      watermarkBounds: null,
      allocationAssets: assets,
      release: preparedRelease,
    })
  );
  expect(io.render).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  expect(preparedRelease).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
  await step(50);
  expect(io.render).toHaveBeenCalledOnce();
});

it('retains visible pixels on seek until atomic replacement without changing transport time', async () => {
  await render();
  await step(0);
  const front = props.host.current!.querySelector('canvas');
  Object.defineProperty(props.video.current, 'seeking', { configurable: true, value: true });
  act(() => props.video.current!.dispatchEvent(new Event('seeking')));
  expect(props.host.current!.querySelector('canvas')).toBe(front);
  expect(releases[0]).not.toHaveBeenCalled();
  await step(50);
  expect(io.render).toHaveBeenCalledOnce();
  expect(result.status.phase).toBe('pending');
  Object.defineProperty(props.video.current, 'seeking', { configurable: true, value: false });
  act(() => props.video.current!.dispatchEvent(new Event('seeked')));
  await step(100);
  expect(io.render).toHaveBeenCalledTimes(2);
  expect(props.host.current!.querySelector('canvas')).not.toBe(front);
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(props.video.current!.currentTime).toBe(1.234567);
});

it('reports render failure, closes captures, and retries without changing quality', async () => {
  io.render.mockImplementationOnce(() => {
    throw new Error('GPU unavailable');
  });
  await render();
  await step(0);
  expect(result.status.phase).toBe('failed');
  expect(closed).toHaveBeenCalledOnce();
  expect(props.host.current!.querySelector('canvas')).toBeNull();
  act(() => result.retry());
  await step(50);
  expect(result.status.phase).toBe('ready');
  expect(io.prepare.mock.calls.at(-1)![1].backing).toEqual({ width: 720, height: 360 });
});

it('disposes expensive presentation when hidden and forwards comment drafts only into the next scene', async () => {
  await render();
  await step(0);
  act(() => result.onCommentPreview('comment', { x: 0.2, y: 0.3 }));
  await step(50);
  expect(io.prepare.mock.calls.at(-1)![0].comments[0].position).toEqual({ x: 0.2, y: 0.3 });
  expect(props.scene.comments[0]!.position).not.toEqual({ x: 0.2, y: 0.3 });
  props = { ...props, visible: false };
  await render();
  expect(ticks.size).toBe(0);
  expect(io.dispose).toHaveBeenCalledOnce();
  expect(io.ledgerDispose).toHaveBeenCalledOnce();
  expect(props.host.current!.querySelector('canvas')).toBeNull();
});

it('reports native video cadence separately without a compositor when only the readout is enabled', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, showFrameRate: true };
  const callbacks: VideoFrameRequestCallback[] = [];
  props.video.current!.requestVideoFrameCallback = vi.fn((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  props.video.current!.cancelVideoFrameCallback = vi.fn();
  await render();
  expect(callbacks).toHaveLength(0);
  props = { ...props, playing: true };
  await render();
  act(() =>
    callbacks.at(-1)!(0, {
      expectedDisplayTime: 0,
      presentedFrames: 1,
    } as VideoFrameCallbackMetadata)
  );
  act(() =>
    callbacks.at(-1)!(500, {
      expectedDisplayTime: 500,
      presentedFrames: 16,
    } as VideoFrameCallbackMetadata)
  );
  expect(result.status.nativeVideoFPS).toBe(30);
  const late = callbacks.at(-1)!;
  props = { ...props, playing: false };
  await render();
  act(() =>
    late(1000, { expectedDisplayTime: 1000, presentedFrames: 31 } as VideoFrameCallbackMetadata)
  );
  expect(result.status.nativeVideoFPS).toBeNull();
  expect(result.status.presentedFPS).toBeNull();
  expect(io.factory).not.toHaveBeenCalled();
});

it.each(['external', 'comment', 'webcam'] as const)(
  'retains detailed-only paused ownership during %s interaction and refines the same timestamp afterward',
  async (gesture) => {
    props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES, pausedQuality: 'detailed' };
    props.css = { width: 100, height: 50 };
    await render();
    await step(0);
    expect(result.active).toBe(true);
    expect(io.prepare.mock.calls.at(-1)![1].backing).toEqual({ width: 200, height: 100 });
    if (gesture === 'external') {
      props = { ...props, interacting: true };
      await render();
    } else if (gesture === 'comment')
      act(() => result.onCommentPreview('comment', { x: 0.2, y: 0.3 }));
    else act(() => result.onWebcamPreview({ x: 0.2, y: 0.3, width: 0.2, height: 0.2 }));
    await step(50);
    expect(result.active).toBe(true);
    expect(io.factory).toHaveBeenCalledOnce();
    expect(io.dispose).not.toHaveBeenCalled();
    expect(io.prepare.mock.calls.at(-1)![1].backing).toEqual({ width: 100, height: 50 });
    if (gesture === 'external') {
      props = { ...props, interacting: false };
      await render();
    } else if (gesture === 'comment') act(() => result.onCommentPreview('comment', null));
    else act(() => result.onWebcamPreview(null));
    await step(100);
    expect(io.prepare.mock.calls.at(-1)![1].backing).toEqual({ width: 200, height: 100 });
    expect(io.factory).toHaveBeenCalledOnce();
    for (const [, frame] of io.render.mock.calls) {
      expect(frame.sourceTime).toBe(1.234567);
      expect(frame.resultTime).toBe(0.987654);
    }
    props = { ...props, playing: true };
    await render();
    expect(result.active).toBe(false);
    expect(io.dispose).not.toHaveBeenCalled();
  }
);

it('counts a retained cut pair outside the blend without reserving it again for each active frame', async () => {
  await render();
  const admit = io.provider.mock.lastCall![2] as (bytes: readonly [number, number]) => {
    release(): void;
  };
  const retained = admit([300, 400]);
  expect(io.bytes).toHaveBeenCalledWith('preview-transition-endpoints', 700);
  const index = io.bytes.mock.calls.findIndex(([role]) => role === 'preview-transition-endpoints');
  const reservation = io.bytes.mock.results[index]!.value as { release: ReturnType<typeof vi.fn> };
  await step(0);
  expect(io.graph.mock.lastCall![0].transitionBytes).toEqual([300, 400]);
  expect(reservation.release).not.toHaveBeenCalled();
  props = { ...props, pausedResultTime: 1.1 };
  await render();
  await step(50);
  expect(
    io.bytes.mock.calls.filter(([role]) => role === 'preview-transition-endpoints')
  ).toHaveLength(1);
  expect(reservation.release).not.toHaveBeenCalled();
  retained.release();
  expect(reservation.release).toHaveBeenCalledOnce();
  props = { ...props, pausedResultTime: 1.2 };
  await render();
  await step(100);
  expect(io.graph.mock.lastCall![0].transitionBytes).toBeNull();
});

it('retains cut admission until its mounted source lifetime changes', async () => {
  await render();
  const first = io.provider.mock.lastCall![2] as (bytes: readonly [number, number]) => {
    release(): void;
  };
  props = { ...props, pausedResultTime: 1.1 };
  await render();
  expect(io.provider.mock.lastCall![2]).toBe(first);
  props = { ...props, sourceIdentity: 'replacement' };
  await render();
  const replacement = io.provider.mock.lastCall![2] as typeof first;
  expect(replacement).not.toBe(first);
  expect(() => first([100, 200])).toThrow('Preview endpoint owner unavailable');
  const reservation = replacement([100, 200]);
  expect(io.bytes).toHaveBeenCalledWith('preview-transition-endpoints', 300);
  reservation.release();
  props = { ...props, visible: false };
  await render();
  expect(() => replacement([100, 200])).toThrow('Preview endpoint owner unavailable');
});

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
  const captureAccepted = vi.fn<(request: unknown, resources: RenderResources) => unknown>(() => ({
    status: 'ready',
    frame,
  }));
  const dispose = vi.fn();
  io.camera.mockReturnValue({ captureAccepted, dispose });
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
    captureAccepted,
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
  camera.captureAccepted.mockImplementation((_request, resources) => {
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
  expect(camera.captureAccepted.mock.lastCall![0]).toEqual({
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
    camera.captureAccepted.mockReturnValue({ status });
    await render();
    act(() => camera.events().loaded(20));
    await step(0);
    expect(result.status.phase).toBe(status === 'failed' ? 'failed' : 'pending');
    expect(closed).toHaveBeenCalledOnce();
    expect(io.render).not.toHaveBeenCalled();
    camera.captureAccepted.mockReturnValue({ status: 'ready', frame: camera.frame });
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
  expect(camera.captureAccepted).not.toHaveBeenCalled();
  expect(io.render.mock.lastCall![1].camera).toBeUndefined();
});

it.each([false, true])(
  'retries a cut provider with failed=%s without exposing a partial frame',
  async (failed) => {
    io.cut.mockReturnValue({ failed, frames: null, lease: null });
    await render();
    await step(0);
    expect(result.status.phase).toBe(failed ? 'failed' : 'pending');
    expect(io.render).not.toHaveBeenCalled();
    io.cut.mockReturnValue(null);
    act(() =>
      failed ? result.retry() : props.video.current!.dispatchEvent(new Event('timeupdate'))
    );
    await step(50);
    expect(result.status.phase).toBe('ready');
  }
);

it('rechecks cut readiness after preparation and releases the unused prepared lease', async () => {
  io.cut.mockReturnValueOnce(null).mockReturnValue({ failed: false, frames: null, lease: null });
  await render();
  await step(0);
  expect(result.status.phase).toBe('pending');
  expect(preparedRelease).toHaveBeenCalledOnce();
  expect(closed).not.toHaveBeenCalled();
  io.cut.mockReturnValue(null);
  act(() => props.video.current!.dispatchEvent(new Event('timeupdate')));
  await step(50);
  expect(result.status.phase).toBe('ready');
});

it('rolls back source and endpoint admission refusal before an explicit retry', async () => {
  io.bytes.mockImplementationOnce(() => {
    throw new Error('No capacity');
  });
  await render();
  await step(0);
  expect(result.status.phase).toBe('failed');
  expect(closed).toHaveBeenCalledOnce();
  const admit = io.provider.mock.lastCall![2] as (bytes: readonly [number, number]) => {
    release(): void;
  };
  io.bytes.mockImplementationOnce(() => {
    throw new Error('No endpoint capacity');
  });
  expect(() => admit([100, 200])).toThrow('No endpoint capacity');
  const pair = admit([100, 200]);
  expect(() => admit([100, 200])).toThrow('Preview endpoint admission unavailable');
  pair.release();
  act(() => result.retry());
  await step(50);
  expect(result.status.phase).toBe('ready');
  expect(io.graph.mock.lastCall![0].transitionBytes).toBeNull();
});

it('releases unpublished raster on host loss and resumes only after readiness', async () => {
  const output = props.host.current;
  await render();
  props.host.current = null;
  await step(0);
  expect(result.status.phase).toBe('pending');
  expect(releases[0]).toHaveBeenCalledOnce();
  props.host.current = output;
  act(() => props.video.current!.dispatchEvent(new Event('timeupdate')));
  await step(50);
  expect(result.status.phase).toBe('ready');
});

it('requires explicit retry after context loss and ignores loss after disposal', async () => {
  await render();
  await step(0);
  const lost = io.factory.mock.lastCall![0].onContextLost as () => void;
  act(lost);
  await step(50);
  expect(result.status.phase).toBe('failed');
  expect(io.render).toHaveBeenCalledOnce();
  act(() => result.retry());
  await step(100);
  expect(result.status.phase).toBe('ready');
  expect(io.factory).toHaveBeenCalledTimes(2);
  props = { ...props, visible: false };
  await render();
  act(lost);
  expect(ticks.size).toBe(0);
  expect(result.status.phase).toBe('inactive');
});

it('waits for a mapped result clock and reports completed playing cadence', async () => {
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

it.each([
  ['webcam.retained', 'limits'],
  ['webcam.retained', 'bytes'],
  ['webcam.active', 'limits'],
  ['webcam.active', 'bytes'],
] as const)('rolls back %s charge when %s admission fails', async (role, failure) => {
  const camera = cameraBinding();
  camera.captureAccepted.mockImplementation((_request, resources) => {
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

it('keeps the composed owner for dissolve projects even at Current quality outside the seam', async () => {
  props.preferences = { ...DEFAULT_QUICK_PREVIEW_PREFERENCES };
  props.cut = {
    file: new File(['source'], 'source.webm'),
    duration: 10,
    time: 0,
    edits: [
      {
        id: 'cut',
        kind: 'cut',
        start: 2,
        end: 4,
        requestedStart: 2,
        requestedEnd: 4,
        transition: { type: 'dissolve', before: 0.5, after: 0.5 },
      },
    ],
  };
  await render();
  expect(result.active).toBe(true);
  expect(io.factory).toHaveBeenCalledOnce();
  props = { ...props, playing: true, cut: { ...props.cut, time: 5 } };
  await render();
  expect(result.active).toBe(true);
  expect(io.factory).toHaveBeenCalledOnce();
  expect(io.dispose).not.toHaveBeenCalled();
});

it('waits for attached background publication and resumes the same paused frame automatically', async () => {
  await render();
  await step(0);
  const front = props.host.current!.firstElementChild;
  props = {
    ...props,
    backgroundPending: true,
    scene: {
      ...props.scene,
      background: {
        enabled: true,
        type: 'image',
        assetId: 'project-asset:attached',
        imageFit: 'cover',
        layout: { padding: 8, cornerRadius: 4 },
      },
    },
  };
  await render();
  await step(50);
  expect(io.prepare).toHaveBeenCalledOnce();
  expect(result.status.phase).toBe('pending');
  expect(props.host.current!.firstElementChild).toBe(front);
  props = { ...props, backgroundPending: false };
  await render();
  await step(100);
  expect(io.prepare).toHaveBeenCalledTimes(2);
  expect(result.status.phase).toBe('ready');
  expect(props.video.current!.currentTime).toBe(1.234567);
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
