import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ALL_FORMATS, BlobSource, Input, InputVideoTrack, VideoSample } from 'mediabunny';
import * as sources from '../video/preview-source';
import * as normalization from '../../features/video/composition/draw/decoded-sample';
import type { PreviewSourceProvider } from '../video/preview-source';
import { createReviewPresentationMedia } from './presentation-media';
const canonicalFactory = sources.createPreviewSourceProvider;
import { createReviewExportDiagnostics, reviewExportPhase } from './export-diagnostics';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';

const io = vi.hoisted(() => ({
  getSample: vi.fn(),
  nextTimestamp: undefined as number | undefined,
  leading: undefined as number | undefined,
}));
vi.mock('mediabunny', async (original) => ({
  ...(await original<typeof import('mediabunny')>()),
  VideoSampleSink: class {
    getSample = io.getSample;
  },
}));
const framing = { fit: 'contain' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };
const imageSlot = {
  mode: 'image' as const,
  image: { ...framing, assetId: 'image', width: 32, height: 16, duration: 1 },
};
const output = { width: 160, height: 90 };
const imageMapping = { kind: 'image' as const, assetId: 'image' };
function decoded(time: number, width = 160, height = 90) {
  return {
    format: 'I420',
    timestamp: time,
    duration: 1 / 30,
    displayWidth: width,
    displayHeight: height,
    draw: vi.fn(),
    close: vi.fn(),
  };
}
/** Native clone boundary for the controlled provider; ordinary tests retain their observable sample view. */
class NativeFrame {
  format: VideoPixelFormat = 'RGBA';
  codedWidth: number;
  codedHeight: number;
  displayWidth: number;
  displayHeight: number;
  timestamp: number;
  duration: number | null;
  colorSpace: VideoColorSpaceInit = {
    matrix: 'bt709',
    primaries: 'bt709',
    transfer: 'bt709',
    fullRange: false,
  };
  model: ReturnType<typeof decoded> | undefined;
  close = vi.fn();
  constructor(
    data: ReturnType<typeof decoded> | NativeFrame | AllowSharedBufferSource,
    init?: VideoFrameBufferInit
  ) {
    if (data instanceof NativeFrame) {
      this.codedWidth = data.codedWidth;
      this.codedHeight = data.codedHeight;
      this.displayWidth = data.displayWidth;
      this.displayHeight = data.displayHeight;
      this.timestamp = init?.timestamp ?? data.timestamp;
      this.duration = init?.duration ?? data.duration;
      this.model = data.model;
    } else if (init) {
      this.codedWidth = init.codedWidth;
      this.codedHeight = init.codedHeight;
      this.displayWidth = init.displayWidth ?? init.codedWidth;
      this.displayHeight = init.displayHeight ?? init.codedHeight;
      this.timestamp = init.timestamp;
      this.duration = init.duration ?? null;
    } else if ('timestamp' in data) {
      this.codedWidth = this.displayWidth = data.displayWidth;
      this.codedHeight = this.displayHeight = data.displayHeight;
      this.timestamp = Math.round(data.timestamp * 1e6);
      this.duration = Math.round(data.duration * 1e6);
      this.model = data;
    } else throw new Error('Invalid controlled native frame');
  }
  clone() {
    return new NativeFrame(this);
  }
}
let acquire: ReturnType<typeof vi.fn<PreviewSourceProvider['acquire']>>;
let retire: ReturnType<typeof vi.fn<() => void>>;
let sourceReleases: Array<ReturnType<typeof vi.fn<() => void>>>;
function context() {
  return {
    fillStyle: '',
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
}
async function videoFixture() {
  const blob = new Blob([await readFile('tooling/test/e2e/fixtures/review-avc-aac.mp4')], {
    type: 'video/mp4',
  });
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const width = await track.getDisplayWidth(),
      height = await track.getDisplayHeight();
    const duration = await track.computeDuration();
    const resolution = await track.getTimeResolution();
    const slot: Extract<QuickEditPresentationSettings['intro'], { mode: 'video' }> = {
      mode: 'video',
      video: {
        ...framing,
        assetId: 'video',
        source: { width, height, duration, size: blob.size, mimeType: blob.type },
        trim: { start: 1, end: 2 },
        audio: { muted: false, gain: 1 },
      },
    };
    return { blob, slot, resolution, width, height };
  } finally {
    input.dispose();
  }
}
const mapping = (start = 1, end = 1.04, holdLast = false) => ({
  kind: 'video' as const,
  assetId: 'video',
  range: { start, end },
  holdLast,
});

