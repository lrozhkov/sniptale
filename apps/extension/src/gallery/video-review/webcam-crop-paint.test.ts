import * as normalization from '../../features/video/composition/draw/decoded-sample';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebcamCropPaintOwner } from './webcam-crop-paint';
import { createCameraCropGpuRenderer } from '../../features/video/composition/canvas/camera-crop-gpu';
import {
  createPreviewPresentationSession,
  type GpuPreviewOutput,
} from '../../features/video/composition/canvas/preview-presentation';
import {
  GpuPreviewDeviceError,
  type GpuPreviewRenderer,
  type createGpuPreviewRenderer,
} from '../../features/video/composition/canvas/gpu-preview';
import { createQuickEditWebcam } from '../../features/video/review/advanced/webcam';
import { drawReviewWebcam } from '../../workflows/video-review/render-webcam';

const sources = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-source', () => ({
  createPreviewSourceProvider: sources.create,
}));
const compatible = vi.hoisted(() => ({
  create: vi.fn(),
  acquire: vi.fn(),
  retain: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../workflows/video/preview-html-source', () => ({
  createPreviewHtmlSourceProvider: compatible.create,
}));
beforeEach(() => {
  sources.acquire.mockReset().mockResolvedValue(null);
  compatible.acquire.mockReset();
  compatible.create.mockReturnValue({
    acquire: compatible.acquire,
    retainSources: compatible.retain,
    dispose: compatible.dispose,
  });
  sources.create.mockReturnValue({
    acquire: sources.acquire,
    retainSources: sources.retain,
    dispose: sources.dispose,
  });
});

vi.mock('../../workflows/video-review/render-webcam', () => ({ drawReviewWebcam: vi.fn() }));

type CropRenderer = ReturnType<typeof createCameraCropGpuRenderer>;
type CropInput = Parameters<CropRenderer['render']>[0];
type CropResult = Awaited<ReturnType<CropRenderer['render']>>;
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function fixture(
  factory?: typeof createCameraCropGpuRenderer,
  callbacks: Pick<Parameters<typeof createWebcamCropPaintOwner>[0], 'readSource' | 'accept'> = {}
) {
  const target = document.createElement('canvas'),
    host = document.createElement('div');
  host.append(target);
  document.body.append(host);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 120, 90));
  const context = target.getContext('2d');
  if (!context) throw new Error('Expected Canvas test context');
  vi.spyOn(context, 'clearRect');
  const getContext = vi.spyOn(target, 'getContext');
  const media = document.createElement('video');
  const source = { readyState: 2, seeking: false };
  Object.defineProperties(media, {
    readyState: { get: () => source.readyState },
    seeking: { get: () => source.seeking },
    videoWidth: { value: 640 },
    videoHeight: { value: 360 },
  });
  media.currentTime = 1;
  media.src = 'blob:camera';
  const session = createPreviewPresentationSession({
    fallback: () => target,
    host: () => host,
    role: 'inspector',
    background: 'transparent',
  });
  session.mount();
  const publish = vi.spyOn(session, 'publish');
  const backend = {
    allocatedBytes: 0,
    dispose: vi.fn(),
    render: vi.fn<GpuPreviewRenderer['render']>(),
    createSurface: vi.fn<NonNullable<GpuPreviewRenderer['createSurface']>>((canvas) => ({
      canvas,
      present: vi.fn(async () => {}),
      dispose: vi.fn(),
    })),
  } satisfies GpuPreviewRenderer;
  const records: {
    input: CropInput;
    resolve(value: CropResult): void;
    reject(reason: unknown): void;
  }[] = [];
  const adapters: CropRenderer[] = [];
  let active = 0,
    maximumActive = 0;
  const createRenderer = vi.fn<typeof createCameraCropGpuRenderer>(() => {
    const adapter: CropRenderer = {
      fallbackReason: undefined,
      dispose: vi.fn(),
      render: vi.fn<CropRenderer['render']>((input) => {
        const completion = Promise.withResolvers<CropResult>();
        active++;
        maximumActive = Math.max(maximumActive, active);
        records.push({ input, resolve: completion.resolve, reject: completion.reject });
        return completion.promise.finally(() => {
          active--;
        });
      }),
    };
    adapters.push(adapter);
    return adapter;
  });
  const fail = vi.fn();
  const owner = createWebcamCropPaintOwner({
    target,
    media,
    presenter: session,
    fail,
    createRenderer: factory ?? createRenderer,
    ...callbacks,
  });
  cleanups.push(() => {
    owner.dispose();
    session.dispose();
  });
  const camera = createQuickEditWebcam(
    'project-asset:camera',
    { width: 640, height: 360 },
    { width: 1920, height: 1080 }
  );
  const input = { camera, crop: { zoom: 2, panX: 0.25, panY: -0.5 }, renderer: 'gpu' as const };
  const output = (index: number, complete = true) => {
    const record = records[index];
    if (!record) throw new Error('Expected admitted request');
    const lease = record.input.acquire(record.input.size, backend);
    const completed = {
      canvas: lease.canvas,
      release: vi.fn(() => lease.release()),
    } satisfies GpuPreviewOutput;
    if (complete) record.resolve(completed);
    return completed;
  };
  return {
    owner,
    session,
    publish,
    target,
    getContext,
    context,
    host,
    media,
    source,
    backend,
    records,
    adapters,
    createRenderer,
    fail,
    input,
    output,
    maximumActive: () => maximumActive,
  };
}

