import { readFile } from 'node:fs/promises';
import { expect, test } from '../support/extension-fixture';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

test('annotations and drawing work on an untrusted HTTP origin', async ({
  context,
  extensionId,
}, info) => {
  const origin = 'http://sniptale-http.test';
  const body = await readFile('tooling/test/e2e/fixtures/host-page.html', 'utf8');
  await context.route(`${origin}/**`, (route) => route.fulfill({ contentType: 'text/html', body }));
  const errors: string[] = [];
  const observePage = (page: import('@playwright/test').Page) => {
    page.on('pageerror', (error) => errors.push(error.message));
  };
  context.on('page', observePage);
  const { page, popup } = await openDesignReview(context, extensionId, origin);
  try {
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
    await page
      .getByRole('button', { name: /^(Add comment|Добавить комментарий)$/u })
      .first()
      .click();
    const comment = page.locator('.sniptale-callout [contenteditable="true"]').last();
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
    const before = await pixels();
    await page.mouse.move(580, 330);
    await page.mouse.down();
    await page.mouse.move(750, 410, { steps: 10 });
    await page.mouse.up();
    await expect.poll(pixels).not.toBe(before);
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
