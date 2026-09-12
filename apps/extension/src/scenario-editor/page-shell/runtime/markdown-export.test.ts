import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideImageBlock,
  createGuideProject,
  createGuideStep,
} from '../../../features/scenario/project/public';
import { createTranslator } from '../../../platform/i18n';
const io = vi.hoisted(() => ({ sink: vi.fn(), asset: vi.fn(), record: vi.fn() }));
vi.mock('../../../composition/archive-transfer', async (original) => ({
  ...(await original<typeof import('../../../composition/archive-transfer')>()),
  createDirectFileSink: io.sink,
}));
vi.mock('../../../composition/persistence/scenario/store/public', () => ({
  getScenarioAssetBlob: io.asset,
  saveScenarioExportRecord: io.record,
}));
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../composition/archive-transfer';
import { exportGuideMarkdown } from './markdown-export';

function setup() {
  const output = createArchiveMemorySink();
  const order: string[] = [];
  const close = vi.spyOn(output.sink, 'close').mockImplementation(async () => {
    order.push('close');
  });
  io.sink.mockResolvedValue(output.sink);
  io.record.mockImplementation(async () => {
    order.push('record');
  });
  const project = createGuideProject('Guide');
  const step = createGuideStep('Step', 'step');
  step.blocks.push(
    createGuideImageBlock({
      id: 'img',
      assetId: 'asset',
      width: 100,
      height: 50,
      source: { kind: 'import', filename: 'x.png' },
    })
  );
  project.items = [step];
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
  io.asset.mockResolvedValue(png);
  const bitmap = { width: 100, height: 50, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  const convert = vi.fn().mockResolvedValue(png);
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number
      ) {}
      getContext() {
        return { translate() {}, scale() {}, beginPath() {}, rect() {}, clip() {}, drawImage() {} };
      }
      convertToBlob = convert;
    }
  );
  const controller = new AbortController();
  return {
    output,
    order,
    close,
    bitmap,
    convert,
    controller,
    args: { project, t: createTranslator('en'), signal: controller.signal },
  };
}
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());
it('writes a portable ZIP and closes it before recording history', async () => {
  const s = setup();
  expect(await exportGuideMarkdown(s.args)).toBe('saved');
  expect(s.order).toEqual(['close', 'record']);
  expect(s.bitmap.close).toHaveBeenCalledTimes(1);
  const archive = await openArchiveReader(s.output.blob());
  try {
    expect(archive.entries().map((entry) => entry.path)).toEqual(['guide.md', 'images/0001.png']);
    expect(await archive.entry('guide.md')!.text(1024)).toContain('## 1 · Step');
  } finally {
    await archive.close();
  }
});
it('releases a decoded image and aborts the ZIP on rendering failure or cancellation', async () => {
  for (const cancel of [false, true]) {
    const s = setup();
    s.convert.mockImplementation(async () => {
      if (cancel) s.controller.abort();
      else throw new Error('encode');
      return new Blob();
    });
    await expect(exportGuideMarkdown(s.args)).rejects.toThrow();
    expect(s.output.aborted).toBe(true);
    expect(s.bitmap.close).toHaveBeenCalledTimes(1);
    expect(s.close).not.toHaveBeenCalled();
    expect(io.record).not.toHaveBeenCalled();
  }
});
it('distinguishes a committed file with failed history from failed file close', async () => {
  const s = setup();
  io.record.mockRejectedValueOnce(new Error('history'));
  expect(await exportGuideMarkdown(s.args)).toBe('history-failed');
  expect(s.output.aborted).toBe(false);
  const next = setup();
  next.close.mockRejectedValueOnce(new Error('disk'));
  io.record.mockClear();
  await expect(exportGuideMarkdown(next.args)).rejects.toThrow('disk');
  expect(next.output.aborted).toBe(true);
  expect(io.record).not.toHaveBeenCalled();
});
it('aborts missing, invalid and undecodable sources without publishing a partial archive', async () => {
  for (const kind of ['missing', 'unsafe', 'decode'] as const) {
    const s = setup();
    if (kind === 'missing') io.asset.mockResolvedValue(null);
    else if (kind === 'unsafe')
      io.asset.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
    else vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')));
    await expect(exportGuideMarkdown(s.args)).rejects.toThrow();
    expect(s.output.aborted).toBe(true);
    expect(s.close).not.toHaveBeenCalled();
    expect(io.record).not.toHaveBeenCalled();
  }
});
it('cleans up a decoded bitmap when canvas context creation fails', async () => {
  const s = setup();
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      width = 0;
      height = 0;
      getContext() {
        return null;
      }
    }
  );
  await expect(exportGuideMarkdown(s.args)).rejects.toThrow('Image rendering unavailable');
  expect(s.bitmap.close).toHaveBeenCalledTimes(1);
  expect(s.output.aborted).toBe(true);
  expect(io.record).not.toHaveBeenCalled();
});
it('does not acquire image resources after picker cancellation or an already cancelled job', async () => {
  const s = setup();
  io.sink.mockRejectedValueOnce(new DOMException('cancel', 'AbortError'));
  await expect(exportGuideMarkdown(s.args)).rejects.toThrow();
  expect(s.output.aborted).toBe(false);
  expect(io.asset).not.toHaveBeenCalled();
  s.controller.abort();
  await expect(exportGuideMarkdown(s.args)).rejects.toThrow();
  expect(s.output.aborted).toBe(true);
  expect(io.asset).not.toHaveBeenCalled();
  expect(io.record).not.toHaveBeenCalled();
});
