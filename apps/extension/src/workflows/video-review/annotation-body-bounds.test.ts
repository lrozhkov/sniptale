import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../contracts/effect-runtime/animation';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import type {
  EffectRuntimeRenderCommand,
  EffectRuntimeSandboxExecutor,
} from '../../contracts/effect-runtime/types';
import { measureReviewAnnotationBody } from './annotation-body-bounds';

class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}
function result(command: EffectRuntimeRenderCommand, bitmap: Bitmap) {
  return {
    kind: 'frame' as const,
    acknowledged: {
      documentId: command.documentRef.id,
      assetSelectionId: command.assetSelectionRef.id,
    },
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    effectInstanceId: command.effectInstanceId,
    requestId: command.requestId,
    sequenceId: command.sequenceId,
    snapshotId: command.snapshotId,
  };
}
function fixture(width = 8, height = 8) {
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'measurement-proof',
    label: { en: 'Measurement' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: width, h: height, fr: 30, ip: 0, op: 30, layers: [], assets: [] },
  });
  if (!document) throw new Error('Invalid fixture');
  const source = JSON.stringify(document),
    sha256 = createHash('sha256').update(source).digest('hex');
  const scale = Math.min(1, 640 / Math.max(width, height));
  const raster = { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
  const bitmap = new Bitmap(raster.width, raster.height),
    controller = new AbortController();
  const pixels = new Uint8ClampedArray(raster.width * raster.height * 4);
  // Two opaque corners define the ink rectangle. A sub-threshold speck must not expand it.
  pixels[(1 * raster.width + 2) * 4 + 3] = 255;
  pixels[(3 * raster.width + 4) * 4 + 3] = 8;
  pixels[3] = 7;
  const read = vi.fn(() => ({ data: pixels })),
    draw = vi.fn();
  const context = { drawImage: draw, getImageData: read };
  const canvas = { available: true };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return canvas.available ? context : null;
      }
    }
  );
  const render = vi.fn(async (command: EffectRuntimeRenderCommand) => result(command, bitmap));
  const executor: EffectRuntimeSandboxExecutor = { renderFrame: render, dispose: vi.fn() };
  return {
    args: {
      executor,
      document,
      snapshot: {
        id: 'effect:' + sha256,
        sha256,
        source,
        schemaVersion: 'sniptale.animation.v1' as const,
        kind: 'standalone' as const,
        documentId: document.id,
        retainedByteLength: Buffer.byteLength(source),
        assets: [],
      },
      controls: {},
      signal: controller.signal,
    },
    render,
    bitmap,
    controller,
    pixels,
    read,
    draw,
    canvas,
  };
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  { width: 8, height: 8, expected: { x: 1, y: 0, width: 5, height: 5 } },
  { width: 1280, height: 640, expected: { x: 2, y: 0, width: 10, height: 10 } },
])(
  'maps bounded reference pixels back to authored coordinates at $width',
  async ({ width, height, expected }) => {
    const f = fixture(width, height);
    expect(await measureReviewAnnotationBody(f.args)).toEqual(expected);
    expect(f.draw).toHaveBeenCalledWith(f.bitmap, 0, 0);
    expect(f.bitmap.close).toHaveBeenCalledOnce();
    expect(f.render.mock.calls[0]![0]).toMatchObject({
      time: 0.5,
      progress: 0.5,
      width,
      height,
      renderWidth: Math.min(width, 640),
      inputFrames: {},
    });
    expect(f.args.executor.dispose).not.toHaveBeenCalled();
  }
);
it('keeps authored fallback for transparent content and releases the returned bitmap', async () => {
  const f = fixture();
  f.pixels.fill(0);
  expect(await measureReviewAnnotationBody(f.args)).toBeNull();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});
it.each(['context', 'readback'] as const)('releases pixels after a %s failure', async (failure) => {
  const f = fixture();
  if (failure === 'context') f.canvas.available = false;
  else
    f.read.mockImplementation(() => {
      throw new Error('Readback unavailable');
    });
  await expect(measureReviewAnnotationBody(f.args)).rejects.toThrow();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});
it('does not submit an already cancelled measurement', async () => {
  const f = fixture();
  f.controller.abort();
  await expect(measureReviewAnnotationBody(f.args)).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.render).not.toHaveBeenCalled();
});
it('closes a late bitmap without publishing bounds after cancellation', async () => {
  const f = fixture();
  f.render.mockImplementation(async (command) => {
    f.controller.abort();
    return result(command, f.bitmap);
  });
  await expect(measureReviewAnnotationBody(f.args)).rejects.toMatchObject({ name: 'AbortError' });
  expect(f.draw).not.toHaveBeenCalled();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});
it('propagates executor refusal without fabricating a body', async () => {
  const f = fixture();
  const executor: EffectRuntimeSandboxExecutor = {
    dispose: vi.fn(),
    renderFrame: vi.fn(async (command) => createEffectRuntimeFailure(command, 'inputRejected')),
  };
  await expect(measureReviewAnnotationBody({ ...f.args, executor })).rejects.toThrow(
    'Annotation body measurement unavailable'
  );
  expect(f.read).not.toHaveBeenCalled();
});