it('publishes GPU output without Canvas and retains frontend ownership', async () => {
  const f = fixture(),
    time = f.media.currentTime,
    url = f.media.src;
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  const request = f.records[0]!.input;
  expect(request.media).toBe(f.media);
  expect(request.size).toEqual({ width: 120, height: 90 });
  expect(request.appearance).toMatchObject(f.input.crop);
  expect(request.fitMode).toBe('COVER');
  expect(request.mirrored).toBe(f.input.camera.mirrored);
  const completed = f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledWith(completed, expect.any(Function)));
  expect(drawReviewWebcam).not.toHaveBeenCalled();
  expect(f.getContext).not.toHaveBeenCalled();
  expect(completed.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(f.target.style.opacity).toBe('0');
  f.owner.dispose();
  expect(completed.release).not.toHaveBeenCalled();
  f.session.dispose();
  expect(completed.release).toHaveBeenCalledOnce();
  expect(f.media.currentTime).toBe(time);
  expect(f.media.src).toBe(url);
});

it.each(['unavailable', 'device-error'] as const)(
  'uses Canvas only when the actual GPU adapter permits fallback (%s)',
  async (reason) => {
    vi.stubGlobal('VideoFrame', class {});
    const backend = vi.fn<typeof createGpuPreviewRenderer>(async () => null);
    if (reason === 'device-error')
      backend.mockRejectedValue(new GpuPreviewDeviceError('device failed'));
    const adapter = createCameraCropGpuRenderer(backend);
    const f = fixture(() => adapter);
    f.owner.request(f.input);
    await vi.waitFor(() => expect(f.publish).toHaveBeenCalledWith(null, expect.any(Function)));
    expect(adapter.fallbackReason).toBe(reason === 'unavailable' ? 'unavailable' : 'device-failed');
    expect(f.context.clearRect).toHaveBeenCalledWith(0, 0, 120, 90);
    expect(drawReviewWebcam).toHaveBeenCalledOnce();
    expect(f.fail).not.toHaveBeenCalled();
    expect(f.target.style.opacity).toBe('1');
  }
);

it('keeps the legacy painter independent from the GPU factory', async () => {
  const f = fixture();
  f.owner.request({ ...f.input, renderer: 'legacy' });
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledWith(null, expect.any(Function)));
  expect(f.createRenderer).not.toHaveBeenCalled();
  expect(drawReviewWebcam).toHaveBeenCalledOnce();
  expect(f.fail).not.toHaveBeenCalled();
});

it('keeps the latest pending crop and waits for canceled work before rendering again', async () => {
  const f = fixture();
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  f.owner.request({ ...f.input, crop: { ...f.input.crop, panX: 0.5 } });
  f.owner.request({ ...f.input, crop: { ...f.input.crop, panX: 0.75 } });
  expect(f.records[0]!.input.signal.aborted).toBe(true);
  expect(f.records).toHaveLength(1);
  const stale = f.output(0);
  await vi.waitFor(() => expect(f.records).toHaveLength(2));
  expect(stale.release).toHaveBeenCalledOnce();
  expect(f.records[1]!.input.appearance.panX).toBe(0.75);
  expect(f.maximumActive()).toBe(1);
  const completed = f.output(1);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
  expect(f.publish.mock.calls[0]![0]).toBe(completed);
  expect(completed.release).not.toHaveBeenCalled();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
});

