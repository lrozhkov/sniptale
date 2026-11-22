import {
  applyReviewTextTemplate,
  reviewBuiltinTextTemplates,
} from '../../features/video/review/annotation-effects/text-templates';
import { expect, it, vi } from 'vitest';
import {
  layoutReviewAnnotationText,
  prepareReviewAnnotationTextLayout,
  reviewAnnotationTextSelectionBounds,
} from './annotation-text-layout';
import { legacyReviewTextAppearance } from '../../features/video/review/annotation-effects/text-appearance';
import { createReviewAnnotationTextClip } from '../../features/video/review/annotation-effects/text-animation';
import { drawReviewAnnotationText, reviewViewportAnnotationLayers } from './draw-annotation-text';

it('keeps combined accents and joined emoji intact and measures against the full line', () => {
  const measure = (text: string) => Array.from(text).length * 10;
  const accent = 'е\u0301';
  const emoji = '👩🏽‍💻';
  const context = {
    measureText: (text: string) => ({ width: measure(text) }),
    save: vi.fn(),
    restore: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const clip = createReviewAnnotationTextClip('title', `А ${accent}${emoji}`, 0, 1, 0);
  const layout = layoutReviewAnnotationText(
    context,
    clip,
    100,
    10,
    legacyReviewTextAppearance,
    '600 10px Arial'
  );
  expect(layout.units('grapheme', context)).toEqual([
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

it('keeps marker bounds stable in typewriter and centers a single-line block for every alignment', () => {
  const base = createReviewAnnotationTextClip('test', 'Первая строка\nКадр', 0, 3, 0);
  const clip = applyReviewTextTemplate(base, reviewBuiltinTextTemplates.marker);
  clip.entrance = { ...clip.entrance, preset: 'typewriter', duration: 1 };
  const rectangle = vi.fn();
  const fill = vi.fn();
  const context = {
    fillRect: rectangle,
    fillText: fill,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 10 }),
  } as unknown as CanvasRenderingContext2D;
  const size = { width: 640, height: 360 };
  drawReviewAnnotationText(context, clip, 0.3, size, size);
  expect(rectangle.mock.calls).toHaveLength(1);
  const first = rectangle.mock.calls[0];
  rectangle.mockClear();
  drawReviewAnnotationText(context, clip, 1.5, size, size);
  expect(rectangle.mock.calls).toHaveLength(2);
  expect(rectangle.mock.calls[0]).toEqual(first);
  expect(rectangle.mock.calls[1]?.[2]).toBeLessThan(first?.[2] ?? 0);

  clip.text = 'Кадр';
  fill.mockClear();
  drawReviewAnnotationText(context, clip, 1.5, size, size);
  const x = fill.mock.calls[0]?.[1];
  clip.appearance!.align = 'right';
  fill.mockClear();
  drawReviewAnnotationText(context, clip, 1.5, size, size);
  expect(fill.mock.calls[0]?.[1]).toBe(x);
});

it('uses one default alignment for all built-in title templates', () => {
  expect(
    Object.values(reviewBuiltinTextTemplates).map(({ appearance }) => appearance.align)
  ).toEqual(Array(6).fill('center'));
});

it.each([
  ['left', -40],
  ['center', -10],
  ['right', 20],
] as const)('aligns short rows %s inside the fitted text block', (align, shortX) => {
  const base = createReviewAnnotationTextClip('bounds', 'Длинная!\nДа', 0, 3, 0);
  const clip = applyReviewTextTemplate(base, reviewBuiltinTextTemplates.marker);
  const appearance = { ...clip.appearance!, align };
  const measureText = (text: string) => ({
    width: text.length * 10,
    actualBoundingBoxLeft: 0,
    actualBoundingBoxRight: text.length * 10,
    actualBoundingBoxAscent: 4,
    actualBoundingBoxDescent: 3,
  });
  const fillRect = vi.fn();
  const context = {
    measureText,
    fillRect,
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const plane = { width: 640, height: 100 };
  clip.appearance = appearance;
  clip.fontSize = 0.1;
  const layout = prepareReviewAnnotationTextLayout(
    context,
    clip,
    clip.transform.width * plane.width,
    10,
    appearance
  );
  expect(layout.lines.map(({ x }) => x)).toEqual([-40, shortX]);
  const bounds = reviewAnnotationTextSelectionBounds(layout, appearance, 10)!;
  expect(bounds.x).toBeCloseTo(-41.7, 5);
  expect(bounds.width).toBeCloseTo(83.4, 5);
  drawReviewAnnotationText(context, clip, 1.5, plane, plane);
  const rows = fillRect.mock.calls as [number, number, number, number][];
  expect(rows).toHaveLength(2);
  expect(rows[0]?.[0]).toBeCloseTo(bounds.x, 5);
  expect(rows[0]?.[1]).toBeCloseTo(bounds.y, 5);
  expect(rows[1]?.[0]).toBeCloseTo(shortX - 1.7, 5);
  expect(rows[1]![1] + rows[1]![3]).toBeCloseTo(bounds.y + bounds.height, 5);
});

it('fits glyph overhang and outline when there is no background', () => {
  const clip = createReviewAnnotationTextClip('bounds', 'А', 0, 3, 0);
  const context = {
    measureText: () => ({
      width: 10,
      actualBoundingBoxLeft: 2,
      actualBoundingBoxRight: 11,
      actualBoundingBoxAscent: 4,
      actualBoundingBoxDescent: 3,
    }),
  } as unknown as CanvasRenderingContext2D;
  const appearance = legacyReviewTextAppearance;
  const layout = prepareReviewAnnotationTextLayout(context, clip, 200, 10, appearance);
  expect(reviewAnnotationTextSelectionBounds(layout, appearance, 10)).toEqual({
    x: -7.3,
    y: -4.3,
    width: 13.6,
    height: 7.6,
  });
});
