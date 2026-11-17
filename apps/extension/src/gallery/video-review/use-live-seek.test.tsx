// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createReviewLiveSeekQueue } from './use-live-seek';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function frame() {
  return { canvas: document.createElement('canvas'), release: vi.fn() };
}
const settle = async () => {
  for (let i = 0; i < 8; ++i) await Promise.resolve();
};

it('renders one job and only the latest pending hover, releasing skipped and presented frames', async () => {
  const first = deferred<ReturnType<typeof frame>>(),
    last = deferred<ReturnType<typeof frame>>();
  const renderAtTime = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => last.promise);
  const renderer = { renderAtTime, dispose: vi.fn() },
    present = vi.fn(),
    clear = vi.fn();
  const open = vi.fn(async () => renderer);
  const queue = createReviewLiveSeekQueue(open, present, clear);
  queue.request(1);
  await settle();
  queue.request(2);
  queue.request(3);
  expect(renderAtTime.mock.calls).toEqual([[1]]);
  const a = frame();
  first.resolve(a);
  await settle();
  expect(present).not.toHaveBeenCalled();
  expect(a.release).toHaveBeenCalledOnce();
  expect(renderAtTime.mock.calls).toEqual([[1], [3]]);
  const b = frame();
  last.resolve(b);
  await settle();
  expect(present).toHaveBeenCalledExactlyOnceWith(b, 3);
  expect(b.release).toHaveBeenCalledOnce();
  expect(open).toHaveBeenCalledOnce();
  queue.dispose();
  expect(renderer.dispose).toHaveBeenCalledOnce();
});

it('clears immediately on leave and never publishes a late frame', async () => {
  const job = deferred<ReturnType<typeof frame>>();
  const present = vi.fn(),
    clear = vi.fn();
  const queue = createReviewLiveSeekQueue(
    async () => ({ renderAtTime: async () => job.promise, dispose: vi.fn() }),
    present,
    clear
  );
  queue.request(1);
  await settle();
  queue.request(null);
  expect(clear).toHaveBeenCalledOnce();
  const output = frame();
  job.resolve(output);
  await settle();
  expect(present).not.toHaveBeenCalled();
  expect(output.release).toHaveBeenCalledOnce();
  queue.dispose();
});

it('aborts disposal and releases a renderer that opens after cancellation', async () => {
  const opening = deferred<{
    renderAtTime: (time: number) => Promise<ReturnType<typeof frame>>;
    dispose(): void;
  }>();
  let signal: AbortSignal | undefined;
  const renderer = { renderAtTime: vi.fn(async (_time: number) => frame()), dispose: vi.fn() };
  const queue = createReviewLiveSeekQueue(
    async (value) => {
      signal = value;
      return opening.promise;
    },
    vi.fn(),
    vi.fn()
  );
  queue.request(1);
  queue.dispose();
  queue.dispose();
  expect(signal?.aborted).toBe(true);
  opening.resolve(renderer);
  await settle();
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(renderer.renderAtTime).not.toHaveBeenCalled();
});

it('drops failed preparation without a retry loop and accepts the next hover', async () => {
  const renderer = { renderAtTime: vi.fn(async (_time: number) => frame()), dispose: vi.fn() };
  const open = vi
    .fn()
    .mockRejectedValueOnce(new Error('decode unavailable'))
    .mockResolvedValueOnce(renderer);
  const present = vi.fn(),
    clear = vi.fn(),
    queue = createReviewLiveSeekQueue(open, present, clear);
  queue.request(1);
  await settle();
  expect(open).toHaveBeenCalledOnce();
  expect(clear).toHaveBeenCalledOnce();
  queue.request(2);
  await settle();
  expect(open).toHaveBeenCalledTimes(2);
  expect(present).toHaveBeenCalledOnce();
  queue.dispose();
});

