import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function inkAt(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (node, point) => {
      if (!(node instanceof HTMLCanvasElement)) throw new Error('Missing drawing canvas');
      const rect = node.getBoundingClientRect();
      const scale = node.width / rect.width;
      const data = node
        .getContext('2d')!
        .getImageData(
          Math.round((point.x - rect.x - 2) * scale),
          Math.round((point.y - rect.y - 2) * scale),
          Math.ceil(4 * scale),
          Math.ceil(4 * scale)
        ).data;
      return data.filter((channel, index) => index % 4 === 3 && channel > 80).length;
    },
    { x, y }
  );
}

async function drawShape(
  page: Page,
  kind: string,
  x: number,
  y: number,
  width: number,
  height: number
) {
  await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
  await page.mouse.click(1100, 480);
  const tool = page.locator('[data-ui="content.toolbar.drawing.shape"]');
  const option = page.locator(`[data-ui="content.toolbar.drawing-options.shape.kind-${kind}"]`);
  if ((await tool.getAttribute('aria-pressed')) !== 'true') await tool.click();
  if (!(await option.isVisible())) await tool.click();
  await option.click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + width, y + height, { steps: 5 });
  await expect(page.locator('[data-ui="content.drawing.alignment-guides"]')).toHaveCount(0);
  await page.mouse.up();
}

async function expectGuide(page: Page, axis: string, coordinate: number) {
  const guide = page.locator(`[data-ui="content.drawing.alignment-guides"] [data-axis="${axis}"]`);
  await expect(page.locator('[data-ui="content.drawing.alignment-guides"]')).toBeVisible();
  await expect(guide).toBeAttached();
  const attribute = axis === 'x' ? 'x1' : 'y1';
  await expect
    .poll(async () => Number(await guide.getAttribute(attribute)))
    .toBeCloseTo(coordinate, 0);
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page drawing aligns existing shapes and text ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await popup.evaluate(
        async (theme) => chrome.storage.local.set({ 'sniptale-theme-preference': theme }),
        size.width === 1280 ? 'light' : 'dark'
      );
      await page.evaluate(() => {
        const target = document.createElement('div');
        target.id = 'drawing-alignment-target';
        target.style.cssText =
          'position:absolute;left:600px;top:260px;width:160px;height:100px;background:#ddd;border-radius:8px';
        document.body.append(target);
      });
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      const ink = page.locator(
        '[data-ui="content.drawing.surface"] canvas.sniptale-drawing-canvas'
      );
      const guides = page.locator('[data-ui="content.drawing.alignment-guides"]');
      await drawShape(page, 'rectangle', 300, 160, 100, 60);
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(624, 264, { steps: 8 });
      await expectGuide(page, 'x', 600);
      await expectGuide(page, 'y', 260);
      await page.screenshot({ path: info.outputPath('dom-alignment.png'), fullPage: false });
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      await expect.poll(() => inkAt(ink, 600, 275)).toBeGreaterThan(0);
      await page.keyboard.press('Control+z');
      await expect.poll(() => inkAt(ink, 300, 175)).toBeGreaterThan(0);
      await expect.poll(() => inkAt(ink, 600, 275)).toBe(0);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(624, 264, { steps: 5 });
      await expect(guides).toBeVisible();
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await expect(guides).toHaveCount(0);
      await expect.poll(() => inkAt(ink, 300, 175)).toBeGreaterThan(0);
      await drawShape(page, 'rectangle', 800, 260, 200, 160);
      await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
      await page.mouse.move(320, 160);
      await page.mouse.down();
      await page.mouse.move(824, 264, { steps: 8 });
      await expectGuide(page, 'x', 800);
      await expectGuide(page, 'y', 260);
      await page.screenshot({ path: info.outputPath('neighbor-alignment.png'), fullPage: false });
      await page.mouse.up();
      await drawShape(page, 'ellipse', 500, 260, 200, 160);
      await drawShape(page, 'triangle', 250, 260, 200, 160);
      await expect.poll(() => inkAt(ink, 500, 340)).toBeGreaterThan(0);
      await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
      await page.mouse.click(420, 350);
      await page.locator('[data-ui="content.drawing.text-input"]').fill('Note');
      await page.keyboard.press('Enter');
      const text = page.locator('[data-ui="content.drawing.text-object"]');
      await expect(text).toContainText('Note');
      for (const target of [
        { kind: 'rectangle', x: 800, centerX: 900 },
        { kind: 'ellipse', x: 500, centerX: 600 },
        { kind: 'triangle', x: 250, centerX: 350 },
      ]) {
        await page.locator('[data-ui="content.toolbar.drawing.select"]').click();
        const before = (await text.boundingBox())!;
        await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
        await page.mouse.down();
        await page.mouse.move(target.centerX + 4, 343, { steps: 8 });
        await expectGuide(page, 'x', target.centerX);
        await expectGuide(page, 'y', 340);
        const preview = (await text.boundingBox())!;
        expect(Math.abs(preview.x + preview.width / 2 - target.centerX)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(preview.y + preview.height / 2 - 340)).toBeLessThanOrEqual(0.5);
        await page.screenshot({
          path: info.outputPath(`text-${target.kind}-center.png`),
          fullPage: false,
        });
        await page.mouse.up();
        await expect(guides).toHaveCount(0);
        if (target.kind === 'rectangle') {
          const centered = (await text.boundingBox())!;
          await page.mouse.move(target.centerX, 340);
          await page.mouse.down();
          await page.mouse.move(811 + centered.width / 2, 340, { steps: 6 });
          await expectGuide(page, 'x', 808);
          await page.mouse.up();
          expect(Math.abs((await text.boundingBox())!.x - 808)).toBeLessThanOrEqual(0.5);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await popup.close();
      await page.close();
    }
  });
}

