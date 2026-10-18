import {
  getTourHotspots,
  getTourAnnotations,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { expect, it } from 'vitest';
import { createTourImageSlide } from './factories';
import { remapTourImageGeometry, type TourImageTransform } from './tour-edit-geometry';

function fixture() {
  const slide = createTourImageSlide('slide');
  slide.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: 'edit',
    width: 800,
    height: 600,
    alt: 'Image',
    source: { kind: 'import', filename: 'original.png' },
  };
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'hotspot'),
    ...[
      {
        id: 'point',
        point: { x: 0.25, y: 0.5 },
        targetRect: { x: 0.2, y: 0.4, width: 0.1, height: 0.2 },
        label: 'Open',
        text: 'Authored',
        appearance: null,
        visual: { kind: 'point' as const, pulse: true },
      },
    ].map((object) => ({ type: 'hotspot' as const, object })),
  ];
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'annotation', text: 'Text', anchor: { x: 0.4, y: 0.6 }, appearance: null }].map(
      (object) => ({ type: 'annotation' as const, object })
    ),
  ];
  slide.masks = [
    {
      id: 'mask',
      kind: 'redact',
      rect: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
      color: '#000000',
      opacity: 1,
    },
  ];
  return slide;
}
it('keeps annotation-only geometry detached and source metadata unchanged', () => {
  const slide = fixture();
  const result = remapTourImageGeometry(slide, [1, 0, 0, 1, 0, 0]);
  expect(result.status).toBe('mapped');
  expect(result.slide.image).toEqual(slide.image);
  expect(getTourHotspots(result.slide)[0]!.point).toEqual({ x: 0.25, y: 0.5 });
  getTourHotspots(result.slide)[0]!.text = 'Changed';
  expect(getTourHotspots(slide)[0]!.text).toBe('Authored');
});
it('maps every positional object through the same crop and quarter-turn geometry', () => {
  const slide = fixture();
  const cropped = remapTourImageGeometry(slide, [2, 0, 0, 1, -0.2, 0]);
  expect(cropped.status).toBe('mapped');
  expect(getTourHotspots(cropped.slide)[0]!.point.x).toBeCloseTo(0.3);
  expect(getTourAnnotations(cropped.slide)[0]!.anchor?.x).toBeCloseTo(0.6);
  expect(cropped.slide.masks[0]!.rect.width).toBeCloseTo(0.2);
  const rotated = remapTourImageGeometry(slide, [0, 1, -1, 0, 1, 0]);
  expect(rotated.status).toBe('mapped');
  expect(getTourHotspots(rotated.slide)[0]!.point).toEqual({ x: 0.5, y: 0.25 });
  expect(rotated.slide.masks[0]!.rect.x).toBeCloseTo(0.7);
  expect(getTourHotspots(rotated.slide)[0]!.visual).toEqual(getTourHotspots(slide)[0]!.visual);
  expect(rotated.slide.image?.source).toEqual(slide.image?.source);
});
it.each<TourImageTransform | null>([
  null,
  [1, 0, 0, 1, -1, 0],
  [NaN, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [1, 0.1, 0, 1, 0, 0],
])('requires explicit review for unprovable or clipped geometry %j', (transform) => {
  const slide = fixture();
  const result = remapTourImageGeometry(slide, transform);
  expect(result).toEqual({
    status: 'requires-target-review',
    slide: { ...slide, requiresTargetReview: true },
  });
  expect(slide.requiresTargetReview).toBeUndefined();
});
it('never clears outstanding review or guesses a manually authored camera after a crop', () => {
  const slide = fixture();
  slide.camera.mode = 'manual';
  expect(remapTourImageGeometry(slide, [2, 0, 0, 1, -0.2, 0]).status).toBe(
    'requires-target-review'
  );
  expect(remapTourImageGeometry(slide, [1, 0, 0, 1, 0, 0]).status).toBe('mapped');
  slide.requiresTargetReview = true;
  expect(remapTourImageGeometry(slide, [1, 0, 0, 1, 0, 0]).status).toBe('requires-target-review');
});
it('does not require positional review for unanchored captions alone', () => {
  const slide = createTourImageSlide('slide');
  slide.actions = [
    ...slide.actions.filter((entry) => entry.type !== 'annotation'),
    ...[{ id: 'caption', text: 'Caption', anchor: null, appearance: null }].map((object) => ({
      type: 'annotation' as const,
      object,
    })),
  ];
  expect(remapTourImageGeometry(slide, null).status).toBe('mapped');
});
