import { describe, expect, it, vi } from 'vitest';
import { drawReviewPresentationFrame } from './presentation-frame';

function context() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 0.2,
    globalCompositeOperation: 'multiply',
    filter: 'blur(20px)',
    shadowColor: '#ff0000',
    shadowBlur: 10,
    shadowOffsetX: 2,
    shadowOffsetY: 3,
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D;
}
const framing = { fit: 'cover' as const, fillColor: '#000000ff', crop: { panX: 0, panY: 0 } };

describe('bookend framing', () => {
  it.each([-1, 0, 1])('exposes the requested horizontal cover edge at %s', (panX) => {
    const ctx = context();
    const draw = vi.fn();
    drawReviewPresentationFrame(
      ctx,
      { width: 1920, height: 1080 },
      { width: 1080, height: 1080 },
      { ...framing, crop: { panX, panY: 0 } },
      draw
    );
    expect(draw).toHaveBeenCalledWith(ctx, -420 * (panX + 1), 0, 1920, 1080);
  });
  it.each([-1, 0, 1])('exposes the requested vertical cover edge at %s', (panY) => {
    const ctx = context();
    const draw = vi.fn();
    drawReviewPresentationFrame(
      ctx,
      { width: 1080, height: 1920 },
      { width: 1080, height: 1080 },
      { ...framing, crop: { panX: 0, panY } },
      draw
    );
    expect(draw).toHaveBeenCalledWith(ctx, 0, -420 * (panY + 1), 1080, 1920);
  });
  it('centers contain independently of remembered cover crop at 4K', () => {
    const ctx = context();
    const draw = vi.fn();
    drawReviewPresentationFrame(
      ctx,
      { width: 1080, height: 1920 },
      { width: 3840, height: 2160 },
      { ...framing, fit: 'contain', crop: { panX: 1, panY: -1 } },
      draw
    );
    expect(draw).toHaveBeenCalledWith(ctx, 1312.5, 0, 1215, 2160);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 3840, 2160);
    expect(ctx.rect).toHaveBeenCalledWith(0, 0, 3840, 2160);
  });
  it('isolates main scene state and restores context after a decoder draw failure', () => {
    const ctx = context();
    expect(() =>
      drawReviewPresentationFrame(
        ctx,
        { width: 10, height: 10 },
        { width: 20, height: 20 },
        framing,
        () => {
          expect(ctx.globalAlpha).toBe(1);
          expect(ctx.globalCompositeOperation).toBe('source-over');
          expect(ctx.filter).toBe('none');
          expect(ctx.shadowBlur).toBe(0);
          throw new Error('Decode failed');
        }
      )
    ).toThrow('Decode failed');
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});

it('draws fractional odd-size cover framing over its own fill without Native rounding', () => {
  const ctx = context();
  const draw = vi.fn();
  drawReviewPresentationFrame(
    ctx,
    { width: 641, height: 359 },
    { width: 321, height: 181 },
    { fit: 'cover', fillColor: '#12ab34ff', crop: { panX: 0.75, panY: -0.6 } },
    draw
  );
  const [, x, y, width, height] = draw.mock.calls[0]!;
  expect(x).toBeCloseTo(-1.9059888579387188, 9);
  expect(y).toBeCloseTo(0, 9);
  expect(width).toBeCloseTo(323.1782729805014, 9);
  expect(height).toBeCloseTo(181, 9);
  expect(ctx.fillStyle).toBe('#12ab34ff');
  expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 321, 181);
  expect(ctx.restore).toHaveBeenCalledOnce();
});
