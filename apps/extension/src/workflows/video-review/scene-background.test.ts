// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { drawReviewBackgroundPaint } from './scene-background';
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    function (this: HTMLCanvasElement) {
      return {
        canvas: this,
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: '',
      } as unknown as CanvasRenderingContext2D;
    }
  );
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
