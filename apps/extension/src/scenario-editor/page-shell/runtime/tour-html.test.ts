import { beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createTourDocument,
  createTourImageSlide,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
import { tourPlayerLabels } from '../tour/labels';
const io = vi.hoisted(() => ({
  asset: vi.fn(),
  raster: vi.fn(),
  sink: vi.fn(),
  record: vi.fn(),
  capture: vi.fn(),
  retain: vi.fn(),
  captureAbort: vi.fn(),
  finish: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.asset,
  saveScenarioExportRecord: io.record,
}));
vi.mock('../../../composition/archive-transfer', async (original) => ({
  ...(await original<typeof import('../../../composition/archive-transfer')>()),
  createDirectFileSink: io.sink,
}));
vi.mock('./tour-html-images', () => ({ prepareTourRaster: io.raster }));
vi.mock('../../../composition/persistence/scenario/export-artifacts', () => ({
  createScenarioHtmlCapture: io.capture,
}));
import { prepareTourHtml, saveTourHtml } from './tour-html';
function fixture() {
  const project = createGuideProject('Export');
  const tour = createTourDocument();
  const slide = createTourImageSlide('first');
  slide.image = {
    assetId: 'image',
    width: 640,
    height: 360,
    alt: 'Screenshot',
    galleryAssetId: 'private-gallery',
    editDocumentId: null,
    source: { kind: 'import', filename: 'private-file.png' },
  };
  const voice = {
    assetId: 'audio',
    duration: 4,
    trimStart: 1,
    trimEnd: 3,
    gain: 0.5,
    transcript: 'Authored voice',
  };
  slide.narration = voice;
  slide.masks = [
    {
      id: 'private',
      kind: 'redact',
      color: '#000000',
      opacity: 1,
      rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      narration: { ...voice, trigger: 'activation' },
    },
  ];
  const other = structuredClone(slide);
  other.id = 'second';
  other.masks = [];
  tour.slides = [slide, other];
  tour.audioResources = [{ assetId: 'unused', name: 'unused', duration: 1 }];
  project.tour = tour;
  io.asset.mockImplementation(
    async (id: string) => new Blob([id], { type: id === 'image' ? 'image/png' : 'audio/wav' })
  );
  io.raster.mockResolvedValue({
    blob: new Blob(['sanitized'], { type: 'image/png' }),
    width: 320,
    height: 180,
  });
  return {
    project,
    options: { optimize: false, maxEdge: 1920, quality: 0.85 },
    labels: tourPlayerLabels(createTranslator('en')),
    signal: new AbortController().signal,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  io.finish.mockImplementation(async (ref) => ({ ref }));
  io.capture.mockImplementation(async () => {
    const chunks: Uint8Array[] = [];
    return {
      append: async (chunk: Uint8Array) => {
        chunks.push(new Uint8Array(chunk));
        io.retain(chunk);
      },
      abort: io.captureAbort,
      finalize: () =>
        io.finish({
          assetId: 'saved-html',
          createdAt: 1,
          sha256: null,
          mimeType: 'text/html;charset=utf-8',
          size: chunks.reduce((size, chunk) => size + chunk.length, 0),
          location: { kind: 'opfs', objectKey: 'objects/saved-html' },
        }),
    };
  });
});
it('uses the supplied read-only media authority without invoking export persistence', async () => {
  const args = fixture();
  const readAsset = vi.fn(
    async (id: string) => new Blob([id], { type: id === 'image' ? 'image/png' : 'audio/wav' })
  );
  const artifact = await prepareTourHtml({ ...args, readAsset });
  expect(artifact.blob.size).toBeGreaterThan(0);
  expect(readAsset.mock.calls.map(([id]) => id)).toEqual(['image', 'audio']);
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.sink).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
});
it('prepares unique media, sanitized shared pixels, object audio, and no capture metadata', async () => {
  const args = fixture();
  const artifact = await prepareTourHtml(args);
  const html = await artifact.blob.text();
  expect(io.asset.mock.calls.map(([id]) => id)).toEqual(['image', 'audio']);
  expect(io.raster).toHaveBeenCalledTimes(1);
  expect(io.raster.mock.calls[0]![1]).toHaveLength(1);
  expect(html.split(btoa('sanitized'))).toHaveLength(2);
  expect(html).not.toContain('private-gallery');
  expect(html).not.toContain('private-file');
  expect(html).not.toContain('unused');
  expect(html).toContain('data:audio/wav;base64,');
  expect(html).toContain('"trigger":"activation"');
  expect(html).toContain('"trimStart":1');
  expect(html).toContain('"kind":"highlight"');
  expect(html).not.toContain('"kind":"redact"');
  expect(args.project.tour!.slides[0]).toMatchObject({
    masks: [{ kind: 'redact' }],
    image: { width: 640 },
  });
});
it('rejects missing media, unreviewed targets, invalid options and cancellation', async () => {
  const args = fixture();
  io.asset.mockResolvedValue(null);
  await expect(prepareTourHtml(args)).rejects.toThrow('Missing');
  const controller = new AbortController();
  controller.abort();
  await expect(prepareTourHtml({ ...args, signal: controller.signal })).rejects.toThrow();
  await expect(
    prepareTourHtml({ ...args, options: { ...args.options, maxEdge: NaN } })
  ).rejects.toThrow();
  const slide = args.project.tour!.slides[0]!;
  if (slide.kind === 'image') slide.requiresTargetReview = true;
  await expect(prepareTourHtml(args)).rejects.toThrow('Incomplete');
});
it('streams precisely the prepared file; aborts write failure and records only after close', async () => {
  const artifact = await prepareTourHtml(fixture());
  const chunks: Uint8Array[] = [];
  const order: string[] = [];
  const abort = vi.fn();
  io.sink.mockResolvedValue({
    writable: new WritableStream({
      write: (chunk: Uint8Array) => {
        chunks.push(chunk);
      },
    }),
    close: async () => {
      order.push('close');
    },
    abort,
  });
  io.record.mockImplementation(async () => {
    order.push('record');
  });
  expect(await saveTourHtml(artifact, new AbortController().signal)).toBe('saved');
  expect(await new Blob(chunks.map((chunk) => new Uint8Array(chunk))).text()).toBe(
    await artifact.blob.text()
  );
  expect(order).toEqual(['close', 'record']);
  expect(io.retain.mock.calls.map(([chunk]) => chunk)).toEqual(chunks);
  expect(io.record).toHaveBeenCalledWith(
    expect.objectContaining({
      html: { mode: 'tour', ref: expect.objectContaining({ size: artifact.blob.size }) },
    })
  );
  io.record.mockClear();
  io.sink.mockResolvedValue({
    writable: new WritableStream({
      write: () => {
        throw new Error('disk');
      },
    }),
    close: vi.fn(),
    abort,
  });
  await expect(saveTourHtml(artifact, new AbortController().signal)).rejects.toThrow('disk');
  expect(abort).toHaveBeenCalledTimes(1);
  expect(io.record).not.toHaveBeenCalled();
});
it('preserves base64 across chunk boundaries and distinguishes history failure after commit', async () => {
  const args = fixture();
  const audio = new Uint8Array(96 * 1024 + 7).map((_, index) => index % 251);
  io.asset.mockImplementation(async (id: string) =>
    id === 'audio'
      ? new Blob([audio], { type: 'audio/wav' })
      : new Blob(['image'], { type: 'image/png' })
  );
  const artifact = await prepareTourHtml(args);
  const html = await artifact.blob.text();
  const encoded = html.match(/data:audio\/wav;base64,([A-Za-z0-9+/=]+)/)![1]!;
  expect(Uint8Array.from(atob(encoded), (value) => value.charCodeAt(0))).toEqual(audio);
  const abort = vi.fn();
  io.sink.mockResolvedValue({ writable: new WritableStream(), close: vi.fn(), abort });
  io.record.mockRejectedValue(new Error('history'));
  expect(await saveTourHtml(artifact, new AbortController().signal)).toBe('history-failed');
  expect(abort).not.toHaveBeenCalled();
});

