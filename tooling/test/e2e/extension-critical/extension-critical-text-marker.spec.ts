import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';

async function paintText(
  page: import('@playwright/test').Page,
  id: string,
  start: number,
  end: number
) {
  await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  const points = await page.evaluate(
    ({ id, start, end }) => {
      const root = document.getElementById(id)!;
      const position = (offset: number, trailing: boolean) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let remaining = offset;
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const length = node.textContent?.length ?? 0;
          if (remaining < length) {
            const range = document.createRange();
            range.setStart(node, remaining);
            range.setEnd(node, remaining + 1);
            const rect = range.getBoundingClientRect();
            return {
              x: trailing ? rect.right - 0.5 : rect.left + 0.5,
              y: rect.top + rect.height / 2,
            };
          }
          remaining -= length;
        }
        throw new Error('Native marker character is unavailable');
      };
      const first = position(start, false);
      const last = position(end - 1, true);
      return {
        first,
        last,
        unobstructed: [first, last].every((point) =>
          root.contains(document.elementFromPoint(point.x, point.y))
        ),
      };
    },
    { id, start, end }
  );
  expect(points.unobstructed).toBe(true);
  await page.mouse.move(points.first.x, points.first.y);
  await page.mouse.down();
  await page.mouse.move(points.last.x, points.last.y, { steps: 10 });
  await page.mouse.up();
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`Text markers select ranges, recolor, delete and replay at ${viewport.name}`, async ({
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
    await setup.evaluate(async (small) => {
      await chrome.storage.local.set({
        'sniptale-locale-preference': small ? 'ru' : 'en',
        'sniptale-theme-preference': small ? 'dark' : 'light',
      });
    }, viewport.name === '1280x560');
    await setup.close();
    const { page, popup } = await openDesignReview(context, extensionId, hostOrigin, viewport.size);
    if (viewport.name === '1920x900') {
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
      const vertical = page.getByRole('button', { name: /Vertical view|Вертикальный вид/u });
      if (!(await vertical.isVisible())) {
        await page
          .getByRole('button', { name: /Free toolbar placement|Свободное размещение/u })
          .click();
      }
      await vertical.click();
      await page.locator('[data-ui="content.toolbar.settings-button"]').click();
    }
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.quick-edit"]').click();
    await page.evaluate(
      (left) => {
        const text = document.createElement('p');
        text.id = 'marker-proof';
        text.style.cssText =
          `position:absolute;left:${left}px;top:170px;width:250px;font:24px/` +
          `36px Arial;color:#111;background:white`;
        text.append(
          'Marker ',
          Object.assign(document.createElement('strong'), { textContent: 'across inline' }),
          ' text on multiple lines for selection.'
        );
        document.body.append(text);
        const editable = document.createElement('p');
        editable.id = 'marker-whitespace-editable';
        editable.contentEditable = 'true';
        editable.textContent = ' ';
        editable.style.cssText = `position:absolute;left:${left}px;top:330px;width:120px;white-space:pre;font:24px/36px Arial`;
        document.body.append(editable);
      },
      viewport.name === '1280x560' ? 500 : 100
    );
    const source = await page.locator('#marker-proof').evaluate((node) => node.innerHTML);
    await expect(page.locator('[data-ui="content.toolbar.text-marker"]')).toHaveAccessibleName(
      viewport.name === '1280x560' ? 'Текстовый маркер' : 'Text marker'
    );
    await page.locator('[data-ui="content.toolbar.text-marker"]').click();
    const panel = page.locator('[data-ui="content.toolbar.text-marker-panel"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.lucide-plus')).toHaveCount(0);
    await expect(panel.locator('.lucide-list')).toHaveCount(0);
    const eraser = panel.locator('[data-ui="content.toolbar.text-marker-eraser"]');
    await expect(eraser).toBeVisible();
    const highlights = () => page.evaluate(() => CSS.highlights.size);
    await paintText(page, 'marker-whitespace-editable', 0, 1);
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect.poll(highlights).toBe(0);
    await paintText(page, 'marker-proof', 6, 7);
    await expect(panel.getByRole('alert')).toHaveCount(0);
    await expect.poll(highlights).toBe(0);
    await paintText(page, 'marker-proof', 0, 7);
    await expect.poll(highlights).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(CSS.highlights.values()).flatMap((highlight) =>
            Array.from(highlight).map((range) => (range instanceof Range ? range.toString() : null))
          )
        )
      )
      .toEqual(['Marker']);
    await page.screenshot({ path: info.outputPath('marker-trailing-space.png'), fullPage: false });
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect.poll(highlights).toBe(0);
    const paintedTexts = () =>
      page.evaluate(() =>
        Array.from(CSS.highlights.values()).flatMap((highlight) =>
          Array.from(highlight).map((range) => (range instanceof Range ? range.toString() : null))
        )
      );
    const undo = page.locator('[data-ui="content.toolbar.history-undo-button"]');
    await paintText(page, 'marker-proof', 6, 21);
    await expect.poll(paintedTexts).toEqual(['across inline']);
    await page.screenshot({
      path: info.outputPath('marker-both-edge-spaces.png'),
      fullPage: false,
    });
    await undo.click();
    await expect.poll(highlights).toBe(0);
    await paintText(page, 'marker-proof', 0, 6);
    await paintText(page, 'marker-proof', 7, 20);
    await expect.poll(paintedTexts).toEqual(['Marker', 'across inline']);
    await paintText(page, 'marker-proof', 6, 7);
    await expect.poll(paintedTexts).toEqual(['Marker across inline']);
    await page.screenshot({
      path: info.outputPath('marker-explicit-gap-joined.png'),
      fullPage: false,
    });
    await undo.click();
    await expect.poll(paintedTexts).toEqual(['Marker', 'across inline']);
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect.poll(paintedTexts).toEqual(['Marker across inline']);
    await undo.click();
    await undo.click();
    await undo.click();
    await expect.poll(highlights).toBe(0);
    await paintText(page, 'marker-proof', 0, 30);
    await expect.poll(highlights).toBe(1);
    await page.screenshot({ path: info.outputPath('marker-translucent.png'), fullPage: false });
    await panel.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await page.getByRole('textbox', { name: 'HEX', exact: true }).fill('#9851e0');
    await page.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
    // Choosing a color does not mutate a previously navigated marker.
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('sniptale-text-markers')?.textContent)
      )
      .not.toContain('152 81 224');
    await paintText(page, 'marker-proof', 0, 30);
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('sniptale-text-markers')?.textContent)
      )
      .toContain('152 81 224');
    await expect.poll(highlights).toBe(1);
    await paintText(page, 'marker-proof', 0, 30);
    await expect.poll(highlights).toBe(1);
    await panel.getByRole('button', { name: /: #ff3b3066$/u }).click();
    await panel.locator('[data-ui="content.toolbar.drawing-options.marker.opacity-100"]').click();
    await paintText(page, 'marker-proof', 7, 19);
    await expect.poll(highlights).toBe(3);
    await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(3);
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('sniptale-text-markers')?.textContent)
      )
      .toContain('color:rgb(255 59 48)');
    await expect(page.locator('#marker-proof')).toHaveJSProperty('innerHTML', source);
    await page.screenshot({ path: info.outputPath('marker-repaint-split.png'), fullPage: false });
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect.poll(highlights).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(() => document.getElementById('sniptale-text-markers')?.textContent)
      )
      .not.toContain('text-shadow:none');
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect.poll(highlights).toBe(3);
    await eraser.click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'true');
    await paintText(page, 'marker-proof', 7, 19);
    await expect.poll(highlights).toBe(2);
    await page.screenshot({ path: info.outputPath('marker-eraser-partial.png'), fullPage: false });
    await paintText(page, 'marker-proof', 7, 19);
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect.poll(highlights).toBe(3);
    await page.locator('[data-ui="content.toolbar.history-redo-button"]').click();
    await expect.poll(highlights).toBe(2);
    await panel.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await page.getByRole('textbox', { name: 'HEX', exact: true }).fill('#30d15800');
    await page.getByRole('button', { name: /^(Apply|Применить)$/u }).click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'true');
    await paintText(page, 'marker-proof', 0, 30);
    await expect.poll(highlights).toBe(0);
    await paintText(page, 'marker-proof', 0, 30);
    await page.locator('[data-ui="content.toolbar.history-undo-button"]').click();
    await expect.poll(highlights).toBe(2);
    await panel.getByRole('button', { name: /: #ffdf0066$/u }).click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'false');
    await paintText(page, 'marker-proof', 0, 30);
    await expect.poll(highlights).toBe(1);
    await expect(page.locator('#marker-proof')).toHaveJSProperty('innerHTML', source);
    if (viewport.name === '1920x900') {
      await page.setViewportSize({ width: 1024, height: 560 });
      const bounds = await panel.evaluate((node) => {
        const rect = node.closest('.sniptale-drawing-options-menu')!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      });
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(1024);
      expect(bounds.bottom).toBeLessThanOrEqual(560);
      await page.screenshot({
        path: info.outputPath('marker-vertical-short.png'),
        fullPage: false,
      });
    }
    await page.locator('[data-ui="content.toolbar.page-editing-mode.block-selection"]').click();
    await expect(panel).toBeHidden();
    await expect.poll(() => page.evaluate(() => CSS.highlights.size)).toBe(1);
    await page.locator('[data-ui="content.toolbar.mode-selector-button"]').click();
    await page.locator('[data-ui="content.toolbar.mode-option.design-review"]').click();
    await page.locator('[data-ui="content.toolbar.annotation-export-button"]').click();
    await page.locator('[data-ui="content.toolbar.annotation-export.pdf"]').click();
    await expect
      .poll(() => page.frames().filter((frame) => frame.url() === 'about:blank').length)
      .toBe(1);
    const report = page.frames().find((frame) => frame.url() === 'about:blank')!;
    await expect(report.locator('body')).toContainText(/Text highlighting|Подсветка текста/u);
    if (viewport.name === '1920x900') {
      await page.setViewportSize({ width: 1024, height: 560 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    }
    await popup.close();
    await page.close();
  });
}
