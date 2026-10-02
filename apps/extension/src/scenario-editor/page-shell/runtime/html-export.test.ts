import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_HTML_IMAGES } from '../html-image-settings';
import {
  createGuideImageBlock,
  createGuideStep,
  createGuideProject,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
const io = vi.hoisted(() => ({
  sink: vi.fn(),
  asset: vi.fn(),
  record: vi.fn(),
  capture: vi.fn(),
  retain: vi.fn(),
  captureAbort: vi.fn(),
  finish: vi.fn(),
  render: vi.fn(),
}));
vi.mock('../../../composition/archive-transfer', async (original) => ({
  ...(await original<typeof import('../../../composition/archive-transfer')>()),
  createDirectFileSink: io.sink,
}));
vi.mock('../../../composition/persistence/scenario/store/public', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/scenario/store/public')>()),
  getScenarioAssetBlob: io.asset,
  saveScenarioExportRecord: io.record,
}));
vi.mock('../html-document', () => ({ buildGuideHtml: io.render }));
vi.mock('../../../composition/persistence/scenario/export-artifacts', () => ({
  createScenarioHtmlCapture: io.capture,
}));
import { exportGuideHtml, measureGuideHtml, prepareGuideHtml } from './html-export';

function setup() {
  const chunks: Uint8Array[] = [];
  const order: string[] = [];
  const close = vi.fn(async () => {
    order.push('close');
  });
  const abort = vi.fn(async () => {});
  io.sink.mockResolvedValue({
    writable: new WritableStream<Uint8Array>({
      write: (chunk) => {
        chunks.push(chunk);
      },
    }),
    close,
    abort,
  });
  io.record.mockImplementation(async () => {
    order.push('record');
  });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 100, height: 50, close: vi.fn() }))
  );
  const block = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 50,
    source: { kind: 'import', filename: 'image.png' },
  });
  const png = new Uint8Array(96 * 1024 + 5);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  io.asset.mockResolvedValue(new Blob([png], { type: 'image/png' }));
  io.render.mockReturnValue({
    html: '<image href="data:image/png;base64,SNIPTALE_ASSET_0">',
    rasters: [
      {
        block,
        settings: DEFAULT_HTML_IMAGES,
        width: 100,
        height: 50,
        size: png.length,
        mime: 'image/png',
      },
    ],
  });
  const controller = new AbortController();
  const args = {
    project: createGuideProject('Test'),
    t: createTranslator('en'),
    theme: 'light' as const,
    signal: controller.signal,
  };
  return { chunks, order, close, abort, png, controller, args };
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
it('prepares identical resolved bytes without opening a file or recording export history', async () => {
  const s = setup();
  const blob = await prepareGuideHtml({ ...s.args, readAsset: io.asset });
  expect(io.sink).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
  expect(await blob.text()).not.toContain('SNIPTALE_ASSET_');
  await exportGuideHtml(s.args);
  expect(await blob.text()).toBe(s.chunks.map((chunk) => new TextDecoder().decode(chunk)).join(''));
});
it('streams exact bytes and records export only after file commit', async () => {
  const s = setup();
  expect(await exportGuideHtml(s.args)).toBe('saved');
  const html = s.chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
  const payload = html.split('base64,')[1]!.split('"')[0]!;
  expect(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))).toEqual(s.png);
  expect(s.order).toEqual(['close', 'record']);
  expect(io.retain.mock.calls.map(([chunk]) => chunk)).toEqual(s.chunks);
  expect(io.record).toHaveBeenCalledWith(
    expect.objectContaining({
      html: {
        mode: 'guide',
        ref: expect.objectContaining({ size: new TextEncoder().encode(html).length }),
      },
    })
  );
  expect(s.abort).not.toHaveBeenCalled();
  expect(io.record).toHaveBeenCalledWith(
    expect.objectContaining({ size: new TextEncoder().encode(html).length })
  );
});
it('aborts missing or unsafe raster output without closing or recording', async () => {
  for (const blob of [undefined, new Blob(['<svg/>'], { type: 'image/svg+xml' })]) {
    const s = setup();
    io.asset.mockResolvedValue(blob);
    await expect(exportGuideHtml(s.args)).rejects.toThrow();
    expect(s.abort).toHaveBeenCalledTimes(1);
    expect(s.close).not.toHaveBeenCalled();
    expect(io.record).not.toHaveBeenCalled();
  }
});
it('aborts file close failure and distinguishes history failure after committed file', async () => {
  const s = setup();
  s.close.mockRejectedValueOnce(new Error('disk full'));
  await expect(exportGuideHtml(s.args)).rejects.toThrow('disk full');
  expect(s.abort).toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
  const next = setup();
  io.record.mockRejectedValueOnce(new Error('history'));
  expect(await exportGuideHtml(next.args)).toBe('history-failed');
  expect(next.close).toHaveBeenCalled();
  expect(next.abort).not.toHaveBeenCalled();
});
it('aborts a failed stream write without committing or recording the file', async () => {
  const s = setup();
  io.sink.mockResolvedValue({
    writable: new WritableStream<Uint8Array>({
      write: () => {
        throw new Error('write failed');
      },
    }),
    close: s.close,
    abort: s.abort,
  });
  await expect(exportGuideHtml(s.args)).rejects.toThrow('write failed');
  expect(s.abort).toHaveBeenCalledTimes(1);
  expect(s.close).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
});
it('does not publish after cancellation while a raster is loading', async () => {
  const s = setup();
  io.asset.mockImplementation(async () => {
    s.controller.abort();
    return new Blob([s.png], { type: 'image/png' });
  });
  await expect(exportGuideHtml(s.args)).rejects.toThrow();
  expect(s.abort).toHaveBeenCalled();
  expect(s.close).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
});
it('leaves picker cancellation without a sink or export record', async () => {
  const s = setup();
  io.sink.mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'));
  await expect(exportGuideHtml(s.args)).rejects.toThrow();
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
  expect(s.abort).not.toHaveBeenCalled();
});

it('does not serialize MIME parameters into an HTML attribute', async () => {
  const s = setup();
  io.asset.mockResolvedValue(new Blob([s.png], { type: 'image/png;x=" onerror="alert(1)' }));
  await exportGuideHtml(s.args);
  const html = s.chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
  expect(html.includes('onerror')).toBe(false);
  expect(html.startsWith('<image href="data:image/png;base64,')).toBe(true);
});

it('measures the exact streamed file size and rejects unresolved raster markers', async () => {
  const s = setup();
  const block = createGuideImageBlock({
    id: 'image',
    assetId: 'asset',
    width: 100,
    height: 50,
    source: { kind: 'import', filename: 'image.png' },
  });
  const step = createGuideStep('Step');
  step.blocks = [block];
  s.args.project.items = [step];
  const measured = await measureGuideHtml(s.args);
  await exportGuideHtml(s.args);
  expect(measured.size).toBe(s.chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  const next = setup();
  io.render.mockReturnValueOnce({
    html: '<image href="data:image/png;base64,SNIPTALE_ASSET_9">',
    rasters: [],
  });
  await expect(exportGuideHtml(next.args)).rejects.toThrow('Unknown export image');
  expect(next.abort).toHaveBeenCalledOnce();
});

it('preserves the committed native file if immutable library retention fails', async () => {
  const s = setup();
  io.finish.mockRejectedValueOnce(new Error('quota'));
  expect(await exportGuideHtml(s.args)).toBe('history-failed');
  expect(s.close).toHaveBeenCalledOnce();
  expect(s.abort).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
});
