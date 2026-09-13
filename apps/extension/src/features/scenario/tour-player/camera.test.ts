import { expect, it } from 'vitest';
import { createTourImageSlide } from '../project/factories';
import { resolveTourCamera, createTourCameraSession } from './camera';

const viewport = { stageWidth: 500, stageHeight: 250 };
function fixture() {
  const slide = createTourImageSlide('image');
  slide.image = {
    assetId: 'image',
    width: 1000,
    height: 500,
    alt: '',
    galleryAssetId: null,
    editDocumentId: null,
    source: { kind: 'import', filename: 'image.png' },
  };
  slide.hotspots = [
    {
      id: 'point',
      point: { x: 0.5, y: 0.5 },
      targetRect: null,
      label: '',
      text: '',
      action: { kind: 'next' },
      appearance: null,
      pulse: false,
    },
  ];
  return slide;
}
it('automatically zooms only one reviewed target and respects global/slide overrides', () => {
  const slide = fixture();
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(4);
  expect(resolveTourCamera(slide, viewport, false)?.zoom).toBe(1);
  slide.camera.mode = 'auto';
  expect(resolveTourCamera(slide, viewport, false)?.zoom).toBe(4);
  slide.camera.mode = 'off';
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(1);
  slide.camera.mode = 'auto';
  slide.requiresTargetReview = true;
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(1);
  slide.requiresTargetReview = false;
  slide.hotspots.push({ ...slide.hotspots[0]!, id: 'other' });
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(1);
  slide.hotspots = [];
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(1);
});
it.each([
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
])('clamps corner camera without exposing space beyond image edges: %o', (point) => {
  const slide = fixture();
  slide.camera = { mode: 'manual', zoom: 3, center: point };
  const box = resolveTourCamera(slide, viewport, false)!;
  expect(box.x).toBeLessThanOrEqual(0);
  expect(box.y).toBeLessThanOrEqual(0);
  expect(box.x + box.width).toBeGreaterThanOrEqual(viewport.stageWidth);
  expect(box.y + box.height).toBeGreaterThanOrEqual(viewport.stageHeight);
  slide.camera.mode = 'auto';
  slide.hotspots[0]!.point = point;
  const automatic = resolveTourCamera(slide, viewport, true)!;
  const projected = {
    x: automatic.x + point.x * automatic.width,
    y: automatic.y + point.y * automatic.height,
  };
  expect(projected.x).toBeGreaterThanOrEqual(0);
  expect(projected.x).toBeLessThanOrEqual(viewport.stageWidth);
  expect(projected.y).toBeGreaterThanOrEqual(0);
  expect(projected.y).toBeLessThanOrEqual(viewport.stageHeight);
});
it('preserves letterboxing for a narrow image and resolves cover against the same stage', () => {
  const slide = fixture();
  slide.image!.width = 100;
  slide.camera = { mode: 'manual', zoom: 1, center: { x: 1, y: 0 } };
  const contain = resolveTourCamera(slide, viewport, false)!;
  expect(contain).toMatchObject({
    x: 225,
    y: 0,
    width: 50,
    height: 250,
    center: { x: 0.5, y: 0.5 },
  });
  slide.fit = 'cover';
  expect(resolveTourCamera(slide, viewport, false)).toMatchObject({
    x: 0,
    y: 0,
    width: 500,
    height: 2500,
  });
  expect(resolveTourCamera(slide, { stageWidth: 250, stageHeight: 500 }, false)?.width).toBe(250);
});
it('fits a large recorded target and separately authored point together', () => {
  const slide = fixture();
  slide.hotspots[0]!.targetRect = { x: 0.05, y: 0.05, width: 0.8, height: 0.8 };
  slide.hotspots[0]!.point = { x: 0.95, y: 0.95 };
  expect(resolveTourCamera(slide, viewport, true)?.zoom).toBe(1);
  expect(resolveTourCamera(slide, { stageWidth: 0, stageHeight: 0 }, true)).toBeNull();
  slide.image = null;
  expect(resolveTourCamera(slide, viewport, true)).toBeNull();
});

it('holds authoring camera across target moves and refits only on deliberate camera/navigation changes', () => {
  const slide = fixture();
  const camera = createTourCameraSession(true);
  const original = camera.resolve(slide, viewport, true);
  const moved = { ...slide, hotspots: [{ ...slide.hotspots[0]!, point: { x: 0.7, y: 0.7 } }] };
  expect(camera.resolve(moved, viewport, true)).toEqual(original);
  camera.reset();
  expect(camera.resolve(moved, viewport, true)).not.toEqual(original);
  const reader = createTourCameraSession(false);
  expect(reader.resolve(moved, viewport, true)).toEqual(resolveTourCamera(moved, viewport, true));
  expect(
    camera.resolve({ ...moved, camera: { ...moved.camera, mode: 'off' } }, viewport, true)?.zoom
  ).toBe(1);
});

it('backs out of cover cropping to include the recorded rectangle and separate click', () => {
  const slide = fixture();
  slide.fit = 'cover';
  slide.image!.width = 100;
  slide.hotspots[0]!.targetRect = { x: 0.1, y: 0.05, width: 0.8, height: 0.8 };
  slide.hotspots[0]!.point = { x: 0.5, y: 0.95 };
  const box = resolveTourCamera(slide, viewport, true)!;
  const target = slide.hotspots[0]!.targetRect;
  for (const point of [
    { x: target.x, y: target.y },
    { x: target.x + target.width, y: target.y + target.height },
    slide.hotspots[0]!.point,
  ]) {
    const x = box.x + point.x * box.width;
    const y = box.y + point.y * box.height;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(viewport.stageWidth);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(viewport.stageHeight);
  }
});
