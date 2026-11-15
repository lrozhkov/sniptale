// @vitest-environment jsdom
import { isRasterSourcePointVisible } from './selection';
import { describe, expect, it } from 'vitest';
import { FabricImage, Group, Point, Rect, util } from 'fabric';
import {
  createBackgroundRasterGeometry,
  createNativeRasterGeometry,
  rasterCropBounds,
  rasterSourceToScene,
  sceneToRasterSource,
} from './coordinates';
import { resolveBackgroundRasterSize } from '../controller/background/raster';
import { getBackgroundImageLayout } from '../controller/background/geometry';

function image() {
  const source = document.createElement('canvas');
  source.width = 80;
  source.height = 60;
  return new FabricImage(source, {
    left: 23,
    top: 41,
    cropX: 12,
    cropY: 8,
    width: 36,
    height: 24,
    scaleX: 1.7,
    scaleY: 0.8,
    angle: 23,
    skewX: 9,
    skewY: 4,
  });
}

describe('native source projection', () => {
  it('preserves crop coordinates through rotation, skew, both flips, groups and viewport zoom', () => {
    for (const grouped of [false, true])
      for (const flipX of [false, true])
        for (const flipY of [false, true]) {
          const target = image();
          target.set({ flipX, flipY });
          const group = grouped
            ? new Group([target, new Rect({ left: 130, top: 70, width: 30, height: 20 })], {
                angle: 37,
                scaleX: 0.7,
                scaleY: 1.3,
                flipX: true,
                skewX: 7,
              })
            : null;
          const geometry = createNativeRasterGeometry(target, { width: 80, height: 60 });
          for (const zoom of [0.2, 1, 4])
            for (const source of [
              { x: 12.5, y: 8.5 },
              { x: 30, y: 20 },
              { x: 47.5, y: 31.5 },
            ]) {
              const expected = new Point(
                source.x - target.cropX - target.width / 2,
                source.y - target.cropY - target.height / 2
              ).transform(target.calcTransformMatrix());
              const viewport = [zoom, 0, 0, zoom, 77, 28] as const;
              const screen = expected.transform([...viewport]);
              const scene = screen.transform(util.invertTransform([...viewport]));
              const actual = sceneToRasterSource(geometry, scene);
              expect(actual.x).toBeCloseTo(source.x, 6);
              expect(actual.y).toBeCloseTo(source.y, 6);
              expect(rasterSourceToScene(geometry, source).x).toBeCloseTo(expected.x, 6);
              expect(rasterSourceToScene(geometry, source).y).toBeCloseTo(expected.y, 6);
            }
          expect(isRasterSourcePointVisible(geometry, { x: 11.5, y: 10 })).toBe(false);
          expect(isRasterSourcePointVisible(geometry, { x: 12.5, y: 8.5 })).toBe(true);
          group?.dispose();
          if (!group) target.dispose();
        }
  });

  it('keeps full-source positions stable after reversible crop changes', () => {
    const target = image();
    const before = createNativeRasterGeometry(target, { width: 80, height: 60 });
    const crop = { x: 4, y: 2, width: 70, height: 50 };
    const center = rasterSourceToScene(before, {
      x: crop.x + crop.width / 2,
      y: crop.y + crop.height / 2,
    });
    target.set({ cropX: crop.x, cropY: crop.y, width: crop.width, height: crop.height });
    target.setXY(new Point(center.x, center.y), 'center', 'center');
    const after = createNativeRasterGeometry(target, { width: 80, height: 60 });
    for (const point of [
      { x: 0, y: 0 },
      { x: 40, y: 30 },
      { x: 79, y: 59 },
    ]) {
      expect(rasterSourceToScene(after, point).x).toBeCloseTo(
        rasterSourceToScene(before, point).x,
        6
      );
      expect(rasterSourceToScene(after, point).y).toBeCloseTo(
        rasterSourceToScene(before, point).y,
        6
      );
    }
    target.dispose();
  });
});