async function readTextLines(element: Locator) {
  return element.evaluate((node) => {
    const content =
      node instanceof HTMLTextAreaElement
        ? node.parentElement!.querySelector('[data-ui="content.drawing.text-mirror"]')!
        : node.querySelector('span')!;
    const range = document.createRange();
    range.selectNodeContents(content);
    const origin = content.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    return {
      text: node instanceof HTMLTextAreaElement ? node.value : content.textContent,
      width: origin.width,
      usedWidth:
        Math.max(...rects.map((rect) => rect.right - origin.left)) +
        parseFloat(getComputedStyle(content).paddingRight),
      lines: rects.map((rect) => ({ width: rect.width, top: rect.top - origin.top })),
    };
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`page drawing fits committed text without changing line breaks ${name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
      await page.locator('[data-ui="content.toolbar.mode-option.drawing"]').click();
      for (const value of [
        'Hi',
        '          Hi',
        'Hi          ',
        'A longer first line\nShort\nFinal line',
        'First\n\nLast',
        'Wrapped words '.repeat(40).trim(),
      ]) {
        await page.locator('[data-ui="content.toolbar.drawing.text"]').click();
        await page.mouse.click(350, 180);
        const input = page.locator('[data-ui="content.drawing.text-input"]');
        await input.fill(value);
        await expect(input).toHaveValue(value);
        const before = await readTextLines(input);
        await page.keyboard.press('Enter');
        const text = page.locator('[data-ui="content.drawing.text-object"]').last();
        await expect(text).toBeVisible();
        const after = await readTextLines(text);
        expect(after.text).toBe(value.trim());
        if (value === value.trim()) expect(after.lines).toEqual(before.lines);
        else expect(after.lines).toHaveLength(1);
        expect(after.width - after.usedWidth).toBeGreaterThanOrEqual(0);
        expect(after.width - after.usedWidth).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath(`text-fit-${value.length}.png`),
          fullPage: false,
        });
        const box = (await text.boundingBox())!;
        await page.mouse.dblclick(box.x + 12, box.y + 12);
        await expect(input).toBeVisible();
        await input.fill('Cancelled edit');
        await page.keyboard.press('Escape');
        expect(await readTextLines(text)).toEqual(after);
        await page.keyboard.press('Control+z');
        await expect(page.locator('[data-ui="content.drawing.text-object"]')).toHaveCount(0);
      }
    } finally {
      await page.close();
      await popup.close();
    }
  });
}
