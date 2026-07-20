import { describe, expect, it } from 'vitest';

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