it.each(['cancel', 'seek', 'time', 'source', 'not-ready', 'unmount'] as const)(
  'releases a late GPU output without replacing accepted pixels after %s',
  async (reason) => {
    const f = fixture();
    f.owner.request(f.input);
    await vi.waitFor(() => expect(f.records).toHaveLength(1));
    const front = f.output(0);
    await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
    f.owner.request(f.input);
    await vi.waitFor(() => expect(f.records).toHaveLength(2));
    const late = f.output(1, false);
    if (reason === 'cancel') f.owner.cancel();
    if (reason === 'seek') f.source.seeking = true;
    if (reason === 'time') f.media.currentTime = 2;
    if (reason === 'source') f.media.src = 'blob:replacement';
    if (reason === 'not-ready') f.source.readyState = 1;
    if (reason === 'unmount') {
      f.owner.dispose();
      f.session.dispose();
    }
    f.records[1]!.resolve(late);
    await vi.waitFor(() => expect(late.release).toHaveBeenCalledOnce());
    expect(f.publish).toHaveBeenCalledOnce();
    if (reason !== 'unmount') {
      expect(front.release).not.toHaveBeenCalled();
      expect(front.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
    }
    expect(drawReviewWebcam).not.toHaveBeenCalled();
    expect(f.fail).not.toHaveBeenCalled();
  }
);

it('keeps unavailable source requests out of the GPU queue and accepts a later ready request', async () => {
  const f = fixture();
  f.source.seeking = true;
  f.owner.request(f.input);
  await Promise.resolve();
  expect(f.createRenderer).not.toHaveBeenCalled();
  f.source.seeking = false;
  f.source.readyState = 1;
  f.owner.request(f.input);
  await Promise.resolve();
  expect(f.createRenderer).not.toHaveBeenCalled();
  f.source.readyState = 2;
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
});

it('reports ordinary errors without a false fallback and creates a fresh renderer on explicit retry', async () => {
  const f = fixture();
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  f.records[0]!.reject(new Error('invalid crop'));
  await vi.waitFor(() => expect(f.fail).toHaveBeenCalledOnce());
  expect(f.publish).not.toHaveBeenCalled();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
  f.owner.reset();
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(2));
  expect(f.createRenderer).toHaveBeenCalledTimes(2);
  expect(f.adapters[0]!.dispose).toHaveBeenCalledOnce();
  const completed = f.output(1);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledWith(completed, expect.any(Function)));
  expect(f.fail).toHaveBeenCalledOnce();
});

it('silently retires an ordinary rejection from canceled work', async () => {
  const f = fixture();
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  f.owner.cancel();
  f.records[0]!.reject(new Error('canceled input'));
  await Promise.resolve();
  await Promise.resolve();
  expect(f.fail).not.toHaveBeenCalled();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
});

it('preserves the accepted GPU front when the adapter skips a stale request', async () => {
  const f = fixture();
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  const front = f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
  f.owner.request(f.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(2));
  f.records[1]!.resolve(false);
  await Promise.resolve();
  await Promise.resolve();
  expect(f.publish).toHaveBeenCalledOnce();
  expect(front.release).not.toHaveBeenCalled();
  expect(front.canvas.hasAttribute('data-preview-inspector-canvas')).toBe(true);
  expect(drawReviewWebcam).not.toHaveBeenCalled();
});