it('retains controlled bookend errors and their decoder diagnosis through composition', async () => {
  const fixture = await videoFixture();
  const cause = new Error('private decoder details');
  io.getSample.mockRejectedValue(cause);
  const owner = await createReviewPresentationMedia({
    slot: fixture.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => fixture.blob,
  });
  const summary = vi.fn();
  const attempt = createReviewExportDiagnostics(
    { destination: 'download', route: 'presentation' },
    summary
  );
  const error = await attempt
    .phase('compose', () => owner.frame(mapping()))
    .catch((value: unknown) => value);
  expect(error).toMatchObject({
    stage: 'decode',
    cause: {
      code: 'decode',
      message: 'presentation-media:decode',
      cause: { stage: 'decode', cause },
    },
  });
  attempt.reportFailure(error);
  expect(summary).toHaveBeenCalledExactlyOnceWith(
    'export outcome=failed route=presentation destination=download stage=decode code=decode-failed'
  );
  await expect(owner.frame(mapping())).rejects.toMatchObject({ code: 'disposed' });
});
beforeEach(() => {
  io.getSample.mockReset();
  io.nextTimestamp = undefined;
  io.leading = undefined;
  vi.stubGlobal('VideoFrame', NativeFrame);
  retire = vi.fn();
  sourceReleases = [];
  acquire = vi.fn<PreviewSourceProvider['acquire']>(async (demands) => {
    const demand = demands[0]!;
    const queried =
      demand.endpoint === 'retained-end'
        ? (Math.ceil(demand.time * 30) - 1) / 30
        : io.leading !== undefined && demand.time < io.leading
          ? io.leading
          : demand.time;
    const sample = await io.getSample(queried);
    if (!sample) return null;
    let transferred = false;
    const release = vi.fn(() => {
      if (!transferred) sample.close();
    });
    sourceReleases.push(release);
    return {
      bindings: new Map([
        [
          demand.id,
          {
            source: {
              sourceWidth: sample.displayWidth,
              sourceHeight: sample.displayHeight,
              orientation: { rotation: sample.rotation ?? 0, flip: sample.flip ?? false },
              toVideoFrame: () => {
                transferred = true;
                return new NativeFrame(sample) as unknown as VideoFrame;
              },
              draw: sample.draw,
            },
            timestamp: sample.timestamp,
            nextTimestamp: io.nextTimestamp ?? sample.timestamp + 1 / 30,
            target: demand.time,
            url: demand.url,
            ...(io.leading !== undefined && demand.time < io.leading
              ? { sampleTime: io.leading }
              : {}),
            ...(demand.endpoint === 'retained-end' ? { heldAtRetainedEnd: true as const } : {}),
          },
        ],
      ]),
      release,
    };
  });
  vi.spyOn(sources, 'createPreviewSourceProvider').mockReturnValue({
    acquire,
    dispose: retire,
    retainSources: vi.fn(),
  });
  vi.spyOn(normalization, 'prepareDecodedVideoSample').mockImplementation(
    async (sample, signal) => {
      const native = sample.toVideoFrame() as unknown as NativeFrame;
      const model = native.model;
      sample.close();
      native.close();
      signal.throwIfAborted();
      if (!model) throw new Error('Missing controlled sample view');
      return model as unknown as VideoSample;
    }
  );
  vi.spyOn(InputVideoTrack.prototype, 'canDecode').mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('draws an admitted image and releases its bitmap exactly once on disposal', async () => {
  const bitmap = { width: 32, height: 16, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap)
  );
  const owner = await createReviewPresentationMedia({
    slot: imageSlot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => new Blob(['png'], { type: 'image/png' }),
  });
  expect(owner.audioTrack).toBeNull();
  const frame = await owner.frame(imageMapping);
  const capture = snapshotCanvas();
  capture.capture.mockImplementationOnce(() => {
    throw new Error('private transfer details');
  });
  expect(() => frame.snapshot()).toThrow('presentation-media:decode');
  const target = context();
  frame.draw(target as unknown as CanvasRenderingContext2D);
  expect(target.drawImage).toHaveBeenCalledWith(bitmap, 0, 5, 160, 80);
  await expect(owner.frame(imageMapping)).rejects.toMatchObject({ code: 'busy' });
  frame.release();
  frame.release();
  expect(bitmap.close).not.toHaveBeenCalled();
  const second = await owner.frame(imageMapping);
  owner.dispose();
  owner.dispose();
  second.release();
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(() => second.draw(target as unknown as CanvasRenderingContext2D)).toThrow('disposed');
});

it.each(['mismatch', 'abort'] as const)('closes a resolved bitmap after %s', async (mode) => {
  const controller = new AbortController();
  const bitmap = { width: 64, height: 16, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      if (mode === 'abort') controller.abort();
      return bitmap;
    })
  );
  await expect(
    createReviewPresentationMedia({
      slot: imageSlot,
      output,
      signal: controller.signal,
      readAsset: async () => new Blob(['png'], { type: 'image/png' }),
    })
  ).rejects.toThrow();
  expect(bitmap.close).toHaveBeenCalledOnce();
});