it('releases an active frame after disposal without presenting or starting more work', async () => {
  const pending = deferred<ReturnType<typeof frame>>(),
    present = vi.fn();
  const renderer = { renderAtTime: vi.fn(async () => pending.promise), dispose: vi.fn() };
  const queue = createReviewLiveSeekQueue(async () => renderer, present, vi.fn());
  queue.request(1);
  await settle();
  queue.request(2);
  queue.dispose();
  const output = frame();
  pending.resolve(output);
  await settle();
  expect(present).not.toHaveBeenCalled();
  expect(output.release).toHaveBeenCalledOnce();
  expect(renderer.renderAtTime).toHaveBeenCalledOnce();
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useReviewLiveSeek } from './use-live-seek';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { DEFAULT_QUICK_PREVIEW_PREFERENCES } from '../../features/video/preview/quick-preferences';
import { createVideoProjectFromRecording } from '../../features/video/project/factories/creation';
const io = vi.hoisted(() => ({ open: vi.fn(), history: vi.fn() }));
vi.mock('../../workflows/video-review/presentation-main', () => ({
  createReviewPresentationMain: io.open,
}));
vi.mock('../../workflows/video-review/recording-render', () => ({
  createReviewRecordingRenderSource: io.history,
}));

function hookFixture() {
  const source = { width: 64, height: 36, duration: 10, size: 10, mimeType: 'video/mp4' };
  const state: Parameters<typeof useReviewLiveSeek>[1] = {
    advanced: createQuickEditAdvancedState(),
    source,
    resultTime: 0,
    snapshot: {
      document: {
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
            audio: 'speed',
          },
        ],
        annotations: [],
        canvasComments: [],
      },
      snapshot: { workspace: {} },
    },
    exporter: {
      index: {
        duration: 10,
        boundaries: [],
        videoCodec: 'avc',
        audioCodec: null,
        container: 'mp4',
        rotation: 0,
        frameRate: 30,
        width: 64,
        height: 36,
      },
      renderSettings: { frameRate: 0 },
    },
    keyCues: [],
    clickCues: [],
  };
  const resource: Parameters<typeof useReviewLiveSeek>[0] = {
    file: new File(['source'], 'source.mp4'),
    telemetry: null,
    session: { readAnnotationResource: vi.fn(async () => new Blob(['asset'])) },
  };
  return { state, resource };
}

it('hover uses shared cut/speed clocks, restores on leave/blur/seek and never mutates the project', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const context = { clearRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
  const renderer = { renderAtTime: vi.fn(async (_time: number) => frame()), dispose: vi.fn() };
  io.open.mockResolvedValue(renderer);
  const { state, resource } = hookFixture(),
    original = structuredClone(state);
  const raster = { width: 64, height: 36 },
    root = createRoot(document.createElement('div'));
  let hook!: ReturnType<typeof useReviewLiveSeek>;
  function Harness({ blocked = false }: { blocked?: boolean }) {
    hook = useReviewLiveSeek(resource, state, DEFAULT_QUICK_PREVIEW_PREFERENCES, raster, blocked);
    return <canvas ref={hook.canvas} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(hook.available).toBe(true);
    expect(io.open).not.toHaveBeenCalled();
    await act(async () => hook.setEnabled(true));
    await act(async () => {
      hook.hover(5);
      await settle();
    });
    expect(renderer.renderAtTime).toHaveBeenLastCalledWith(2.5);
    expect(hook.visible).toBe(true);
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(state).toEqual(original);
    const args = io.open.mock.calls.at(-1)![0];
    await args.readAsset('asset');
    expect(resource.session.readAnnotationResource).toHaveBeenCalledWith('asset', args.signal);
    await act(async () => hook.hover(3));
    expect(hook.visible).toBe(false);
    await act(async () => {
      hook.hover(10);
      await settle();
    });
    const last = renderer.renderAtTime.mock.calls.at(-1)![0];
    expect(last).toBeLessThan(7);
    expect(last).toBeGreaterThan(6.99);
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(hook.visible).toBe(false);
    await act(async () => {
      hook.hover(1);
      await settle();
    });
    expect(hook.visible).toBe(true);
    state.resultTime = 1;
    await act(async () => root.render(<Harness />));
    expect(hook.visible).toBe(false);
    expect(args.signal.aborted).toBe(true);
    await act(async () => {
      hook.hover(1);
      await settle();
    });
    await act(async () => root.render(<Harness blocked />));
    expect(hook.visible).toBe(false);
    await act(async () => hook.setEnabled(false));
    expect(hook.visible).toBe(false);
  } finally {
    await act(async () => root.unmount());
    getContext.mockRestore();
    vi.unstubAllGlobals();
    io.open.mockReset();
  }
});

