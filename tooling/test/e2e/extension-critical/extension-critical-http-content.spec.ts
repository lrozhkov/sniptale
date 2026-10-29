import { readFile } from 'node:fs/promises';
import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`annotations and drawing work on an untrusted HTTP origin ${name}`, async ({
    context,
    extensionId,
  }, info) => {
    const origin = 'http://sniptale-http.test';
    const body = await readFile('tooling/test/e2e/fixtures/host-page.html', 'utf8');
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({ contentType: 'text/html', body })
    );
    const errors: string[] = [];
    const observePage = (page: import('@playwright/test').Page) => {
      page.on('pageerror', (error) => errors.push(error.message));
    };
    context.on('page', observePage);
    const { page, popup } = await openDesignReview(context, extensionId, origin, size);
    try {
      page.setDefaultTimeout(8000);
      expect(
        await page.evaluate(() => ({
          secure: isSecureContext,
          uuid: typeof crypto.randomUUID,
          randomValues: typeof crypto.getRandomValues,
        }))
      ).toEqual({ secure: false, uuid: 'undefined', randomValues: 'function' });
      const switchMode = async (mode: string) => {
        await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
        await page.locator(`[data-ui="content.toolbar.mode-option.${mode}"]`).click();
      };
      await switchMode('highlighter');
      const target = (await page.locator('#measurement-target').boundingBox())!;
      await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
      await expect(page.locator('.sniptale-frame-container')).toHaveCount(1);
      const frameTrigger = page.locator('.sniptale-frame-toolbar-trigger');
      await expect
        .poll(async () => {
          await page.mouse.move(target.x - 3, target.y + 10);
          return frameTrigger.isVisible();
        })
        .toBe(true);
      await frameTrigger.click();
      const annotationTools = page.locator(
        '.sniptale-action-toolbar .sniptale-annotation-menu-control'
      );
      await annotationTools.nth(0).locator('button').first().click();
      await annotationTools.nth(1).locator('button').last().click();
      const comment = page.locator('.sniptale-callout [contenteditable]').last();
      await comment.fill('HTTP annotation');
      await comment.press('Escape');
      await expect(page.locator('.sniptale-callout')).toContainText('HTTP annotation');
      await switchMode('drawing');
      await page.locator('[data-ui="content.toolbar.drawing.pencil"]').click();
      const canvas = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas[tabindex="0"]'
      );
      const pixels = () =>
        canvas.evaluate((element) => {
          if (!(element instanceof HTMLCanvasElement)) throw new Error('Expected drawing canvas');
          return element.toDataURL();
        });
      const annotationSurfaces = [
        page.locator('.sniptale-interactive-frame'),
        comment,
        page.locator('.sniptale-step-badge'),
      ];
      for (const surface of annotationSurfaces) {
        const box = (await surface.boundingBox())!;
        const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await expect
          .poll(() =>
            canvas.evaluate((node, point) => {
              const root = node.getRootNode() as ShadowRoot;
              return root.elementFromPoint(point.x, point.y) === node;
            }, point)
          )
          .toBe(true);
        const before = await pixels();
        await page.mouse.move(point.x, point.y);
        await page.mouse.down();
        await page.mouse.move(point.x + 40, point.y + 15, { steps: 5 });
        await page.mouse.up();
        await expect.poll(pixels).not.toBe(before);
      }
      await expect(comment).toContainText('HTTP annotation');
      await switchMode('highlighter');
      await comment.dblclick();
      await comment.fill('Annotation still editable');
      await comment.press('Escape');
      await expect(comment).toContainText('Annotation still editable');
      await page.screenshot({
        path: info.outputPath('http-annotation-and-drawing.png'),
        fullPage: false,
      });
      expect(errors).toEqual([]);
    } finally {
      context.off('page', observePage);
      await popup.close();
      await page.close();
      await context.unroute(`${origin}/**`);
    }
  });
}