it('does not decode external SVG as an admitted raster or read after pre-cancellation', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  const readAsset = vi.fn(async () => new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  await expect(
    createReviewPresentationMedia({
      slot: imageSlot,
      output,
      signal: new AbortController().signal,
      readAsset,
    })
  ).rejects.toMatchObject({ code: 'metadata' });
  expect(decode).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  readAsset.mockClear();
  await expect(
    createReviewPresentationMedia({ slot: imageSlot, output, signal: controller.signal, readAsset })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(readAsset).not.toHaveBeenCalled();
});

it('uses real video metadata, borrows audio, and holds the final track tick without decoding the clip', async () => {
  const fixture = await videoFixture();
  const samples: ReturnType<typeof decoded>[] = [];
  io.getSample.mockImplementation(async (time: number) => {
    const value = decoded(Math.floor(time * 30) / 30, fixture.width, fixture.height);
    samples.push(value);
    return value;
  });
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const owner = await createReviewPresentationMedia({
    slot: fixture.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => fixture.blob,
  });
  expect(owner.audioTrack?.codec).toBe('aac');
  const first = await owner.frame(mapping());
  first.release();
  const last = await owner.frame(mapping(2, 2, true));
  expect(acquire.mock.calls.map(([demands]) => demands[0])).toEqual([
    { id: 'bookend', url: expect.any(String), time: 1, rangeEnd: 2 },
    { id: 'bookend', url: expect.any(String), time: 2, rangeEnd: 2, endpoint: 'retained-end' },
  ]);
  const target = context();
  last.draw(target as unknown as CanvasRenderingContext2D);
  expect(samples[1]!.draw).toHaveBeenCalledWith(target, 0, 0, 160, 90);
  owner.dispose();
  last.release();
  expect(samples.every((sample) => sample.close.mock.calls.length === 1)).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
});

it.each(['duration', 'dimensions', 'size', 'decoder'] as const)(
  'rejects inconsistent admitted video %s and closes input',
  async (kind) => {
    const fixture = await videoFixture();
    if (kind === 'duration') fixture.slot.video.source.duration += 1;
    if (kind === 'dimensions') fixture.slot.video.source.width += 1;
    if (kind === 'size') fixture.slot.video.source.size += 1;
    if (kind === 'decoder') vi.mocked(InputVideoTrack.prototype.canDecode).mockResolvedValue(false);
    const dispose = vi.spyOn(Input.prototype, 'dispose');
    await expect(
      createReviewPresentationMedia({
        slot: fixture.slot,
        output,
        signal: new AbortController().signal,
        readAsset: async () => fixture.blob,
      })
    ).rejects.toMatchObject({ code: 'metadata' });
    expect(dispose).toHaveBeenCalledTimes(kind === 'size' ? 0 : 1);
    expect(io.getSample).not.toHaveBeenCalled();
  }
);

it.each(['missing', 'failed', 'stale', 'dimensions'] as const)(
  'rejects %s decoded frames and releases acquired storage',
  async (kind) => {
    const fixture = await videoFixture();
    const sample = decoded(
      kind === 'stale' ? 0 : 1,
      kind === 'dimensions' ? 1 : fixture.width,
      fixture.height
    );
    io.getSample.mockImplementation(async () => {
      if (kind === 'failed') throw new Error('private decoder details');
      return kind === 'missing' ? null : sample;
    });
    const dispose = vi.spyOn(Input.prototype, 'dispose');
    const owner = await createReviewPresentationMedia({
      slot: fixture.slot,
      output,
      signal: new AbortController().signal,
      readAsset: async () => fixture.blob,
    });
    await expect(owner.frame(mapping())).rejects.toMatchObject({
      code: ['stale', 'dimensions'].includes(kind) ? 'metadata' : 'decode',
    });
    expect(sample.close).toHaveBeenCalledTimes(['stale', 'dimensions'].includes(kind) ? 1 : 0);
    expect(dispose).toHaveBeenCalledOnce();
    await expect(owner.frame(mapping())).rejects.toMatchObject({ code: 'disposed' });
    owner.dispose();
  }
);

it.each(['abort', 'dispose'] as const)(
  'rejects concurrent acquisition and closes a sample arriving after %s',
  async (mode) => {
    const fixture = await videoFixture();
    const controller = new AbortController();
    let complete!: (value: ReturnType<typeof decoded>) => void;
    io.getSample.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      })
    );
    const owner = await createReviewPresentationMedia({
      slot: fixture.slot,
      output,
      signal: controller.signal,
      readAsset: async () => fixture.blob,
    });
    const pending = owner.frame(mapping());
    await expect(owner.frame(mapping())).rejects.toMatchObject({ code: 'busy' });
    if (mode === 'abort') controller.abort();
    else owner.dispose();
    const sample = decoded(1, fixture.width, fixture.height);
    complete(sample);
    await expect(pending).rejects.toMatchObject(
      mode === 'abort' ? { name: 'AbortError' } : { code: 'disposed' }
    );
    expect(sample.close).toHaveBeenCalledOnce();
  }
);

