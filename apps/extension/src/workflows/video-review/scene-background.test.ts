// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { createReviewBackgroundPainter, drawReviewBackgroundPaint } from './scene-background';
import { drawReviewBlurredScene } from './spotlight-blur';
import { resolveReviewSceneOutput } from './render-settings';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
vi.mock('./spotlight-blur', () => ({ drawReviewBlurredScene: vi.fn() }));
vi.mock('../../features/video/project/scene/background-gradient-canvas', () => ({
  drawSceneGradient: vi.fn(),
}));
const background: QuickEditBackgroundSettings = {
  enabled: true,
  type: 'image',
  assetId: 'a',
  imageFit: 'cover',
  layout: { padding: 40, cornerRadius: 12, blur: 12 },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement
  ) {
    return {
      canvas: this,
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
  });
});
const context = () => document.createElement('canvas').getContext('2d')!;
it('filters once per owner and invalidates paint/image/geometry without filtering content', () => {
  const owner = context();
  const image = Object.assign(document.createElement('canvas'), { width: 100, height: 100 });
  const args = { background, image, width: 400, height: 200 };
  drawReviewBackgroundPaint(owner, args);
  drawReviewBackgroundPaint(context(), args, owner);
  expect(drawReviewBlurredScene).toHaveBeenCalledTimes(1);
  expect(drawReviewBlurredScene).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.anything(),
    expect.anything(),
    12
  );
  drawReviewBackgroundPaint(owner, { ...args, width: 800 });
  drawReviewBackgroundPaint(owner, { ...args, image: null });
  expect(drawReviewBlurredScene).toHaveBeenCalledTimes(3);
  drawReviewBackgroundPaint(owner, {
    ...args,
    background: { ...background, layout: { ...background.layout, blur: 0 } },
  });
  expect(drawReviewBlurredScene).toHaveBeenCalledTimes(3);
});
it('bounds raster memory and scales the blur into its raster pixels', () => {
  drawReviewBackgroundPaint(context(), { background, image: null, width: 4096, height: 2160 });
  const call = vi.mocked(drawReviewBlurredScene).mock.calls[0]!;
  expect(call[1].width).toBe(2048);
  expect(call[1].height).toBe(1080);
  expect(call[3]).toBe(6);
});

it('scales the persisted blur once for export resolution', () => {
  const output = resolveReviewSceneOutput({ width: 1920, height: 1080 }, { background }, '720P');
  expect(output.background.enabled && output.background.layout.blur).toBe(8);
});

it('keeps disabled and solid paint sharp and applies contain fit before filtering', () => {
  const target = context();
  const image = Object.assign(document.createElement('canvas'), { width: 100, height: 100 });
  drawReviewBackgroundPaint(target, {
    background: { enabled: false },
    image: null,
    width: 100,
    height: 50,
  });
  drawReviewBackgroundPaint(target, {
    background: {
      enabled: true,
      type: 'solid',
      color: '#ff0000',
      layout: { padding: 0, cornerRadius: 0, blur: 12 },
    },
    image: null,
    width: 100,
    height: 50,
  });
  expect(drawReviewBlurredScene).not.toHaveBeenCalled();
  drawReviewBackgroundPaint(target, {
    background: { ...background, imageFit: 'contain' },
    image,
    width: 100,
    height: 50,
  });
  expect(drawReviewBlurredScene).toHaveBeenCalledOnce();
});

it('fails explicitly when an offscreen paint surface cannot acquire a context', () => {
  const target = context();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  expect(() =>
    drawReviewBackgroundPaint(target, { background, image: null, width: 100, height: 50 })
  ).toThrow('Background compositor');
});

function managedBackground() {
  const leases: { role: string; release: ReturnType<typeof vi.fn>; canvas: HTMLCanvasElement }[] =
    [];
  const resources: RenderResources = {
    canvas(role, size) {
      const target = context();
      target.canvas.width = size.width;
      target.canvas.height = size.height;
      const release = vi.fn();
      leases.push({ role, release, canvas: target.canvas });
      return { canvas: target.canvas, context: target, release };
    },
    bytes: () => ({ release: vi.fn() }),
  };
  return { resources, leases, painter: createReviewBackgroundPainter(resources) };
}

it('retains one managed cache, replaces it only after preparation and releases it on disable', () => {
  const { painter, resources, leases } = managedBackground();
  const target = context();
  const args = { background, image: null, width: 400, height: 200 };
  painter.draw(target, args);
  painter.draw(target, args);
  expect(leases.map((lease) => lease.role)).toEqual(['background-source', 'background-cache']);
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  expect(leases[1]!.release).not.toHaveBeenCalled();
  expect(drawReviewBlurredScene).toHaveBeenLastCalledWith(
    expect.anything(),
    leases[0]!.canvas,
    null,
    12,
    resources
  );
  painter.draw(target, { ...args, width: 800 });
  expect(leases[1]!.release).toHaveBeenCalledOnce();
  expect(leases[3]!.release).not.toHaveBeenCalled();
  painter.draw(target, { ...args, background: { enabled: false } });
  expect(leases[3]!.release).toHaveBeenCalledOnce();
  painter.dispose();
  painter.dispose();
  expect(() => painter.draw(target, args)).toThrow('disposed');
});

it('keeps the last cache when replacement filtering fails and releases temporary leases', () => {
  const { painter, leases } = managedBackground();
  const target = context();
  const args = { background, image: null, width: 400, height: 200 };
  painter.draw(target, args);
  vi.mocked(drawReviewBlurredScene).mockImplementationOnce(() => {
    throw new Error('filter failure');
  });
  expect(() => painter.draw(target, { ...args, width: 800 })).toThrow('filter failure');
  expect(leases[1]!.release).not.toHaveBeenCalled();
  expect(leases[2]!.release).toHaveBeenCalledOnce();
  expect(leases[3]!.release).toHaveBeenCalledOnce();
  painter.draw(target, args);
  expect(leases).toHaveLength(4);
  painter.dispose();
  expect(leases[1]!.release).toHaveBeenCalledOnce();
});

it('releases the managed source when the cache allocation fails', () => {
  const { resources, painter, leases } = managedBackground();
  const allocate = resources.canvas;
  vi.spyOn(resources, 'canvas').mockImplementation((role, size, options) => {
    if (role === 'background-cache') throw new Error('allocation refused');
    return allocate(role, size, options);
  });
  expect(() =>
    painter.draw(context(), { background, image: null, width: 400, height: 200 })
  ).toThrow('allocation refused');
  expect(leases[0]!.release).toHaveBeenCalledOnce();
  painter.dispose();
});

it('reports only defensive geometry of the retained lease through success, failure and disposal', () => {
  const { painter } = managedBackground();
  const args = { background, image: null, width: 400, height: 200 };
  expect(painter.retainedCacheSize).toBeNull();
  painter.draw(context(), args);
  expect(painter.retainedCacheSize).toEqual({ width: 400, height: 200 });
  const size = painter.retainedCacheSize!;
  size.width = 1;
  expect(painter.retainedCacheSize).toEqual({ width: 400, height: 200 });
  vi.mocked(drawReviewBlurredScene).mockImplementationOnce(() => {
    throw new Error('filter failure');
  });
  expect(() => painter.draw(context(), { ...args, width: 800 })).toThrow('filter failure');
  expect(painter.retainedCacheSize).toEqual({ width: 400, height: 200 });
  painter.dispose();
  expect(painter.retainedCacheSize).toBeNull();
});
