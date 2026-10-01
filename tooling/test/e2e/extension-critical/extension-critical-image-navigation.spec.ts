import { expect, test } from '@playwright/test';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';
import { startHostServer } from '../support/host-server';

for (const variant of [
  { locale: 'ru', theme: 'light' },
  { locale: 'en', theme: 'dark' },
] as const) {
  for (const dimensions of [
    { width: 3200, height: 400 },
    { width: 400, height: 3200 },
    { width: 1600, height: 1600 },
  ]) {
    test(`canvas navigation fits and maps ${dimensions.width}/${dimensions.height} at HD ${variant.locale}/${variant.theme}`, async ({
      page,
    }, testInfo) => {
      const host = await startHostServer();
      try {
        await page.setViewportSize({ width: 1280, height: 720 });
        await applyHarnessBootstrap(page, {
          storage: {
            'sniptale-locale-preference': variant.locale,
            'sniptale-theme-preference': variant.theme,
          },
        });
        await page.addInitScript(
          ({ locale, width, height }) => {
            localStorage.setItem('sniptale-locale-preference', locale);
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d')!;
            context.fillStyle = '#2f5fd0';
            context.fillRect(0, 0, width, height);
            window.__sniptaleHarnessBootstrap = {
              ...window.__sniptaleHarnessBootstrap,
              editorBootstrapPayload: {
                dataUrl: canvas.toDataURL('image/png'),
                title: 'Navigation proof',
                url: 'https://example.com/navigation',
              },
            };
          },
          { locale: variant.locale, ...dimensions }
        );
        await page.goto(`${host.origin}${EDITOR_HARNESS_PATH}?theme=${variant.theme}`);
        await expect
          .poll(() =>
            page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
          )
          .toBeGreaterThan(0);
        const ui = (value: string) => page.locator(`[data-ui="${value}"]`);
        await ui('editor.floating.view-controls.map').click();
        const surface = ui('editor.viewport-preview.surface');
        const document = ui('editor.viewport-preview.document');
        const frame = ui('editor.viewport-preview.frame');
        const popup = ui('editor.floating.view-controls.popover.map');
        const pixels = () =>
          surface.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
            const rgba = canvas
              .getContext('2d')!
              .getImageData(0, 0, canvas.width, canvas.height).data;
            let left = canvas.width,
              top = canvas.height,
              right = -1,
              bottom = -1;
            for (let y = 0; y < canvas.height; y++)
              for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if (
                  Math.abs(rgba[i]! - 47) < 8 &&
                  Math.abs(rgba[i + 1]! - 95) < 8 &&
                  Math.abs(rgba[i + 2]! - 208) < 8 &&
                  rgba[i + 3]! > 220
                ) {
                  left = Math.min(left, x);
                  right = Math.max(right, x);
                  top = Math.min(top, y);
                  bottom = Math.max(bottom, y);
                }
              }
            return { width: right - left + 1, height: bottom - top + 1 };
          });
        await expect.poll(async () => (await pixels()).width).toBeGreaterThan(0);
        const blue = await pixels();
        expect(
          Math.abs(blue.width / blue.height - dimensions.width / dimensions.height)
        ).toBeLessThanOrEqual((2 * (1 + dimensions.width / dimensions.height)) / blue.height);
        const surfaceBox = (await surface.boundingBox())!;
        const documentBox = (await document.boundingBox())!;
        const popupBox = (await popup.boundingBox())!;
        expect(
          Math.abs(documentBox.x + documentBox.width / 2 - (surfaceBox.x + surfaceBox.width / 2))
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(documentBox.y + documentBox.height / 2 - (surfaceBox.y + surfaceBox.height / 2))
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(surfaceBox.x + surfaceBox.width / 2 - (popupBox.x + popupBox.width / 2))
        ).toBeLessThanOrEqual(1);
        await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(2));
        await surface.focus();
        await surface.press('Home');
        const viewport = ui('editor.canvas.viewport');
        const axis = dimensions.width >= dimensions.height ? 'scrollLeft' : 'scrollTop';
        const initialScroll = await viewport.evaluate((node, key) => node[key], axis);
        await surface.click({
          position: {
            x: documentBox.x - surfaceBox.x + documentBox.width * 0.75,
            y: documentBox.y - surfaceBox.y + documentBox.height * 0.75,
          },
        });
        await expect
          .poll(() => viewport.evaluate((node, key) => node[key], axis))
          .toBeGreaterThan(initialScroll);
        const movedFrame = (await frame.boundingBox())!;
        expect(movedFrame.x).toBeGreaterThanOrEqual(documentBox.x - 1);
        expect(movedFrame.y).toBeGreaterThanOrEqual(documentBox.y - 1);
        expect(movedFrame.x + movedFrame.width).toBeLessThanOrEqual(
          documentBox.x + documentBox.width + 1
        );
        expect(movedFrame.y + movedFrame.height).toBeLessThanOrEqual(
          documentBox.y + documentBox.height + 1
        );
        expect((await document.boundingBox())!).toEqual(documentBox);
        await page.mouse.move(
          documentBox.x + documentBox.width * 0.5,
          documentBox.y + documentBox.height * 0.5
        );
        await page.mouse.down();
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(surface).toHaveCount(0);
        await ui('editor.floating.view-controls.map').click();
        await expect.poll(async () => (await pixels()).width).toBeGreaterThan(0);
        await surface.focus();
        await surface.press('Home');
        await expect
          .poll(() => viewport.evaluate((node, key) => node[key], axis))
          .toBeCloseTo(initialScroll, 0);
        const reopenedScroll = await viewport.evaluate((node, key) => node[key], axis);
        await surface.dispatchEvent('pointermove', {
          pointerId: 1,
          clientX: documentBox.x + documentBox.width,
          clientY: documentBox.y + documentBox.height,
        });
        expect(await viewport.evaluate((node, key) => node[key], axis)).toBe(reopenedScroll);
        await page.screenshot({ path: testInfo.outputPath('canvas-navigation-HD.png') });
      } finally {
        await new Promise<void>((resolve, reject) =>
          host.server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    });
  }
}
