import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ALL_FORMATS, BlobSource, Input, InputVideoTrack } from 'mediabunny';
import { createReviewPresentationMedia } from './presentation-media';
import { createReviewExportDiagnostics } from './export-diagnostics';
import type { QuickEditPresentationSettings } from '../../features/video/review/advanced/presentation';

const io = vi.hoisted(() => ({ getSample: vi.fn() }));
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
function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
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
  expect(io.getSample.mock.calls.map(([time]) => time)).toEqual([
    1,
    (2 * fixture.resolution - 1) / fixture.resolution,
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