it.each(['contain', 'cover', 'fit-width', 'fit-height', 'stretch', 'tile'] as const)(
  'maps %s through actual background raster geometry and document clip',
  (fit) => {
    const source = { width: 80, height: 60 };
    const bounds = { x: 13, y: 27, width: 6000, height: 3600 };
    for (const blurred of [false, true]) {
      const renderSize = blurred ? resolveBackgroundRasterSize(bounds) : bounds;
      const geometry = createBackgroundRasterGeometry({
        source,
        document: bounds,
        fit,
        renderSize,
      });
      const layout =
        fit === 'tile'
          ? { left: 0, top: 0, scaleX: 1, scaleY: 1 }
          : getBackgroundImageLayout(fit, renderSize, source);
      const sample = { x: 25, y: 32 };
      const scene = rasterSourceToScene(geometry, sample);
      expect(scene.x).toBeCloseTo(
        bounds.x + ((layout.left + sample.x * layout.scaleX) * bounds.width) / renderSize.width,
        6
      );
      expect(scene.y).toBeCloseTo(
        bounds.y + ((layout.top + sample.y * layout.scaleY) * bounds.height) / renderSize.height,
        6
      );
      expect(sceneToRasterSource(geometry, scene).x).toBeCloseTo(sample.x, 6);
      expect(
        isRasterSourcePointVisible(geometry, sceneToRasterSource(geometry, { x: 12, y: 27 }))
      ).toBe(false);
    }
  }
);

it('keeps tile gestures unwrapped and wraps only a pixel query, with flipped document coordinates', () => {
  const geometry = createBackgroundRasterGeometry({
    source: { width: 10, height: 8 },
    document: { x: 20, y: 30, width: 100, height: 80 },
    fit: 'tile',
    renderSize: { width: 50, height: 40 },
    flipX: true,
    flipY: true,
  });
  const sample = { x: 20.25, y: 16.5 };
  const scene = rasterSourceToScene(geometry, sample);
  expect(sceneToRasterSource(geometry, scene)).toEqual(sample);
  expect(sceneToRasterSource(geometry, scene, true)).toEqual({ x: 0.25, y: 0.5 });
  expect(isRasterSourcePointVisible(geometry, sample)).toBe(true);
});

it.each(['contain', 'cover', 'fit-width', 'fit-height', 'stretch', 'tile'] as const)(
  'maps a retained nonzero working crop through background %s and flips',
  (fit) => {
    const crop = { x: 12, y: 8, width: 36, height: 24 };
    const source = { width: 80, height: 60 };
    const bounds = { x: 13, y: 27, width: 6000, height: 3600 };
    const renderSize = resolveBackgroundRasterSize(bounds);
    const layout =
      fit === 'tile'
        ? { left: 0, top: 0, scaleX: 1, scaleY: 1 }
        : getBackgroundImageLayout(fit, renderSize, crop);
    for (const flipX of [false, true])
      for (const flipY of [false, true]) {
        const geometry = createBackgroundRasterGeometry({
          source,
          crop,
          document: bounds,
          fit,
          renderSize,
          flipX,
          flipY,
        });
        const sample = { x: 25, y: 17 };
        const scene = rasterSourceToScene(geometry, sample);
        const x =
          ((layout.left + (sample.x - crop.x) * layout.scaleX) * bounds.width) / renderSize.width;
        const y =
          ((layout.top + (sample.y - crop.y) * layout.scaleY) * bounds.height) / renderSize.height;
        expect(scene.x).toBeCloseTo(bounds.x + (flipX ? bounds.width - x : x), 6);
        expect(scene.y).toBeCloseTo(bounds.y + (flipY ? bounds.height - y : y), 6);
        expect(sceneToRasterSource(geometry, scene).x).toBeCloseTo(sample.x, 6);
        expect(sceneToRasterSource(geometry, scene).y).toBeCloseTo(sample.y, 6);
        if (fit === 'tile') {
          const beyond = rasterSourceToScene(geometry, {
            x: sample.x + crop.width,
            y: sample.y + crop.height,
          });
          expect(sceneToRasterSource(geometry, beyond, true).x).toBeCloseTo(sample.x, 6);
          expect(sceneToRasterSource(geometry, beyond, true).y).toBeCloseTo(sample.y, 6);
        }
      }
  }
);

it.each([false, true])(
  'rejects blank corners of an actually rotated managed tile with blur=%s',
  (blurred) => {
    const source = { width: 20, height: 12 };
    const crop = { x: 3, y: 2, width: 10, height: 8 };
    const bounds = { x: 0, y: 0, width: 100, height: 80 };
    const renderSize = blurred ? { width: 50, height: 40 } : undefined;
    const nativeObject = new Rect({
      width: blurred ? 50 : 100,
      height: blurred ? 40 : 80,
      left: 50,
      top: 40,
      originX: 'center',
      originY: 'center',
      angle: 45,
      scaleX: blurred ? 2 : 1,
      scaleY: blurred ? 2 : 1,
      strokeWidth: 0,
    });
    const geometry = createBackgroundRasterGeometry({
      source,
      crop,
      document: bounds,
      fit: 'tile',
      nativeObject,
      ...(renderSize ? { renderSize } : {}),
    });
    const blank = sceneToRasterSource(geometry, { x: 1, y: 1 });
    expect(isRasterSourcePointVisible(geometry, blank)).toBe(false);
    const visible = sceneToRasterSource(geometry, { x: 50, y: 40 });
    expect(isRasterSourcePointVisible(geometry, visible)).toBe(true);
    nativeObject.dispose();
  }
);