it('shares baked redacted bytes with the stage and strips its private provenance', async () => {
  const args = fixture();
  const tour = args.project.tour!;
  const slide = tour.slides[0]!;
  if (slide.kind !== 'image') throw new Error('Missing image slide');
  tour.stage.image = structuredClone(slide.image);
  const original = JSON.stringify(tour);
  const artifact = await prepareTourHtml(args);
  const html = await artifact.blob.text();
  expect(io.raster).toHaveBeenCalledTimes(1);
  expect(io.raster.mock.calls[0]![1]).toHaveLength(1);
  expect(html.split(btoa('sanitized'))).toHaveLength(2);
  expect(html).not.toContain(`data:image/png;base64,${btoa('image')}`);
  expect(html).not.toContain('private-gallery');
  expect(html).not.toContain('private-file.png');
  expect(html).toContain('"stage":');
  expect(JSON.stringify(tour)).toBe(original);
});

it('prepares a stage-only image through the shared raster authority and fails missing bytes', async () => {
  const args = fixture();
  const slide = args.project.tour!.slides[0]!;
  if (slide.kind !== 'image' || !slide.image) throw new Error('Missing image slide');
  args.project.tour!.stage.image = { ...slide.image, assetId: 'stage-only' };
  io.asset.mockImplementation(
    async (id: string) =>
      new Blob([id], {
        type: id === 'audio' ? 'audio/wav' : 'image/png',
      })
  );
  const artifact = await prepareTourHtml(args);
  expect(artifact.mediaCount).toBe(3);
  expect(io.asset.mock.calls.map(([id]) => id)).toContain('stage-only');
  expect(io.raster).toHaveBeenCalledTimes(2);
  expect(await artifact.blob.text()).not.toContain('private-gallery');
  io.asset.mockImplementation(async (id: string) =>
    id === 'stage-only'
      ? undefined
      : new Blob([id], { type: id === 'audio' ? 'audio/wav' : 'image/png' })
  );
  await expect(prepareTourHtml(args)).rejects.toThrow('Missing tour media');
});
