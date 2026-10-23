import { expect, it } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { createTourImageSlide } from '../project/factories';
import { resolveTourImageFrame } from './image-frame';
import { resolveTourCamera, resolveTourFullViewCamera } from './camera';

function slide(width = 1600, height = 900) {
  const value = createTourImageSlide('image');
  value.image = {
    assetId: 'image',
    galleryAssetId: null,
    editDocumentId: null,
    width,
    height,
    alt: '',
    source: { kind: 'import', filename: 'image.png' },
  };
  value.camera.mode = 'off';
  return value;
}
it('fits header and source together in portrait, wide and landscape windows', () => {
  for (const dimensions of [
    [900, 1600],
    [1600, 900],
    [2400, 900],
  ]) {
    const image = slide(dimensions[0], dimensions[1]);
    for (const kind of ['browser', 'application'] as const) {
      const viewport = {
        stageWidth: 640,
        stageHeight: 360,
        windowHeader: { ...DEFAULT_WINDOW_HEADER, kind },
      };
      const frame = resolveTourImageFrame(image, viewport);
      const box = resolveTourCamera(image, viewport, false)!;
      expect(frame.header!.height).toBeGreaterThan(0);
      expect(frame.content.y).toBeCloseTo(frame.header!.y + frame.header!.height);
      expect(frame.window.x).toBeGreaterThanOrEqual(0);
      expect(frame.window.y).toBeGreaterThanOrEqual(0);
      expect(frame.window.x + frame.window.width).toBeLessThanOrEqual(640.0001);
      expect(frame.window.y + frame.window.height).toBeLessThanOrEqual(360.0001);
      expect(box.x + box.width / 2).toBeCloseTo(frame.content.x + frame.content.width / 2);
      expect(box.y + box.height / 2).toBeCloseTo(frame.content.y + frame.content.height / 2);
      expect(box.width / box.height).toBeCloseTo(image.image!.width / image.image!.height);
    }
  }
});
it('keeps normalized bitmap targets aligned through placement, camera and full view', () => {
  const image = slide();
  const viewport = { stageWidth: 640, stageHeight: 360, windowHeader: DEFAULT_WINDOW_HEADER };
  image.imagePlacement = { center: { x: 0.3, y: 0.7 }, zoom: 2 };
  const before = structuredClone(image);
  const content = resolveTourImageFrame(image, viewport).content;
  const box = resolveTourCamera(image, viewport, false)!;
  expect(box.x + 0.3 * box.width).toBeCloseTo(content.x + content.width / 2);
  expect(box.y + 0.7 * box.height).toBeCloseTo(content.y + content.height / 2);
  image.camera = { ...image.camera, mode: 'manual', center: { x: 0.6, y: 0.4 }, zoom: 2 };
  const camera = resolveTourCamera(image, viewport, false)!;
  expect(camera.x + 0.6 * camera.width).toBeCloseTo(content.x + content.width / 2);
  expect(camera.width).toBeCloseTo(box.width * 2);
  const full = resolveTourFullViewCamera(image, viewport)!;
  expect(full.width / full.height).toBeCloseTo(image.image!.width / image.image!.height);
  expect(full.width).toBeLessThanOrEqual(content.width);
  expect(full.height).toBeLessThanOrEqual(content.height);
  expect(image.imagePlacement).toEqual(before.imagePlacement);
  expect(image.image).toEqual(before.image);
});
it('keeps the existing full-stage projection when a legacy tour has no header', () => {
  const image = slide();
  const viewport = { stageWidth: 640, stageHeight: 360 };
  expect(resolveTourImageFrame(image, viewport)).toEqual({
    window: { x: 0, y: 0, width: 640, height: 360 },
    content: { x: 0, y: 0, width: 640, height: 360 },
    header: null,
  });
});

it('makes Fit and Fill distinct inside a stage-aspect window without changing source data', () => {
  const image = slide();
  const before = structuredClone(image.image);
  const viewport = { stageWidth: 640, stageHeight: 360, windowHeader: DEFAULT_WINDOW_HEADER };
  const fit = resolveTourCamera(image, viewport, false)!;
  image.fit = 'cover';
  const fill = resolveTourCamera(image, viewport, false)!;
  const content = resolveTourImageFrame(image, viewport).content;
  expect(fill.width).toBeGreaterThan(fit.width);
  expect(fill.height).toBeGreaterThan(content.height);
  expect(fit.height).toBeCloseTo(content.height);
  expect(image.image).toEqual(before);
});
