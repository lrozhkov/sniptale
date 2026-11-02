import { describe, expect, it, vi } from 'vitest';

import {
  assertEffectDecodedAudio,
  assertEffectDecodedRaster,
  assertEffectRasterDimensions,
  createEffectFrameCanvasBudget,
  closeEffectRuntimeBitmap,
  createEffectRuntimeCompositionResourceLedger,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from './resource-limits';

describe('EffectV1 scalar runtime resource limits', () => {
  it('accepts UHD backing dimensions and rejects larger/invalid rasters', () => {
    expect(assertEffectRasterDimensions(3840, 2160)).toBe(3840 * 2160);
    const invalidDimensions: Array<readonly [number, number]> = [
      [3841, 2160],
      [0, 1],
      [1.5, 1],
      [Number.POSITIVE_INFINITY, 1],
    ];
    for (const [width, height] of invalidDimensions) {
      expect(() => assertEffectRasterDimensions(width, height)).toThrow(EffectRuntimeResourceError);
    }
  });

  it('bounds every canvas and aggregate frame allocations', () => {
    const budget = createEffectFrameCanvasBudget();
    const releases = Array.from({ length: 4 }, () => budget.allocate(3840, 2160));

    expect(budget.snapshot()).toEqual({
      aggregatePixels: EFFECT_RUNTIME_RESOURCE_LIMITS.maxAggregateCanvasPixelsPerFrame,
      liveCanvases: 4,
    });
    expect(() => budget.allocate(1, 1)).toThrow(EffectRuntimeResourceError);
    releases.forEach((release) => release());
    expect(budget.snapshot().liveCanvases).toBe(0);
  });

  it('checks decoded raster and PCM cost after browser decode', () => {
    expect(assertEffectDecodedRaster(3840, 2160)).toBe(3840 * 2160 * 4);
    expect(assertEffectDecodedAudio({ channels: 2, frames: 48_000, sampleRate: 48_000 })).toBe(
      384_000
    );
    expect(() =>
      assertEffectDecodedAudio({
        channels: 2,
        frames: EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedAudioBytes,
        sampleRate: 48_000,
      })
    ).toThrow(EffectRuntimeResourceError);
  });

  it('keeps the outer sandbox watchdog above preparation and worker budgets', () => {
    expect(EFFECT_RUNTIME_RESOURCE_LIMITS.sandboxRequestTimeoutMs).toBeGreaterThan(
      EFFECT_RUNTIME_RESOURCE_LIMITS.mediaDecodeTimeoutMs +
        EFFECT_RUNTIME_RESOURCE_LIMITS.renderTimeoutMs
    );
  });
});

describe('EffectV1 retained runtime resource limits', () => {
  it('accounts retained canvases and bitmaps across one composition authority', () => {
    const ledger = createEffectRuntimeCompositionResourceLedger();
    const frame = ledger.createFrameScope();
    const releases = Array.from({ length: EFFECT_RUNTIME_RESOURCE_LIMITS.maxLiveCanvases }, () =>
      frame.allocateCanvas(1, 1)
    );
    expect(() => frame.allocateCanvas(1, 1)).toThrow(EffectRuntimeResourceError);
    releases.forEach((release) => release());

    const bitmap = { close: () => undefined, height: 10, width: 20 } as ImageBitmap;
    frame.retainBitmap(bitmap);
    expect(ledger.snapshot()).toEqual({
      liveDecodedRasterBytes: 800,
      liveRasterResources: 1,
    });
    closeEffectRuntimeBitmap(bitmap);
    expect(ledger.snapshot()).toEqual({
      liveDecodedRasterBytes: 0,
      liveRasterResources: 0,
    });
  });
});

describe('EffectV1 atomic raster admission', () => {
  it.each([
    ['canvas', 'count', 8, 1, 1],
    ['bitmap', 'count', 8, 1, 1],
    ['canvas', 'bytes', 4, 3840, 2160],
    ['bitmap', 'bytes', 4, 3840, 2160],
  ] as const)(
    'preserves both ledgers when %s admission exceeds live %s',
    (kind, _limit, count, width, height) => {
      const ledger = createEffectRuntimeCompositionResourceLedger();
      const occupied = ledger.createFrameScope();
      const releases = Array.from({ length: count }, () => occupied.allocateCanvas(width, height));
      const frame = ledger.createFrameScope();
      const bitmap = { close: vi.fn(), width: 1024, height: 1024 } as ImageBitmap;
      const reserve = () => {
        if (kind === 'canvas') return frame.allocateCanvas(bitmap.width, bitmap.height);
        frame.retainBitmap(bitmap);
        return () => closeEffectRuntimeBitmap(bitmap);
      };
      const before = frame.snapshot();
      expect(() => reserve()).toThrow(EffectRuntimeResourceError);
      expect(frame.snapshot()).toEqual(before);
      expect(bitmap.close).not.toHaveBeenCalled();
      releases[0]!();
      const release = reserve();
      expect(frame.snapshot().aggregatePixels).toBe(1024 * 1024);
      release();
      release();
      releases.forEach((free) => free());
      expect(ledger.snapshot()).toEqual({ liveDecodedRasterBytes: 0, liveRasterResources: 0 });
      expect(frame.snapshot().aggregatePixels).toBe(1024 * 1024);
    }
  );

  it.each(['canvas', 'bitmap'] as const)(
    'leaves live resources unchanged when %s exceeds the frame aggregate',
    (kind) => {
      const ledger = createEffectRuntimeCompositionResourceLedger();
      const frame = ledger.createFrameScope();
      for (let index = 0; index < 4; index += 1) frame.allocateCanvas(3840, 2160)();
      const before = frame.snapshot();
      const bitmap = { close: vi.fn(), width: 1, height: 1 } as ImageBitmap;
      expect(() => {
        if (kind === 'canvas') frame.allocateCanvas(1, 1);
        else frame.retainBitmap(bitmap);
      }).toThrow(EffectRuntimeResourceError);
      expect(frame.snapshot()).toEqual(before);
      expect(bitmap.close).not.toHaveBeenCalled();
    }
  );

  it('retains an already charged bitmap without charging the frame twice', () => {
    const ledger = createEffectRuntimeCompositionResourceLedger();
    const frame = ledger.createFrameScope();
    for (let index = 0; index < 4; index += 1) frame.allocateCanvas(3840, 2160)();
    const bitmap = { close: vi.fn(), width: 20, height: 10 } as ImageBitmap;
    frame.retainBitmap(bitmap, false);
    expect(frame.snapshot()).toEqual({
      aggregatePixels: EFFECT_RUNTIME_RESOURCE_LIMITS.maxAggregateCanvasPixelsPerFrame,
      liveDecodedRasterBytes: 800,
      liveRasterResources: 1,
    });
    const before = frame.snapshot();
    expect(() => frame.retainBitmap(bitmap, false)).toThrow(EffectRuntimeResourceError);
    expect(frame.snapshot()).toEqual(before);
    closeEffectRuntimeBitmap(bitmap);
    expect(ledger.snapshot()).toEqual({ liveDecodedRasterBytes: 0, liveRasterResources: 0 });
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