it('borrows canonical pixels independently from HTML readiness and clock', async () => {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const f = fixture();
  f.source.readyState = 0;
  f.source.seeking = true;
  f.media.currentTime = 99;
  const source = {
    sourceWidth: 800,
    sourceHeight: 400,
    orientation: { rotation: 90, flip: true },
    draw: vi.fn(),
    toVideoFrame: vi.fn(),
  };
  const release = vi.fn();
  sources.acquire.mockResolvedValue({
    bindings: new Map([
      [
        'camera-crop',
        { source, target: 0.5, timestamp: 0.3, nextTimestamp: 0.7, url: 'blob:camera' },
      ],
    ]),
    release,
  });
  const input = {
    ...f.input,
    source: { url: 'blob:camera', assetId: f.input.camera.assetId, attempt: 0, time: 0.5 },
  };
  f.owner.request(input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  expect(f.records[0]!.input).toMatchObject({ source });
  expect(sources.acquire).toHaveBeenCalledWith(
    [{ id: 'camera-crop', url: 'blob:camera', time: 0.5, holdSourceEnd: true }],
    expect.any(AbortSignal),
    { discontinuity: true }
  );
  expect(release).not.toHaveBeenCalled();
  f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
  expect(release).toHaveBeenCalledOnce();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
});

function canonicalCamera(f: ReturnType<typeof fixture>) {
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoFrame', class {});
  const source = {
    sourceWidth: 800,
    sourceHeight: 400,
    orientation: { rotation: 90 as const, flip: true },
    draw: vi.fn(),
    toVideoFrame: vi.fn(),
  };
  const release = vi.fn();
  sources.acquire.mockResolvedValue({
    bindings: new Map([
      [
        'camera-crop',
        { source, timestamp: 0.3, nextTimestamp: 0.7, target: 0.5, url: 'blob:camera' },
      ],
    ]),
    release,
  });
  const input = {
    ...f.input,
    source: { assetId: f.input.camera.assetId, attempt: 0, time: 0.5, url: 'blob:camera' },
  };
  return { input, source, release };
}

function compatibleCamera(c: ReturnType<typeof canonicalCamera>) {
  sources.acquire.mockResolvedValue(null);
  const lease = {
    bindings: new Map([
      [
        'camera-crop',
        {
          membership: 'packet-floor',
          source: c.source,
          timestamp: 0.3,
          target: 0.5,
          url: 'blob:camera',
        },
      ],
    ]),
    release: c.release,
  };
  compatible.acquire.mockResolvedValue(lease);
  return lease;
}

it.each(
  (['cancel', 'time', 'asset', 'attempt', 'unmount', 'reject'] as const).flatMap((mode) =>
    (['canonical', 'compatible'] as const).map((route) => ({ mode, route }))
  )
)('keeps the borrowed $route source through delayed $mode settlement', async ({ mode, route }) => {
  let current = { assetId: 'project-asset:camera', attempt: 0, time: 0.5, url: 'blob:camera' };
  const f = fixture(undefined, { readSource: () => current });
  const c = canonicalCamera(f);
  if (route === 'compatible') compatibleCamera(c);
  current = c.input.source;
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  const late = f.output(0, false);
  if (mode === 'cancel') f.owner.cancel();
  if (mode === 'time') current = { ...current, time: 2 };
  if (mode === 'asset') current = { ...current, assetId: 'replacement' };
  if (mode === 'attempt') current = { ...current, attempt: 1 };
  if (mode === 'unmount') f.owner.dispose();
  expect(c.release).not.toHaveBeenCalled();
  if (mode === 'reject') f.records[0]!.reject(new Error('invalid crop'));
  else f.records[0]!.resolve(late);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(f.publish).not.toHaveBeenCalled();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
  if (mode !== 'reject') expect(late.release).toHaveBeenCalledOnce();
  else expect(f.fail).toHaveBeenCalledOnce();
});

it('releases a late acquisition without starting an obsolete GPU render', async () => {
  const f = fixture();
  const c = canonicalCamera(f);
  const lease = {
    bindings: new Map([
      [
        'camera-crop',
        { source: c.source, timestamp: 0.3, nextTimestamp: 0.7, target: 0.5, url: 'blob:camera' },
      ],
    ]),
    release: c.release,
  };
  const gate = Promise.withResolvers<typeof lease>();
  sources.acquire.mockReturnValueOnce(gate.promise);
  f.owner.request(c.input);
  await vi.waitFor(() => expect(sources.acquire).toHaveBeenCalledOnce());
  f.owner.dispose();
  expect(c.release).not.toHaveBeenCalled();
  gate.resolve(lease);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(f.records).toHaveLength(0);
  expect(f.fail).not.toHaveBeenCalled();
});

it('retains the accepted front on decode failure and resets the source owner on retry', async () => {
  const f = fixture();
  const c = canonicalCamera(f);
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  const front = f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
  sources.acquire.mockRejectedValueOnce(new Error('decode failed'));
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.fail).toHaveBeenCalledOnce());
  expect(f.publish).toHaveBeenCalledOnce();
  expect(front.release).not.toHaveBeenCalled();
  expect(drawReviewWebcam).not.toHaveBeenCalled();
  expect(compatible.acquire).not.toHaveBeenCalled();
  f.owner.reset();
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(2));
  expect(sources.create).toHaveBeenCalledTimes(2);
  expect(sources.dispose).toHaveBeenCalledOnce();
  f.output(1);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledTimes(2));
});