it('refuses foreign mappings and a trim too short to contain its final media tick', async () => {
  const fixture = await videoFixture();
  fixture.slot.video.trim = { start: 1.1 / fixture.resolution, end: 1.2 / fixture.resolution };
  const owner = await createReviewPresentationMedia({
    slot: fixture.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => fixture.blob,
  });
  await expect(owner.frame(imageMapping)).rejects.toMatchObject({ code: 'mapping' });
  const end = fixture.slot.video.trim.end;
  await expect(owner.frame(mapping(end, end, true))).rejects.toMatchObject({ code: 'mapping' });
  expect(io.getSample).not.toHaveBeenCalled();
  owner.dispose();
});

it('reports a missing stored asset without opening a decoder', async () => {
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  await expect(
    createReviewPresentationMedia({
      slot: imageSlot,
      output,
      signal: new AbortController().signal,
      readAsset: async () => null,
    })
  ).rejects.toMatchObject({ code: 'asset-missing' });
  expect(dispose).not.toHaveBeenCalled();
});

it('releases the active video lease immediately when cancelled', async () => {
  const fixture = await videoFixture();
  const sample = decoded(1, fixture.width, fixture.height);
  io.getSample.mockResolvedValue(sample);
  const controller = new AbortController();
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  const owner = await createReviewPresentationMedia({
    slot: fixture.slot,
    output,
    signal: controller.signal,
    readAsset: async () => fixture.blob,
  });
  const frame = await owner.frame(mapping());
  controller.abort();
  expect(sample.close).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
  frame.release();
  owner.dispose();
  expect(sample.close).toHaveBeenCalledOnce();
});

class SnapshotBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
function snapshotCanvas() {
  const canvases: TemporaryCanvas[] = [];
  const transferred: SnapshotBitmap[] = [];
  const capture = vi.fn((width: number, height: number) => {
    const bitmap = new SnapshotBitmap(width, height);
    transferred.push(bitmap);
    return bitmap;
  });
  class TemporaryCanvas {
    readonly context = { drawImage: vi.fn() };
    constructor(
      public width: number,
      public height: number
    ) {
      canvases.push(this);
    }
    getContext = vi.fn(() => this.context);
    transferToImageBitmap() {
      return capture(this.width, this.height);
    }
  }
  vi.stubGlobal('OffscreenCanvas', TemporaryCanvas);
  return { canvases, transferred, capture };
}
async function snapshotImage(controller = new AbortController()) {
  const source = new SnapshotBitmap(32, 16);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => source)
  );
  const owner = await createReviewPresentationMedia({
    slot: imageSlot,
    output,
    signal: controller.signal,
    readAsset: async () => new Blob(['png'], { type: 'image/png' }),
  });
  return { owner, source, frame: await owner.frame(imageMapping) };
}

it('detaches only admitted source pixels synchronously without consuming the image lease', async () => {
  const f = snapshotCanvas();
  const { owner, source, frame } = await snapshotImage();
  const bitmap = frame.snapshot();
  expect(bitmap).toBe(f.transferred[0]);
  expect(bitmap).not.toBeInstanceOf(Promise);
  expect(f.capture).toHaveBeenCalledExactlyOnceWith(32, 16);
  expect(f.canvases[0]!.context.drawImage).toHaveBeenCalledExactlyOnceWith(source, 0, 0, 32, 16);
  expect(f.canvases[0]).toMatchObject({ width: 0, height: 0 });
  expect(source.close).not.toHaveBeenCalled();
  await expect(owner.frame(imageMapping)).rejects.toMatchObject({ code: 'busy' });
  frame.release();
  owner.dispose();
  expect(source.close).toHaveBeenCalledOnce();
  expect(f.transferred[0]!.close).not.toHaveBeenCalled();
  bitmap.close();
  expect(f.transferred[0]!.close).toHaveBeenCalledOnce();
});

it('delegates source display size and rotation normalization to the retained video sample draw', async () => {
  const f = snapshotCanvas();
  const fixture = await videoFixture();
  const sample = { ...decoded(1, fixture.width, fixture.height), rotation: 90, flip: true };
  io.getSample.mockResolvedValue(sample);
  const owner = await createReviewPresentationMedia({
    slot: fixture.slot,
    output: { width: 333, height: 777 },
    signal: new AbortController().signal,
    readAsset: async () => fixture.blob,
  });
  const frame = await owner.frame(mapping(), {
    ...fixture.slot,
    video: {
      ...fixture.slot.video,
      fit: 'cover',
      fillColor: '#ff0000ff',
      crop: { panX: 1, panY: -1 },
    },
  });
  const bitmap = frame.snapshot();
  expect(sample.draw).toHaveBeenCalledExactlyOnceWith(
    f.canvases[0]!.context,
    0,
    0,
    fixture.width,
    fixture.height
  );
  expect(f.canvases[0]!.context.drawImage).not.toHaveBeenCalled();
  expect(f.capture).toHaveBeenCalledExactlyOnceWith(fixture.width, fixture.height);
  expect(sample.close).not.toHaveBeenCalled();
  frame.release();
  owner.dispose();
  expect(sample.close).toHaveBeenCalledOnce();
  expect(f.transferred[0]!.close).not.toHaveBeenCalled();
  bitmap.close();
});

it.each(['release', 'dispose', 'abort'] as const)(
  'refuses snapshot after %s without allocating',
  async (mode) => {
    const f = snapshotCanvas();
    const controller = new AbortController();
    const { owner, frame } = await snapshotImage(controller);
    if (mode === 'release') frame.release();
    else if (mode === 'dispose') owner.dispose();
    else controller.abort();
    expect(() => frame.snapshot()).toThrow(mode === 'abort' ? 'aborted' : 'disposed');
    expect(f.canvases).toHaveLength(0);
    owner.dispose();
  }
);

it.each(['release', 'dispose', 'abort'] as const)(
  'closes detached pixels if %s occurs during transfer',
  async (mode) => {
    const f = snapshotCanvas();
    const controller = new AbortController();
    const { owner, source, frame } = await snapshotImage(controller);
    const detached = new SnapshotBitmap(32, 16);
    f.capture.mockImplementation(() => {
      if (mode === 'release') frame.release();
      else if (mode === 'dispose') owner.dispose();
      else controller.abort();
      return detached;
    });
    expect(() => frame.snapshot()).toThrow(mode === 'abort' ? 'aborted' : 'disposed');
    expect(detached.close).toHaveBeenCalledOnce();
    expect(f.canvases[0]).toMatchObject({ width: 0, height: 0 });
    owner.dispose();
    expect(source.close).toHaveBeenCalledOnce();
  }
);

