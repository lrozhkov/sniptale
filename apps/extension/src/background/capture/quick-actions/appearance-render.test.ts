import { createGradientPaint } from '@sniptale/foundation/paint';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuickActionAppearance } from '../../../contracts/quick-action-appearance';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { renderQuickActionAppearance, type QuickActionRasterOptions } from './appearance-render';
const raw =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAFElEQVR4AWKS8Mj5D8JMDFAAZwAAAAD//238wugAAAAGSURBVAMATl0DnQxeRbkAAAAASUVORK5CYII=';
const context = {
  save: vi.fn(),
  restore: vi.fn(),
  fillRect: vi.fn(),
  drawImage: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  clip: vi.fn(),
  fillText: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  measureText: vi.fn((value: string) => ({ width: value.length * 5 })),
};
const encode = vi.fn();
const canvases: Array<{ width: number; height: number }> = [];
const bitmap = () => ({ width: 2, height: 3, close: vi.fn() });
const decode = vi.fn();
class Canvas {
  constructor(
    public width: number,
    public height: number
  ) {
    canvases.push(this);
  }
  getContext() {
    return context;
  }
  convertToBlob(options: { type: string; quality: number }) {
    return encode(options);
  }
}
function options(): QuickActionRasterOptions {
  return {
    appearance: createQuickActionAppearance(),
    dataUrl: raw,
    imageFormat: 'png',
    imageQuality: 90,
    metadata: { date: 'Today', title: 'Page' },
    assertCurrent: vi.fn(),
    renderHeader: vi.fn(async () => raw),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  canvases.length = 0;
  decode.mockImplementation(async () => bitmap());
  encode.mockImplementation(async ({ type }: { type: string }) => new Blob(['encoded'], { type }));
  vi.stubGlobal('OffscreenCanvas', Canvas);
  vi.stubGlobal('createImageBitmap', decode);
});
afterEach(() => vi.unstubAllGlobals());
describe('quick-action raster resources and composition', () => {
  it.each(['png', 'jpeg', 'webp'] as const)(
    'encodes the selected format and releases its bitmap and canvas: %s',
    async (imageFormat) => {
      const input = options();
      input.imageFormat = imageFormat;
      const source = bitmap();
      decode.mockResolvedValue(source);
      const result = await renderQuickActionAppearance(input);
      expect(result).toMatch(`data:image/${imageFormat};base64,`);
      expect(encode).toHaveBeenCalledWith({ type: `image/${imageFormat}`, quality: 0.9 });
      expect(source.close).toHaveBeenCalledOnce();
      expect(canvases[0]).toEqual({ width: 0, height: 0 });
    }
  );
  it('places source pixels below a header and above a caption with the configured background', async () => {
    const input = options();
    input.appearance.header = { ...DEFAULT_WINDOW_HEADER, title: 'Static' };
    input.appearance.titleSource = 'static';
    input.appearance.background.kind = 'paint';
    input.appearance.information.enabled = true;
    const source = bitmap(),
      header = { ...bitmap(), height: 1 };
    decode.mockResolvedValueOnce(source).mockResolvedValueOnce(header);
    await renderQuickActionAppearance(input);
    expect(context.drawImage).toHaveBeenCalledWith(header, 32, 32);
    expect(context.drawImage).toHaveBeenCalledWith(source, 32, 33);
    expect(context.fillText).toHaveBeenCalledWith('…', 32, 44, 2);
    expect(source.close).toHaveBeenCalledOnce();
    expect(header.close).toHaveBeenCalledOnce();
  });
  it('refuses excessive raster dimensions before allocating any bitmap or canvas', async () => {
    const bytes = Buffer.from(raw.split(',')[1]!, 'base64');
    bytes.writeUInt32BE(10000, 16);
    bytes.writeUInt32BE(10000, 20);
    const input = options();
    input.dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
    await expect(renderQuickActionAppearance(input)).rejects.toThrow('limits');
    expect(decode).not.toHaveBeenCalled();
    expect(canvases).toHaveLength(0);
  });
  it('releases source and header after a mismatched header response', async () => {
    const input = options();
    input.appearance.header = { ...DEFAULT_WINDOW_HEADER };
    const source = bitmap(),
      header = { ...bitmap(), width: 9 };
    decode.mockResolvedValueOnce(source).mockResolvedValueOnce(header);
    await expect(renderQuickActionAppearance(input)).rejects.toThrow('dimensions');
    expect(source.close).toHaveBeenCalledOnce();
    expect(header.close).toHaveBeenCalledOnce();
    expect(canvases).toHaveLength(0);
  });
  it('releases resources after encode failure and accepts a new explicit attempt', async () => {
    const first = bitmap(),
      retry = bitmap();
    decode.mockResolvedValueOnce(first).mockResolvedValueOnce(retry);
    encode.mockRejectedValueOnce(new Error('encoder refused'));
    await expect(renderQuickActionAppearance(options())).rejects.toThrow('encoder refused');
    expect(first.close).toHaveBeenCalledOnce();
    expect(canvases[0]).toEqual({ width: 0, height: 0 });
    await expect(renderQuickActionAppearance(options())).resolves.toMatch('data:image/png;');
    expect(retry.close).toHaveBeenCalledOnce();
  });
});

function sizedRaster(width: number, height: number) {
  const bytes = Buffer.from(raw.split(',')[1]!, 'base64');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
it.each(['cover', 'contain'] as const)(
  'composes a configured image over gradient paint with %s fitting',
  async (fit) => {
    const input = options();
    input.appearance.background = {
      ...input.appearance.background,
      kind: 'image',
      imageDataUrl: raw,
      fit,
      paint: createGradientPaint('#112233ff', () => crypto.randomUUID()),
    };
    await renderQuickActionAppearance(input);
    expect(context.createLinearGradient).toHaveBeenCalledOnce();
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(decode).toHaveBeenCalledTimes(2);
  }
);
it('preserves a short caption above the source without clipping text', async () => {
  const input = options();
  input.dataUrl = sizedRaster(640, 480);
  decode.mockResolvedValue({ ...bitmap(), width: 640, height: 480 });
  input.appearance.information = {
    ...input.appearance.information,
    enabled: true,
    position: 'above',
    title: false,
    text: 'Caption',
  };
  await renderQuickActionAppearance(input);
  expect(context.fillText).toHaveBeenCalledWith('Caption', 0, 8, 640);
});
it('refuses an unsupported source, over-budget work and malformed background before decode', async () => {
  for (const patch of [{ dataUrl: 'bad' }, { dataUrl: sizedRaster(7000, 7000) }]) {
    await expect(renderQuickActionAppearance({ ...options(), ...patch })).rejects.toThrow();
  }
  const input = options();
  input.appearance.background.kind = 'image';
  input.appearance.background.imageDataUrl = sizedRaster(16385, 2);
  await expect(renderQuickActionAppearance(input)).rejects.toThrow('background');
  expect(decode).not.toHaveBeenCalled();
});
it('closes a source with mismatched decoded dimensions and refuses unsupported output encoders', async () => {
  const source = { ...bitmap(), width: 9 };
  decode.mockResolvedValueOnce(source);
  await expect(renderQuickActionAppearance(options())).rejects.toThrow('dimensions');
  expect(source.close).toHaveBeenCalledOnce();
  encode.mockResolvedValueOnce(new Blob(['bad'], { type: 'image/jpeg' }));
  await expect(renderQuickActionAppearance(options())).rejects.toThrow('encoding');
  expect(canvases.at(-1)).toEqual({ width: 0, height: 0 });
});
