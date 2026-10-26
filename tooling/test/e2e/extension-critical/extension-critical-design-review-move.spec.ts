import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Object move follows pointer under ancestor scale at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    const target = page.locator('#measurement-target');
    await page.evaluate(() => {
      const target = document.getElementById('measurement-target')!;
      target.parentElement!.style.transform = 'scale(1.5)';
      target.parentElement!.style.transformOrigin = '0 0';
      target.style.transform = 'rotate(12deg)';
    });
    await page.locator('[data-ui="content.toolbar.review-tool.move"]').click();
    const before = (await target.boundingBox())!;
    await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
    await expect(target).toHaveCSS('translate', 'none');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 24, before.y + before.height / 2 + 12, {
      steps: 3,
    });
    await page.mouse.up();
    const after = (await target.boundingBox())!;
    expect(Math.abs(after.x - before.x - 24)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(after.y - before.y - 12)).toBeLessThanOrEqual(0.5);
    await expect(target).toHaveCSS('translate', '16px 8px');
    const hud = page.locator('[data-ui="content.design-review.move-hud"]');
    await expect(hud).toBeVisible();
    await expect(page.locator('[data-ui="content.design-review.tool-panel"]')).toBeHidden();
    await page.screenshot({ path: info.outputPath('object-move.png'), fullPage: false });
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(target).toHaveCSS('translate', 'none');
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect(target).toHaveCSS('translate', '16px 8px');
    const handle = hud.locator('[data-ui="content.design-review.move-element"]');
    await handle.focus();
    await handle.press('ArrowRight');
    await handle.press('Shift+ArrowDown');
    await expect(target).toHaveCSS('translate', '17px 18px');
    const start = (await target.boundingBox())!;
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 30, start.y + start.height / 2 + 15, {
      steps: 3,
    });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(target).toHaveCSS('translate', '17px 18px');
    await expect(page.locator('[data-ui="content.toolbar.review-tool.move"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const bounds = (await hud.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(64);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.size.width);
    await popup.close();
    await page.close();
  });
}

test('Object move uses current 2D transforms and zoom without accumulating viewport drift', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  const target = page.locator('#measurement-target');
  await page.locator('[data-ui="content.toolbar.review-tool.move"]').click();
  const start = (await target.boundingBox())!;
  await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
  for (const style of [
    'transform:rotate(20deg) scale(1.2,.8)',
    'rotate:20deg;scale:1.2 .8',
    'zoom:1.25',
    'transform:scale(-1,1);transform-origin:200px 0',
  ]) {
    await page.evaluate((value) => {
      const target = document.getElementById('measurement-target')!;
      target.parentElement!.style.cssText =
        'position:absolute;left:100px;top:260px;width:400px;height:240px;' +
        `transform-origin:0 0;${value}`;
    }, style);
    const before = (await target.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 18, before.y + before.height / 2 + 9, {
      steps: 3,
    });
    await page.mouse.up();
    const after = (await target.boundingBox())!;
    expect(Math.abs(after.x - before.x - 18)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(after.y - before.y - 9)).toBeLessThanOrEqual(0.5);
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect(target).toHaveCSS('translate', 'none');
  }
  await popup.close();
  await page.close();
});

test('Object move converts a scaled accessible iframe to its local translate units', async ({
  context,
  extensionId,
  hostOrigin,
}) => {
  const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, {
    width: 1280,
    height: 560,
  });
  const frame = page.locator('iframe').first();
  await frame.evaluate((element) => {
    if (!(element instanceof HTMLIFrameElement) || !element.contentDocument)
      throw new Error('Fixture iframe unavailable');
    const button = element.contentDocument.createElement('button');
    button.id = 'frame-move-target';
    button.textContent = 'Move in frame';
    button.style.cssText = 'position:absolute;left:20px;top:60px;width:120px;height:36px';
    element.contentDocument.body.append(button);
  });
  const target = page.frameLocator('iframe').first().locator('#frame-move-target');
  await page.locator('[data-ui="content.toolbar.review-tool.move"]').click();
  const initial = (await target.boundingBox())!;
  await page.mouse.click(initial.x + initial.width / 2, initial.y + initial.height / 2);
  await frame.evaluate((element) => {
    if (!(element instanceof HTMLIFrameElement)) throw new Error('Fixture iframe unavailable');
    element.style.transformOrigin = '0 0';
    element.style.transform = 'scale(1.25)';
  });
  const before = (await target.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 20, before.y + before.height / 2 + 10, {
    steps: 3,
  });
  await page.mouse.up();
  await expect(target).toHaveCSS('translate', '16px 8px');
  const after = (await target.boundingBox())!;
  expect(Math.abs(after.x - before.x - 20)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.y - before.y - 10)).toBeLessThanOrEqual(0.5);
  await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
  await expect(target).toHaveCSS('translate', 'none');
  await popup.close();
  await page.close();
});