it('keeps the original lease usable after a fixed snapshot-only transfer failure', async () => {
  const f = snapshotCanvas();
  const { owner, source, frame } = await snapshotImage();
  f.capture.mockImplementationOnce(() => {
    throw new Error('private transfer details');
  });
  expect(() => frame.snapshot()).toThrow('presentation-media:decode');
  expect(source.close).not.toHaveBeenCalled();
  expect(f.canvases[0]).toMatchObject({ width: 0, height: 0 });
  const retry = frame.snapshot();
  expect(retry).toBe(f.transferred[0]);
  frame.release();
  owner.dispose();
  retry.close();
});

it('reports a fixed snapshot failure when OffscreenCanvas is unavailable without retiring the lease', async () => {
  vi.stubGlobal('OffscreenCanvas', undefined);
  const { owner, source, frame } = await snapshotImage();
  expect(() => frame.snapshot()).toThrow('presentation-media:decode');
  expect(source.close).not.toHaveBeenCalled();
  frame.release();
  owner.dispose();
  expect(source.close).toHaveBeenCalledOnce();
});

it('keeps a VFR source interval beyond the nominal sample duration', async () => {
  const f = await videoFixture();
  const sample = { ...decoded(0.9, f.width, f.height), duration: 0.1 };
  io.nextTimestamp = 1.2;
  io.getSample.mockResolvedValue(sample);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  try {
    const frame = await owner.frame(mapping(1.02, 1.04));
    frame.draw(context() as unknown as CanvasRenderingContext2D);
    expect(sample.draw).toHaveBeenCalled();
    frame.release();
  } finally {
    owner.dispose();
  }
});

it('admits a bounded later first PTS without changing the requested source origin', async () => {
  const f = await videoFixture();
  f.slot.video.trim.start = 0;
  const sample = decoded(1 / 60, f.width, f.height);
  io.leading = 1 / 60;
  io.getSample.mockImplementation(async (time: number) => (time < 1 / 60 ? null : sample));
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  try {
    const frame = await owner.frame(mapping(0, 0.01));
    frame.draw(context() as unknown as CanvasRenderingContext2D);
    expect(sample.draw).toHaveBeenCalled();
    frame.release();
  } finally {
    owner.dispose();
  }
});

it('holds the retained interior end using actual source interval coverage', async () => {
  const f = await videoFixture();
  f.slot.video.trim = { start: 0, end: 1.2 };
  const sample = { ...decoded(0.9, f.width, f.height), duration: 0.1 };
  io.nextTimestamp = 1.2;
  io.getSample.mockResolvedValue(sample);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  try {
    const frame = await owner.frame(mapping(1.2, 1.2, true));
    frame.draw(context() as unknown as CanvasRenderingContext2D);
    expect(sample.draw).toHaveBeenCalled();
    frame.release();
  } finally {
    owner.dispose();
  }
});

