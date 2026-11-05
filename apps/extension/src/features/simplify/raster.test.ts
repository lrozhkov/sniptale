// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Image as CanvasImage } from 'canvas';
import { afterEach, expect, it, vi } from 'vitest';
import { claimCompactGraphics } from './engine/compact-graphics.mjs';
import { createSimplifyRaster } from './raster';
import { createDefaultSimplifySettings } from './settings';

function canvas(width: number, height: number) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  const context = element.getContext('2d');
  if (!context) throw new Error('Test canvas is unavailable.');
  return { element, context };
}

function expectNoRetainedInk(
  source: Uint8ClampedArray,
  output: Uint8ClampedArray,
  background: readonly [number, number, number]
) {
  expect(output.length).toBe(source.length);
  let retained = 0;
  for (let i = 0; i < source.length; i += 4) {
    const contrast = Math.max(
      Math.abs((source[i] ?? 0) - background[0]),
      Math.abs((source[i + 1] ?? 0) - background[1]),
      Math.abs((source[i + 2] ?? 0) - background[2])
    );
    // Ignore sub-threshold antialias rounding, but preserve no visible original ink.
    if (
      contrast > 12 &&
      source.slice(i, i + 4).every((value, channel) => value === output[i + channel])
    )
      retained++;
  }
  expect(retained).toBe(0);
}

it('restores manual text background and removes ink outside the replacement stripe', () => {
  const source = canvas(120, 60);
  source.context.fillStyle = '#f5f5f5';
  source.context.fillRect(0, 0, 120, 60);
  source.context.fillStyle = '#202020';
  source.context.fillRect(18, 15, 60, 5);
  source.context.fillRect(18, 35, 60, 3);
  const image = source.context.getImageData(0, 0, 120, 60);
  const original = image.data.slice();
  const raster = createSimplifyRaster(image);
  const output = canvas(120, 60);
  raster.render(
    output.context,
    source.element,
    { x: 12, y: 12, width: 80, height: 28 },
    {
      ...createDefaultSimplifySettings(),
      automatic: false,
      manualKind: 'text',
      thickness: 0.35,
    }
  );
  expect([...output.context.getImageData(25, 16, 1, 1).data]).toEqual([245, 245, 245, 255]);
  expect([...output.context.getImageData(25, 36, 1, 1).data]).toEqual([245, 245, 245, 255]);
  expect([...output.context.getImageData(25, 25, 1, 1).data]).toEqual([184, 193, 205, 255]);
  expect(image.data).toEqual(original);
});

it('manual image fills exactly the selected rectangle without analysis', () => {
  const source = canvas(80, 40);
  source.context.fillStyle = '#ecede2';
  source.context.fillRect(0, 0, 80, 40);
  const output = canvas(80, 40);
  createSimplifyRaster(source.context.getImageData(0, 0, 80, 40)).render(
    output.context,
    source.element,
    { x: 10, y: 5, width: 50, height: 30 },
    { ...createDefaultSimplifySettings(), automatic: false, manualKind: 'image', color: '#405065' }
  );
  expect([...output.context.getImageData(11, 6, 1, 1).data]).toEqual([64, 80, 101, 255]);
  expect([...output.context.getImageData(9, 6, 1, 1).data]).toEqual([236, 237, 226, 255]);
});

it('rejects invalid pixel geometry, region and mismatched source before painting', () => {
  expect(() =>
    createSimplifyRaster({ width: -1, height: 1, data: new Uint8ClampedArray(4) })
  ).toThrow();
  expect(() =>
    createSimplifyRaster({ width: 2, height: 2, data: new Uint8ClampedArray(4) })
  ).toThrow();
  const source = canvas(8, 8);
  const raster = createSimplifyRaster(source.context.getImageData(0, 0, 8, 8));
  const output = canvas(8, 8);
  const settings = createDefaultSimplifySettings();
  expect(() =>
    raster.render(output.context, source.element, { x: 7, y: 0, width: 2, height: 1 }, settings)
  ).toThrow();
  expect(() =>
    raster.render(output.context, source.element, { x: 0.5, y: 0, width: 2, height: 1 }, settings)
  ).toThrow();
  expect(() =>
    raster.render(
      output.context,
      canvas(7, 8).element,
      { x: 0, y: 0, width: 2, height: 1 },
      settings
    )
  ).toThrow();
});

afterEach(() => vi.unstubAllGlobals());

it.each([10, 55, 90] as const)(
  'replaces uniform colored antialiased labels at sensitivity %s',
  (sensitivity) => {
    vi.stubGlobal('Image', CanvasImage);
    const image = new Image();
    image.src = `data:image/png;base64,${readFileSync(resolve('apps/extension/src/features/simplify/fixtures/antialiased-labels.png')).toString('base64')}`;
    const source = canvas(image.width, image.height);
    source.context.drawImage(image, 0, 0);
    const raster = createSimplifyRaster(
      source.context.getImageData(0, 0, image.width, image.height)
    );
    const output = canvas(image.width, image.height);
    raster.render(
      output.context,
      source.element,
      { x: 0, y: 0, width: image.width, height: image.height },
      {
        ...createDefaultSimplifySettings(),
        sensitivity,
        color: '#ff7f50',
      }
    );
    // These are the five authored fixture rows, independent of installed CI fonts.
    for (const [top, bottom] of [
      [0, 50],
      [60, 110],
      [120, 170],
      [180, 230],
      [240, 290],
    ]) {
      const pixels = output.context.getImageData(0, top!, image.width, bottom! - top!).data;
      let replacement = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i] === 255 && pixels[i + 1] === 127 && pixels[i + 2] === 80) replacement++;
      expect(replacement).toBeGreaterThan(100);
    }
    expectNoRetainedInk(
      source.context.getImageData(0, 0, image.width, image.height).data,
      output.context.getImageData(0, 0, image.width, image.height).data,
      [16, 20, 24]
    );
  }
);

