import { execFileSync } from 'node:child_process';
import { createCanvas, loadImage } from 'canvas';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`live blur beyond viewport edges has no compositor fringe ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    test.skip(
      process.env['SNIPTALE_NATIVE_COMPOSITOR_PROOF'] !== '1',
      'Requires an X11 desktop and ImageMagick import'
    );
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await page.evaluate(() => {
        document.documentElement.style.background = '#101418';
        document.body.style.background = '#101418';
        document.body.style.minHeight = '200vh';
        for (const child of document.body.children) {
          if (child instanceof HTMLElement && !child.shadowRoot) child.style.visibility = 'hidden';
        }
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      await page.locator('[data-ui="content.toolbar.drawing.blur"]').click();
      await page.locator('[data-ui="content.toolbar.drawing.blur"]').click();
      const width = await page.evaluate(() => document.documentElement.clientWidth);
      await page.mouse.move(0, 70);
      await page.mouse.down();
      await page.mouse.move(width - 1, size.height - 1, { steps: 12 });
      await page.mouse.up();
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.move(600, 300);
      await page.mouse.down();
      await page.mouse.move(650, 200, { steps: 12 });
      await page.mouse.up();
      await page.mouse.click(10, size.height - 10);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const path = info.outputPath('native-compositor.png');
      execFileSync('import', ['-window', 'root', path]);
      const image = await loadImage(path);
      const canvas = createCanvas(image.width, image.height);
      const pixels = canvas.getContext('2d');
      pixels.drawImage(image, 0, 0);
      const raster = pixels.getImageData(0, 0, image.width, image.height);
      let origin: { x: number; y: number } | null = null;
      for (let index = 0; index < raster.data.length; index += 4) {
        if (
          raster.data[index] === 16 &&
          raster.data[index + 1] === 20 &&
          raster.data[index + 2] === 24
        ) {
          origin = {
            x: (index / 4) % image.width,
            y: Math.floor(index / 4 / image.width),
          };
          break;
        }
      }
      expect(
        origin,
        'native screenshot must include the unfiltered viewport origin'
      ).not.toBeNull();
      for (const point of [
        { x: width - 4, y: 220 },
        { x: width - 16, y: 180 },
        { x: 100, y: 4 },
      ]) {
        const color = [...pixels.getImageData(origin!.x + point.x, origin!.y + point.y, 1, 1).data];
        for (const [index, expected] of [16, 20, 24].entries())
          expect(
            Math.abs(color[index]! - expected),
            `native edge ${JSON.stringify(point)}`
          ).toBeLessThanOrEqual(2);
      }
      await page.screenshot({ path: info.outputPath('browser-capture.png'), fullPage: false });
    } finally {
      await popup.close();
      await page.close();
    }
  });
}