it.each(['contain', 'cover', 'fit-width', 'fit-height', 'stretch', 'tile'] as const)(
  'matches actual native %s render coordinates after rotation, skew, groups and flips',
  (fit) => {
    const crop = { x: 12, y: 8, width: 36, height: 24 };
    const source = { width: 80, height: 60 };
    const bounds = { x: 0, y: 0, width: 6000, height: 3600 };
    for (const blurred of [false, true])
      for (const flipX of [false, true]) {
        const raster = blurred ? resolveBackgroundRasterSize(bounds) : bounds;
        const layout =
          fit === 'tile'
            ? { left: 0, top: 0, scaleX: 1, scaleY: 1 }
            : getBackgroundImageLayout(fit, raster, crop);
        const bitmap = document.createElement('canvas');
        bitmap.width = blurred ? raster.width : crop.width;
        bitmap.height = blurred ? raster.height : crop.height;
        const object =
          !blurred && fit === 'tile'
            ? new Rect({
                width: raster.width,
                height: raster.height,
                originX: 'left',
                originY: 'top',
                strokeWidth: 0,
              })
            : new FabricImage(bitmap, { originX: 'left', originY: 'top', strokeWidth: 0 });
        if (blurred)
          object.set({
            scaleX: bounds.width / raster.width,
            scaleY: bounds.height / raster.height,
          });
        else if (fit !== 'tile') object.set(layout);
        object.set({ angle: 23, skewX: 7, skewY: 4, flipX, flipY: true });
        const group = new Group([object, new Rect({ left: 100, top: 70, width: 30, height: 20 })], {
          left: 33,
          top: 29,
          angle: 17,
          scaleX: 0.7,
          scaleY: 1.3,
        });
        const geometry = createBackgroundRasterGeometry({
          source,
          crop,
          document: bounds,
          fit,
          nativeObject: object,
          ...(blurred ? { renderSize: raster } : {}),
        });
        const sample = { x: 25, y: 17 };
        const rasterized = blurred || fit === 'tile';
        const local = new Point(
          (rasterized ? layout.left + (sample.x - crop.x) * layout.scaleX : sample.x - crop.x) -
            object.width / 2,
          (rasterized ? layout.top + (sample.y - crop.y) * layout.scaleY : sample.y - crop.y) -
            object.height / 2
        );
        const expected = local.transform(object.calcTransformMatrix());
        const actual = rasterSourceToScene(geometry, sample);
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
        expect(sceneToRasterSource(geometry, expected).x).toBeCloseTo(sample.x, 6);
        expect(sceneToRasterSource(geometry, expected).y).toBeCloseTo(sample.y, 6);
        group.dispose();
      }
  }
);

it('computes clamped integer source crop bounds with reversed corners and optional aspect ratios', () => {
  const size = { width: 80, height: 60 };
  const start = { x: 55.2, y: 48.8 },
    end = { x: 2.8, y: 3.2 };
  expect(rasterCropBounds(size, start, end, null)).toEqual({ x: 2, y: 3, width: 54, height: 46 });
  expect(rasterCropBounds(size, start, end, 1)).toEqual({ x: 10, y: 3, width: 46, height: 46 });
  expect(rasterCropBounds(size, start, end, 4 / 3)).toEqual({ x: 2, y: 9, width: 54, height: 40 });
  expect(rasterCropBounds(size, start, end, 16 / 9)).toEqual({
    x: 2,
    y: 19,
    width: 54,
    height: 30,
  });
  expect(rasterCropBounds(size, { x: -3, y: -4 }, { x: 100, y: 100 }, 80 / 60)).toEqual({
    x: 0,
    y: 0,
    width: 80,
    height: 60,
  });
  expect(rasterCropBounds(size, { x: 5, y: 5 }, { x: 5, y: 5 }, null)).toBeNull();
  expect(rasterCropBounds(size, { x: 5.5, y: 5.5 }, { x: 5.5, y: 5.5 }, null)).toBeNull();
  expect(start).toEqual({ x: 55.2, y: 48.8 });
  expect(end).toEqual({ x: 2.8, y: 3.2 });
});