it.each(
  (['unavailable', 'device-failed', 'legacy', 'draw-failed'] as const).flatMap((mode) =>
    (['canonical', 'compatible'] as const).map((route) => ({ mode, route }))
  )
)('uses the same normalized $route source for Canvas after $mode', async ({ mode, route }) => {
  const backend = vi.fn<typeof createGpuPreviewRenderer>(async () => null);
  if (mode === 'device-failed') backend.mockRejectedValue(new GpuPreviewDeviceError('lost'));
  const f = fixture(() => createCameraCropGpuRenderer(backend));
  const c = canonicalCamera(f);
  class Frame {
    format = 'RGBA';
    codedWidth = 400;
    codedHeight = 800;
    displayWidth = 400;
    displayHeight = 800;
    timestamp = 300000;
    duration = 400000;
    visibleRect = { x: 0, y: 0, width: 400, height: 800 };
    colorSpace = { matrix: 'bt709', primaries: 'bt709', transfer: 'bt709', fullRange: false };
    close = vi.fn();
  }
  vi.stubGlobal('VideoFrame', Frame);
  const frame = new Frame();
  c.source.toVideoFrame.mockReturnValue(frame);
  if (route === 'compatible') compatibleCamera(c);
  const normalize = normalization.prepareDecodedVideoSample;
  const sampleDraw = vi.fn();
  vi.spyOn(normalization, 'prepareDecodedVideoSample').mockImplementation(
    async (sample, signal) => {
      expect(sample.timestamp).toBe(0.3);
      expect(sample.rotation).toBe(90);
      expect(sample.flip).toBe(true);
      expect(sample.colorSpace).toMatchObject(frame.colorSpace);
      const prepared = await normalize(sample, signal);
      vi.spyOn(prepared, 'draw').mockImplementation(sampleDraw);
      return prepared;
    }
  );
  vi.mocked(drawReviewWebcam).mockImplementationOnce(
    (context, _output, _camera, _placement, size, drawable) => {
      expect(size).toEqual({ width: 800, height: 400 });
      drawable.draw(context, 0, 0, 120, 90);
      if (mode === 'draw-failed') throw new Error('draw failed');
    }
  );
  f.owner.request({ ...c.input, renderer: mode === 'legacy' ? 'legacy' : 'gpu' });
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(normalization.prepareDecodedVideoSample).toHaveBeenCalledOnce();
  expect(sampleDraw).toHaveBeenCalledOnce();
  expect(frame.close).toHaveBeenCalledOnce();
  expect(c.source.draw).not.toHaveBeenCalled();
  if (mode === 'draw-failed') {
    expect(f.fail).toHaveBeenCalledOnce();
    expect(f.publish).not.toHaveBeenCalled();
  } else expect(f.publish).toHaveBeenCalledWith(null, expect.any(Function));
});

it('borrows verified HTML pixels without witness readiness, decoder API, clock or error authority', async () => {
  const accept = vi.fn();
  const f = fixture(undefined, { accept });
  const c = canonicalCamera(f);
  vi.stubGlobal('VideoDecoder', undefined);
  const lease = {
    bindings: new Map([
      [
        'camera-crop',
        {
          membership: 'packet-floor',
          source: c.source,
          timestamp: 0.3,
          target: 0.5,
          url: 'blob:camera',
        },
      ],
    ]),
    release: c.release,
  };
  compatible.acquire.mockResolvedValueOnce(lease);
  f.source.readyState = 0;
  f.source.seeking = true;
  Object.defineProperty(f.media, 'error', { value: { code: 4 } });
  f.owner.request(c.input);
  await vi.waitFor(() => expect(compatible.acquire).toHaveBeenCalledOnce());
  expect(compatible.acquire).toHaveBeenCalledWith(
    [{ id: 'camera-crop', url: 'blob:camera', time: 0.5, holdSourceEnd: true }],
    expect.any(AbortSignal)
  );
  expect(f.records[0]!.input.source).toBe(c.source);
  f.media.currentTime = 99;
  expect(c.release).not.toHaveBeenCalled();
  f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
  expect(accept.mock.calls[0]![1]).not.toHaveProperty('nextTimestamp');
  expect(c.release).toHaveBeenCalledOnce();
  expect(f.fail).not.toHaveBeenCalled();
});

it('releases late canceled compatible leases and retries failed acquisition', async () => {
  const f = fixture();
  const c = canonicalCamera(f);
  const lease = compatibleCamera(c);
  const gate = Promise.withResolvers<typeof lease>();
  compatible.acquire.mockReturnValueOnce(gate.promise);
  f.owner.request(c.input);
  await vi.waitFor(() => expect(compatible.acquire).toHaveBeenCalledOnce());
  f.owner.cancel();
  gate.resolve(lease);
  await vi.waitFor(() => expect(c.release).toHaveBeenCalledOnce());
  expect(f.records).toHaveLength(0);
  expect(f.fail).not.toHaveBeenCalled();
  compatible.acquire.mockRejectedValueOnce(new Error('compatibility failed'));
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.fail).toHaveBeenCalledOnce());
  f.owner.reset();
  f.owner.request(c.input);
  await vi.waitFor(() => expect(f.records).toHaveLength(1));
  expect(compatible.dispose).toHaveBeenCalledOnce();
  f.output(0);
  await vi.waitFor(() => expect(f.publish).toHaveBeenCalledOnce());
});