function canonicalStream(
  f: Awaited<ReturnType<typeof videoFixture>>,
  timestamps: readonly number[],
  leading?: number,
  rotated = false
) {
  vi.mocked(normalization.prepareDecodedVideoSample).mockRestore();
  const canvasContextType = function CanvasContext() {};
  Object.defineProperty(canvasContextType, Symbol.hasInstance, {
    value: (value: unknown) => typeof value === 'object' && value !== null && 'drawImage' in value,
  });
  vi.stubGlobal('CanvasRenderingContext2D', canvasContextType);
  const opened = vi.fn(),
    closed = vi.fn();
  const selected: Array<{ timestamp: number; nextTimestamp: number; target: number }> = [];
  vi.mocked(sources.createPreviewSourceProvider).mockImplementation(() => {
    const provider = canonicalFactory({
      open: async () => {
        opened();
        return {
          end: f.slot.video.source.duration,
          ...(leading === undefined ? {} : { leadingSampleTime: leading }),
          async *samples(start) {
            const first = Math.max(
              0,
              timestamps.findLastIndex((time) => time <= start)
            );
            for (const timestamp of timestamps.slice(first)) {
              const width = rotated ? f.height : f.width,
                height = rotated ? f.width : f.height;
              yield new VideoSample(new Uint8Array(width * height * 4), {
                format: 'RGBA',
                codedWidth: width,
                codedHeight: height,
                timestamp,
                duration: 0.1,
                ...(rotated ? { rotation: 90, flip: true } : {}),
              });
            }
          },
          dispose: closed,
        };
      },
    });
    const read = provider.acquire.bind(provider);
    vi.spyOn(provider, 'acquire').mockImplementation(async (...args) => {
      const lease = await read(...args);
      for (const binding of lease?.bindings.values() ?? [])
        selected.push({
          timestamp: binding.timestamp,
          nextTimestamp: binding.nextTimestamp,
          target: binding.target,
        });
      return lease;
    });
    return provider;
  });
  return { opened, closed, selected };
}

it('uses the real provider for VFR coverage, held revisits and serial requests', async () => {
  const f = await videoFixture();
  f.slot.video.trim = { start: 0, end: 2 };
  const stream = canonicalStream(f, [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1]);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  try {
    for (const [target, expected] of [
      [1.02, 0.9],
      [1.52, 1.5],
      [1.02, 0.9],
    ]) {
      const pending = owner.frame(mapping(target, target));
      await expect(owner.frame(mapping(target, target))).rejects.toMatchObject({ code: 'busy' });
      const frame = await pending;
      const canvas = context();
      frame.draw(canvas as unknown as CanvasRenderingContext2D);
      expect(canvas.drawImage.mock.calls[0]![0].timestamp).toBe(Math.round(expected! * 1e6));
      expect(owner.audioTrack?.codec).toBe('aac');
      frame.release();
    }
    const frame = await owner.frame(mapping(1.2, 1.2, true), {
      ...f.slot,
      video: { ...f.slot.video, trim: { start: 0, end: 1.2 } },
    });
    frame.release();
    expect(stream.selected.map((binding) => binding.timestamp)).toEqual([0.9, 1.5, 0.9, 0.9]);
    expect(stream.selected.map((binding) => binding.target)).toEqual([1.02, 1.52, 1.02, 1.2]);
    expect(stream.selected[0]!.nextTimestamp).toBe(1.2);
    expect(stream.opened).toHaveBeenCalledOnce();
    expect(stream.closed).not.toHaveBeenCalled();
  } finally {
    owner.dispose();
  }
  expect(stream.closed).toHaveBeenCalledOnce();
});

it('uses real leading admission while preserving the requested origin', async () => {
  const f = await videoFixture();
  f.slot.video.trim = { start: 0, end: 2 };
  const stream = canonicalStream(f, [1 / 60, 0.1, 0.3, 1], 1 / 60);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  const frame = await owner.frame(mapping(0, 0));
  frame.release();
  owner.dispose();
  expect(stream.selected[0]).toEqual({ timestamp: 1 / 60, nextTimestamp: 0.1, target: 0 });
});

it('holds a retained window contained in one source frame with a trim recipe override', async () => {
  const f = await videoFixture();
  const stream = canonicalStream(f, [0, 1, 1.1, 1.2, 1.5]);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  const placement = {
    ...f.slot,
    video: {
      ...f.slot.video,
      trim: { start: 1.033, end: 1.066 },
      fit: 'cover' as const,
      fillColor: '#ff0000ff',
      crop: { panX: 1, panY: -1 },
    },
  };
  const frame = await owner.frame(mapping(1.066, 1.066, true), placement);
  const canvas = context();
  frame.draw(canvas as unknown as CanvasRenderingContext2D);
  expect(canvas.fillStyle).toBe('#ff0000ff');
  expect(stream.selected[0]).toEqual({ timestamp: 1, nextTimestamp: 1.1, target: 1.066 });
  frame.release();
  owner.dispose();
});