it('keeps genuine colored interior texture uncertain beside a neutral text body', () => {
  const source = canvas(320, 60);
  source.context.fillStyle = '#101418';
  source.context.fillRect(0, 0, 320, 60);
  source.context.fillStyle = '#cccccc';
  source.context.font = '16px sans-serif';
  source.context.fillText('Text with colored interior support', 10, 36);
  source.context.fillStyle = '#00aaff';
  source.context.fillRect(120, 24, 4, 9);
  source.context.fillStyle = '#ff00ff';
  source.context.fillRect(124, 24, 5, 9);
  const result = claimCompactGraphics(
    source.context.getImageData(0, 0, 320, 60),
    [
      {
        x: 8,
        y: 20,
        w: 270,
        h: 22,
        bg: [16, 20, 24],
        shape: 'text',
        typeMetrics: { xHeight: 8 },
      },
    ],
    () => ({ xHeight: 8 })
  );
  expect(result).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        shape: 'unknown',
        roleEvidence: 'uncertain-color-texture',
      }),
    ])
  );
});

it.each([10, 55, 90] as const)(
  'recovers faintly connected glyphs at sensitivity %s',
  (sensitivity) => {
    const source = canvas(260, 110);
    source.context.fillStyle = '#222222';
    source.context.fillRect(0, 0, 260, 110);
    source.context.fillStyle = '#a7a7a7';
    for (let i = 0; i < 10; i++) {
      const left = 40 + i * 16;
      const top = i === 6 || i === 7 ? 54 : 48;
      source.context.fillRect(left, top, 2, 60 - top);
      source.context.fillRect(left + 8, top, 2, 60 - top);
      source.context.fillRect(left, top + Math.floor((60 - top) / 2), 10, 2);
    }
    source.context.strokeStyle = '#626262';
    source.context.lineWidth = 1;
    source.context.beginPath();
    source.context.moveTo(40, 59.5);
    source.context.lineTo(129, 59.5);
    source.context.stroke();
    const raster = createSimplifyRaster(source.context.getImageData(0, 0, 260, 110));
    const output = canvas(260, 110);
    raster.render(
      output.context,
      source.element,
      { x: 0, y: 0, width: 260, height: 110 },
      {
        ...createDefaultSimplifySettings(),
        sensitivity,
        color: '#ff7f50',
      }
    );
    const pixels = output.context.getImageData(0, 0, 260, 110).data;
    let replacement = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i] === 255 && pixels[i + 1] === 127 && pixels[i + 2] === 80) replacement++;
    expect(replacement).toBeGreaterThan(1000);
    expectNoRetainedInk(source.context.getImageData(0, 0, 260, 110).data, pixels, [34, 34, 34]);
  }
);

it.each([36, 40])(
  'keeps a compound outline of size %s intact in text mode and simplifies it in All',
  (size) => {
    const source = canvas(220, 150);
    const context = source.context;
    context.fillStyle = '#222222';
    context.fillRect(0, 0, 220, 150);
    context.strokeStyle = '#999999';
    context.fillStyle = '#999999';
    context.lineWidth = size * 0.085;
    context.lineJoin = 'round';
    const left = 80,
      top = 48;
    context.strokeRect(left, top, size, size);
    context.beginPath();
    context.moveTo(left + size * 0.4, top);
    context.lineTo(left + size * 0.4, top + size);
    context.moveTo(left, top + size * 0.7);
    context.lineTo(left + size, top + size * 0.7);
    context.stroke();
    context.fillRect(left + size * 0.58, top + size * 0.2, size * 0.12, size * 0.25);
    context.fillRect(left + size * 0.8, top + size * 0.2, size * 0.1, size * 0.25);
    const pixels = context.getImageData(0, 0, 220, 150);
    const raster = createSimplifyRaster(pixels);
    const output = canvas(220, 150);
    const region = { x: 0, y: 0, width: 220, height: 150 };
    const settings = {
      ...createDefaultSimplifySettings(),
      sensitivity: 90 as const,
      color: '#ff7f50',
    };
    raster.render(output.context, source.element, region, settings);
    expect(output.context.getImageData(0, 0, 220, 150).data).toEqual(pixels.data);
    raster.render(output.context, source.element, region, { ...settings, content: 'all' });
    const all = output.context.getImageData(0, 0, 220, 150).data;
    let replacement = 0;
    for (let i = 0; i < all.length; i += 4)
      if (all[i] === 255 && all[i + 1] === 127 && all[i + 2] === 80) replacement++;
    expect(replacement).toBeGreaterThan(500);
  }
);
