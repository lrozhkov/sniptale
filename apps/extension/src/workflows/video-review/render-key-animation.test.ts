import { expect, it, vi } from 'vitest';
import { drawReviewKeys } from './render-key-animation';
import { REVIEW_KEY_DEFAULT } from '../../features/video/review/advanced/key-animation';

it('keeps output placement stable and does not resurrect an older command after replacement', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: () => ({ width: 80 }),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  const first = {
    label: 'Ctrl+C',
    start: 0,
    end: 4,
    settings: {
      ...REVIEW_KEY_DEFAULT,
      enabled: true,
      style: { ...REVIEW_KEY_DEFAULT.style, entrance: 'none' as const },
    },
  };
  const next = { ...first, label: 'Ctrl+V', start: 1, end: 2 };
  drawReviewKeys(context, [first, next], -0.1, { width: 1920, height: 1080 });
  expect(context.fillText).not.toHaveBeenCalled();
  drawReviewKeys(context, [first, next], 1.5, { width: 1920, height: 1080 });
  expect(context.fillText).toHaveBeenCalledOnce();
  expect(context.fillText).toHaveBeenCalledWith(
    'Ctrl+V',
    960,
    expect.any(Number),
    expect.any(Number)
  );
  drawReviewKeys(context, [next, first], 2.5, { width: 1920, height: 1080 });
  expect(context.fillText).toHaveBeenCalledOnce();
  drawReviewKeys(
    context,
    [
      first,
      {
        ...next,
        settings: { ...next.settings, style: { ...next.settings.style, position: 'top-left' } },
      },
    ],
    1.5,
    { width: 1920, height: 1080 }
  );
  expect(context.fillText).toHaveBeenCalledTimes(3);
});
