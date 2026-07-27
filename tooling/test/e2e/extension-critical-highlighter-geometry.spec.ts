import { expect, test } from './support/extension-fixture';

const HARNESS_PATH = '/tooling/test/harness/highlighter-geometry.html';
const ZOOM_LEVELS = [80, 100, 125, 200] as const;

type Rect = { x: number; y: number; width: number; height: number };

function expectRectClose(actual: Rect, expected: Rect, tolerance: number): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(tolerance);
}

for (const zoomPercent of ZOOM_LEVELS) {
  test(`highlighter layers share canonical geometry at ${zoomPercent}% zoom`, async ({
    page,
    hostOrigin,
  }) => {
    await page.setViewportSize({ width: 1040, height: 900 });
    await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=${zoomPercent}`, {
      waitUntil: 'domcontentloaded',
    });
    const cases = page.locator('[data-ui="geometry-case"]');
    await expect(cases).toHaveCount(8);
    const scale = zoomPercent / 100;
    const tolerance = Math.max(0.5, 1 / (await page.evaluate(() => window.devicePixelRatio || 1)));

    for (let index = 0; index < 8; index += 1) {
      const testCase = cases.nth(index);
      const frameRect = await testCase.locator('[data-layer="frame"]').boundingBox();
      const fillRect = await testCase.locator('[data-layer="fill"]').boundingBox();
      const strokeRect = await testCase.locator('[data-layer="stroke"]').boundingBox();
      expect(frameRect).not.toBeNull();
      expect(fillRect).not.toBeNull();
      expect(strokeRect).not.toBeNull();
      expectRectClose(fillRect!, frameRect!, tolerance * scale);
      expectRectClose(strokeRect!, frameRect!, tolerance * scale);

      const effect = testCase.locator('[data-layer="effect"]');
      if ((await effect.count()) > 0) {
        const effectRect = await effect.boundingBox();
        expect(effectRect).not.toBeNull();
        expectRectClose(effectRect!, frameRect!, tolerance * scale);
      }

      const northwest = await testCase
        .locator('[data-layer="handle"][data-direction="nw"]')
        .boundingBox();
      const southeast = await testCase
        .locator('[data-layer="handle"][data-direction="se"]')
        .boundingBox();
      expect(northwest).not.toBeNull();
      expect(southeast).not.toBeNull();
      expect(Math.abs(northwest!.x + northwest!.width / 2 - frameRect!.x)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(Math.abs(northwest!.y + northwest!.height / 2 - frameRect!.y)).toBeLessThanOrEqual(
        tolerance * scale
      );
      expect(
        Math.abs(southeast!.x + southeast!.width / 2 - (frameRect!.x + frameRect!.width))
      ).toBeLessThanOrEqual(tolerance * scale);
      expect(
        Math.abs(southeast!.y + southeast!.height / 2 - (frameRect!.y + frameRect!.height))
      ).toBeLessThanOrEqual(tolerance * scale);
    }
  });
}

test('viewer capture keeps the thick inward stroke on the canonical surface', async ({
  page,
  hostOrigin,
}) => {
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const capture = page.locator('[data-ui="geometry-viewer-capture"]');
  await expect(capture).toBeVisible();

  const scan = await capture.evaluate((image: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Viewer parity scan canvas is unavailable.');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (pixels[offset]! > 245 && pixels[offset + 1]! < 10 && pixels[offset + 2]! > 245) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const surface = image.dataset['surface']!.split(',').map(Number);
    return {
      bounds: { minX, minY, maxX, maxY },
      dpr: image.naturalWidth / image.width,
      surface,
    };
  });

  const [x, y, width, height] = scan.surface;
  const tolerance = Math.max(0.5, 1 / scan.dpr);
  expect(Math.abs(scan.bounds.minX / scan.dpr - x!)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(scan.bounds.minY / scan.dpr - y!)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs((scan.bounds.maxX + 1) / scan.dpr - (x! + width!))).toBeLessThanOrEqual(
    tolerance
  );
  expect(Math.abs((scan.bounds.maxY + 1) / scan.dpr - (y! + height!))).toBeLessThanOrEqual(
    tolerance
  );
});

test('thick frame, effect, and fill matrix matches the visual baseline', async ({
  page,
  hostOrigin,
}) => {
  await page.setViewportSize({ width: 520, height: 760 });
  await page.goto(`${hostOrigin}${HARNESS_PATH}?zoom=100`, { waitUntil: 'domcontentloaded' });
  const matrix = page.locator('[data-ui="geometry-matrix"]');
  await expect(matrix).toBeVisible();
  await expect(matrix).toHaveScreenshot('highlighter-geometry-matrix.png', {
    animations: 'disabled',
  });
});
