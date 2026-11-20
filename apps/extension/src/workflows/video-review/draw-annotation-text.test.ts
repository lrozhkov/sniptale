import { expect, it, vi } from 'vitest';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import {
  drawReviewAnnotationText,
  layoutReviewAnnotationTextUnits,
  reviewViewportAnnotationLayers,
} from './draw-annotation-text';

it('keeps combined accents and joined emoji intact and measures against the full line', () => {
  const measure = (text: string) => Array.from(text).length * 10;
  const accent = 'е\u0301';
  const emoji = '👩🏽‍💻';
  expect(layoutReviewAnnotationTextUnits([`А ${accent}${emoji}`], 'grapheme', measure)).toEqual([
    { text: 'А', row: 0, x: -40, width: 10 },
    { text: accent, row: 0, x: -20, width: 20 },
    { text: emoji, row: 0, x: 0, width: 40 },
  ]);
});

it('keeps the first revealed glyph fixed across time and shows the complete text before exit', () => {
  const clip = createReviewAnnotationTextClip('title', 'А е́ 👩🏽‍💻', 1, 2, 0);
  clip.entrance = { ...clip.entrance, preset: 'typewriter', duration: 1 };
  clip.exit = { ...clip.exit, preset: 'blur', duration: 1 };
  const fill = vi.fn();
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
    strokeText: vi.fn(),
    fillText: fill,
  } as unknown as CanvasRenderingContext2D;
  const plane = { width: 640, height: 360 };
  drawReviewAnnotationText(context, clip, 1.15, plane, plane);
  expect(fill.mock.calls.map(([text]) => text)).toEqual(['А']);
  const firstX = fill.mock.calls[0]?.[1];
  fill.mockClear();
  drawReviewAnnotationText(context, clip, 1.3, plane, plane);
  expect(fill.mock.calls.map(([text]) => text)).toEqual(['А', 'е́']);
  expect(fill.mock.calls[0]?.[1]).toBe(firstX);
  fill.mockClear();
  drawReviewAnnotationText(context, clip, 1.49, plane, plane);
  expect(fill.mock.calls.map(([text]) => text)).toEqual([clip.text]);
});

it('interleaves native text with packages and excludes text at its end boundary', () => {
  const a = createReviewAnnotationTextClip('earlier', 'A', 1, 2, 0);
  const b = createReviewAnnotationTextClip('later', 'B', 1, 3, 2);
  const packageFrame = { instance: { order: 1 } };
  expect(
    reviewViewportAnnotationLayers([packageFrame], [b, a], 1).map((layer) => layer.order)
  ).toEqual([0, 1, 2]);
  expect(
    reviewViewportAnnotationLayers([packageFrame], [b, a], 2).map((layer) => layer.order)
  ).toEqual([1, 2]);
});

it.each([0.000001, 16])(
  'bounds first layout and animation paint for a large accepted title at viewport width %s',
  (width) => {
    const clip = createReviewAnnotationTextClip('dense', 'А'.repeat(4096), 0, 3, 0);
    clip.entrance = { ...clip.entrance, preset: 'letters', duration: 1, stagger: 0 };
    clip.transform = { ...clip.transform, width, x: (1 - width) / 2 };
    const fill = vi.fn();
    let measured = 0;
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      measureText: (text: string) => {
        measured += text.length;
        return { width: text.length * 10 };
      },
      strokeText: vi.fn(),
      fillText: fill,
    } as unknown as CanvasRenderingContext2D;
    const plane = { width: 640, height: 360 };
    drawReviewAnnotationText(context, clip, 0.5, plane, plane);
    expect(measured).toBeLessThan(clip.text.length * 45);
    expect(fill.mock.calls.length).toBeGreaterThan(0);
    expect(fill.mock.calls.length).toBeLessThan(400);
    measured = 0;
    fill.mockClear();
    drawReviewAnnotationText(context, clip, 0.6, plane, plane);
    expect(measured).toBe(0);
    expect(fill.mock.calls.length).toBeGreaterThan(0);
    expect(fill.mock.calls.length).toBeLessThan(400);
    clip.text = 'Bridge';
    drawReviewAnnotationText(context, clip, 0.6, plane, plane);
    expect(measured).toBeGreaterThan(0);
  }
);