it('uses real normalization and applies source rotation and flip once', async () => {
  const f = await videoFixture();
  canonicalStream(f, [0, 1, 1.3, 2], undefined, true);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  const frame = await owner.frame(mapping());
  const canvas = context();
  frame.draw(canvas as unknown as CanvasRenderingContext2D);
  expect(canvas.rotate).toHaveBeenCalledExactlyOnceWith(Math.PI / 2);
  expect(canvas.scale.mock.calls.filter(([x, y]) => x === -1 && y === 1)).toHaveLength(1);
  expect(canvas.drawImage).toHaveBeenCalledOnce();
  frame.release();
  owner.dispose();
});

it('keeps a pending normalization and its lease alive until disposal settles', async () => {
  const f = await videoFixture();
  io.getSample.mockResolvedValue(decoded(1, f.width, f.height));
  const began = Promise.withResolvers<VideoSample>(),
    finish = Promise.withResolvers<VideoSample>();
  vi.mocked(normalization.prepareDecodedVideoSample).mockImplementationOnce((sample) => {
    began.resolve(sample);
    return finish.promise;
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  const pending = owner.frame(mapping());
  const borrowed = await began.promise;
  const close = vi.spyOn(borrowed, 'close');
  owner.dispose();
  expect(close).not.toHaveBeenCalled();
  expect(sourceReleases[0]).not.toHaveBeenCalled();
  finish.resolve(borrowed);
  await expect(pending).rejects.toMatchObject({ code: 'disposed' });
  expect(close).toHaveBeenCalledOnce();
  expect(sourceReleases[0]).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
});

it('preserves real provider decoder causes through fixed media diagnostics', async () => {
  const f = await videoFixture();
  const cause = new Error('private decoder details');
  const controller = new AbortController();
  const closed = vi.fn();
  vi.mocked(sources.createPreviewSourceProvider).mockImplementation(() =>
    canonicalFactory({
      open: async () => ({
        end: f.slot.video.source.duration,
        samples: () => ({
          [Symbol.asyncIterator]() {
            return this;
          },
          next: () =>
            reviewExportPhase(controller.signal, 'decode', () => {
              throw cause;
            }),
        }),
        dispose: closed,
      }),
    })
  );
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: controller.signal,
    readAsset: async () => f.blob,
  });
  const summary = vi.fn();
  const attempt = createReviewExportDiagnostics(
    { destination: 'download', route: 'presentation' },
    summary
  );
  const error = await attempt
    .phase('compose', () => owner.frame(mapping()))
    .catch((value: unknown) => value);
  expect(error).toMatchObject({
    stage: 'decode',
    cause: { code: 'decode', message: 'presentation-media:decode' },
  });
  let current = error;
  const chain: unknown[] = [];
  while (current instanceof Error) {
    chain.push(current);
    current = current.cause;
  }
  expect(chain).toContain(cause);
  expect(chain).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ message: 'Preview source frame is unavailable.' }),
    ])
  );
  attempt.reportFailure(error);
  expect(summary).toHaveBeenCalledExactlyOnceWith(
    'export outcome=failed route=presentation destination=download stage=decode code=decode-failed'
  );
  expect(closed).toHaveBeenCalledOnce();
  await expect(owner.frame(mapping())).rejects.toMatchObject({ code: 'disposed' });
});

it('accepts the real provider rounding at an ordinary source boundary', async () => {
  const f = await videoFixture();
  f.slot.video.trim = { start: 0, end: 1 };
  const stream = canonicalStream(f, [0, 0.100001, 0.2, 0.3, 1]);
  const owner = await createReviewPresentationMedia({
    slot: f.slot,
    output,
    signal: new AbortController().signal,
    readAsset: async () => f.blob,
  });
  try {
    const frame = await owner.frame(mapping(0.1, 0.1));
    const canvas = context();
    frame.draw(canvas as unknown as CanvasRenderingContext2D);
    expect(stream.selected).toEqual([{ timestamp: 0.100001, nextTimestamp: 0.2, target: 0.1 }]);
    expect(canvas.drawImage.mock.calls[0]![0].timestamp).toBe(100001);
    expect(stream.closed).not.toHaveBeenCalled();
    frame.release();
    expect(owner.audioTrack?.codec).toBe('aac');
  } finally {
    owner.dispose();
  }
  expect(stream.closed).toHaveBeenCalledOnce();
});
