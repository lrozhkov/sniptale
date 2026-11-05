import type { Page } from '@playwright/test';
import { expect } from '../support/extension-fixture';

export async function dragSimplify(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

export async function waitForSimplify(page: Page) {
  await expect(page.locator('[data-ui="content.drawing.simplify-private"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="content.drawing.simplify-pending"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="content.drawing.simplify-feedback"]')).toHaveCount(0);
}

export async function readSimplifyStripes(page: Page) {
  const png = await page.screenshot({
    clip: { x: 460, y: 190, width: 320, height: 120 },
    fullPage: false,
    animations: 'disabled',
  });
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Stripe proof canvas missing');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    return [
      [8, 34],
      [36, 62],
      [64, 96],
    ].map(([first, last]) => {
      let longest = 0;
      for (let y = first!; y < last!; y++) {
        let run = 0;
        for (let x = 0; x < image.width; x++) {
          const offset = (y * image.width + x) * 4;
          const red = pixels[offset]!,
            green = pixels[offset + 1]!,
            blue = pixels[offset + 2]!;
          if (
            red >= 100 &&
            red <= 220 &&
            Math.max(red, green, blue) - Math.min(red, green, blue) <= 40
          ) {
            run++;
            longest = Math.max(longest, run);
          } else run = 0;
        }
      }
      return longest;
    });
  }, png.toString('base64'));
}

export async function readSimplifyGlyph(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
  visibleBounds?: { x: number; y: number; width: number; height: number }
) {
  // The capped glyph is central; exclude antialiased selection edges from its pixel bounds.
  const sampleWidth = Math.min(64, clip.width - 16);
  const sampleHeight = Math.min(64, clip.height - 16);
  const center = {
    x: clip.x + (clip.width - sampleWidth) / 2,
    y: clip.y + (clip.height - sampleHeight) / 2,
    width: sampleWidth,
    height: sampleHeight,
  };
  // Editor masks can extend beyond the clipped raster viewport; measure only visible pixels.
  const left = visibleBounds ? Math.max(center.x, visibleBounds.x) : center.x;
  const top = visibleBounds ? Math.max(center.y, visibleBounds.y) : center.y;
  const right = visibleBounds
    ? Math.min(center.x + center.width, visibleBounds.x + visibleBounds.width)
    : center.x + center.width;
  const bottom = visibleBounds
    ? Math.min(center.y + center.height, visibleBounds.y + visibleBounds.height)
    : center.y + center.height;
  const sample = { x: left, y: top, width: right - left, height: bottom - top };
  if (sample.width <= 0 || sample.height <= 0)
    throw new Error('Glyph is outside the visible raster viewport');
  const png = await page.screenshot({ clip: sample, fullPage: false, animations: 'disabled' });
  return page.evaluate(async (encoded) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Glyph proof canvas missing');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let left = image.width,
      top = image.height,
      right = -1,
      bottom = -1,
      count = 0,
      fill = 0;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const offset = (y * image.width + x) * 4;
        const red = pixels[offset]!,
          green = pixels[offset + 1]!,
          blue = pixels[offset + 2]!;
        if (Math.abs(red - 255) <= 6 && Math.abs(green - 127) <= 6 && Math.abs(blue - 80) <= 6)
          fill++;
        if (
          red >= 70 &&
          red <= 210 &&
          Math.max(red, green, blue) - Math.min(red, green, blue) <= 55
        ) {
          count++;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    return {
      count,
      width: count ? right - left + 1 : 0,
      height: count ? bottom - top + 1 : 0,
      fillFraction: fill / (image.width * image.height),
    };
  }, png.toString('base64'));
}