it('bounds archive history to its owned hover renderer and releases it after a failed open', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { state, resource } = hookFixture();
  resource.historyProject = createVideoProjectFromRecording({
    ...state.source,
    recordingId: 'recording',
    filename: 'source.mp4',
  });
  resource.telemetry = {
    recordingId: 'recording',
    createdAt: 1,
    updatedAt: 1,
    captureMode: null,
    viewport: null,
    cursorTrack: null,
    signals: [],
    actionEvents: [],
  };
  const history = { dispose: vi.fn() };
  io.history.mockReturnValue(history);
  io.open.mockRejectedValue(new Error('unsupported decoder'));
  const root = createRoot(document.createElement('div')),
    raster = { width: 64, height: 36 };
  let hook!: ReturnType<typeof useReviewLiveSeek>;
  function Harness() {
    hook = useReviewLiveSeek(resource, state, DEFAULT_QUICK_PREVIEW_PREFERENCES, raster, false);
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => hook.setEnabled(true));
    await act(async () => {
      hook.hover(5);
      await settle();
    });
    expect(io.history).toHaveBeenCalledWith(
      expect.objectContaining({
        project: resource.historyProject,
        advanced: state.advanced,
        edits: state.snapshot.document.edits,
      })
    );
    expect(history.dispose).toHaveBeenCalledOnce();
    expect(hook.visible).toBe(false);
    expect(io.open).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    io.open.mockReset();
    io.history.mockReset();
    vi.unstubAllGlobals();
  }
});

it('invalidates an unheld hover after a result-only seek within the same freeze', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  io.open.mockResolvedValue({ renderAtTime: vi.fn(async () => frame()), dispose: vi.fn() });
  const { state, resource } = hookFixture();
  const input = Object.assign(state, { resultTime: 6.1 });
  input.snapshot.document.edits = [
    {
      id: 'freeze',
      kind: 'freeze',
      start: 4,
      end: 4,
      requestedStart: 4,
      requestedEnd: 4,
      duration: 3,
      frameTime: 3.98,
      frameDuration: 0.04,
    },
  ];
  const root = createRoot(document.createElement('div')),
    raster = { width: 64, height: 36 };
  let hook!: ReturnType<typeof useReviewLiveSeek>;
  function Harness() {
    hook = useReviewLiveSeek(resource, input, DEFAULT_QUICK_PREVIEW_PREFERENCES, raster, false);
    return <canvas ref={hook.canvas} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      hook.hover(4, 6.9);
      await settle();
    });
    expect(hook.visible).toBe(true);
    input.resultTime = 6.5;
    await act(async () => root.render(<Harness />));
    expect(hook.visible).toBe(false);
  } finally {
    await act(async () => root.unmount());
    getContext.mockRestore();
    vi.unstubAllGlobals();
    io.open.mockReset();
  }
});

it('keeps freeze hover through cached and late wrong-result receipts; clears on exact completion or Play', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  io.open.mockResolvedValue({ renderAtTime: vi.fn(async () => frame()), dispose: vi.fn() });
  const { state, resource } = hookFixture();
  state.resultTime = 6.1;
  state.snapshot.document.edits = [
    {
      id: 'freeze',
      kind: 'freeze',
      start: 4,
      end: 4,
      requestedStart: 4,
      requestedEnd: 4,
      duration: 3,
      frameTime: 3.98,
      frameDuration: 0.04,
    },
  ];
  const root = createRoot(document.createElement('div')),
    raster = { width: 64, height: 36 };
  let hook!: ReturnType<typeof useReviewLiveSeek>;
  function Harness({ blocked = false }: { blocked?: boolean }) {
    hook = useReviewLiveSeek(resource, state, DEFAULT_QUICK_PREVIEW_PREFERENCES, raster, blocked);
    return <canvas ref={hook.canvas} />;
  }
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => hook.onPresentedTime(6.1));
    await act(async () => {
      hook.hover(4, 6.9);
      await settle();
    });
    expect(hook.visible).toBe(true);
    await act(async () => hook.hold());
    await act(async () => hook.commit(6.9));
    state.resultTime = 6.9;
    await act(async () => root.render(<Harness />));
    expect(hook.visible).toBe(true);
    await act(async () => hook.onPresentedTime(6.1));
    expect(hook.visible).toBe(true);
    await act(async () => hook.onPresentedTime(6.9));
    expect(hook.visible).toBe(false);
    await act(async () => {
      hook.hover(4, 6.4);
      await settle();
    });
    await act(async () => hook.hold());
    await act(async () => hook.finishIntent(() => 6.9));
    await act(async () => settle());
    expect(hook.visible).toBe(false);
    await act(async () => {
      hook.hover(4, 6.4);
      await settle();
    });
    await act(async () => {
      hook.hold();
      hook.commit(6.4);
    });
    expect(hook.visible).toBe(true);
    await act(async () => root.render(<Harness blocked />));
    expect(hook.visible).toBe(false);
  } finally {
    await act(async () => root.unmount());
    getContext.mockRestore();
    vi.unstubAllGlobals();
    io.open.mockReset();
  }
});
