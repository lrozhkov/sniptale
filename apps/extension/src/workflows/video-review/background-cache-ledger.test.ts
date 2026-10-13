// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createReviewBackgroundPainter } from './scene-background';
import {
  createPreviewRenderResources,
  PreviewRenderResourceError,
} from './preview-render-resources';
import {
  calculatePreviewRenderAllocation,
  type PreviewRenderAllocationInput,
} from './preview-render-allocation';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';

afterEach(() => vi.restoreAllMocks());
for (const size of [
  { width: 1480, height: 820 },
  { width: 2560, height: 1280 },
])
  it(`rebuilds follow/fixed/follow at ${size.width}x${size.height} with real retained resources`, () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        return {
          canvas: this,
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          clearRect: vi.fn(),
          reset: vi.fn(),
          filter: 'none',
        } as unknown as CanvasRenderingContext2D;
      }
    );
    const scale = Math.min(1, 2048 / Math.max(size.width, size.height));
    const cache = {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
    const input: PreviewRenderAllocationInput = {
      publication: { backing: size, previousFront: size },
      admission: {
        source: { kind: 'canvas', size },
        camera: { retained: null, active: null },
        transition: null,
      },
      assets: {
        headerBitmap: null,
        backgroundBitmap: null,
        watermark: null,
        previousWatermarkCache: null,
      },
      background: { cache, previousCache: null, blurRadius: 12 * scale, denseGradient: false },
      scene: {
        transitionRaster: null,
        windowRaster: null,
        motionPass: null,
        spatial: { output: size, plane: size, halfFloat: false },
        spotlight: null,
        border: null,
        denseCommentGradient: null,
        denseBackgroundGradient: null,
      },
    };
    const initial = calculatePreviewRenderAllocation(input);
    const resources = createPreviewRenderResources(initial);
    const held = [
      resources.canvas('front', size),
      resources.canvas('staging', size),
      resources.canvas('source', size),
    ];
    const reserved: { release(): void }[] = [];
    for (const entry of initial.phases
      .find((p) => p.name === 'scene')!
      .allocations.filter((a) => a.role.startsWith('spatial-'))) {
      if (entry.canvases) held.push(resources.canvas(entry.role, size));
      else reserved.push(resources.bytes(entry.role, entry.bytes));
    }
    const painter = createReviewBackgroundPainter(resources);
    const target = held[1]!.context;
    const background: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'image',
      assetId: 'synthetic',
      imageFit: 'cover',
      layout: { padding: 0, cornerRadius: 0, blur: 12 },
    };
    try {
      for (const zoomBehavior of ['follow-video', 'fixed', 'follow-video'] as const) {
        const graph = {
          ...input,
          background: { ...input.background!, previousCache: painter.retainedCacheSize },
        };
        const admitted = calculatePreviewRenderAllocation(graph);
        resources.replaceLimits(admitted);
        painter.draw(target, { background: { ...background, zoomBehavior }, image: null, ...size });

        expect(resources.counters.peakManagedBytes).toBeLessThanOrEqual(
          admitted.maximumManagedBytes
        );
        expect(resources.counters.peakCanvasCount).toBeLessThanOrEqual(admitted.maximumCanvases);
      }
      expect(painter.retainedCacheSize).toEqual(cache);
      const old = painter.retainedCacheSize;
      const allocate = resources.canvas.bind(resources);
      vi.spyOn(resources, 'canvas').mockImplementation((role, bounds, options) => {
        if (role === 'spotlight.paddedBlur') throw new PreviewRenderResourceError();
        return allocate(role, bounds, options);
      });
      expect(() =>
        painter.draw(target, {
          background: { ...background, zoomBehavior: 'fixed' },
          image: null,
          ...size,
        })
      ).toThrow(PreviewRenderResourceError);
      expect(painter.retainedCacheSize).toEqual(old);
      vi.restoreAllMocks();
      painter.draw(target, {
        background: { ...background, zoomBehavior: 'follow-video' },
        image: null,
        ...size,
      });
    } finally {
      painter.dispose();
      held.forEach((v) => v.release());
      reserved.forEach((v) => v.release());
      resources.dispose();
    }
    expect(resources.counters.managedBytes).toBe(0);
  });
