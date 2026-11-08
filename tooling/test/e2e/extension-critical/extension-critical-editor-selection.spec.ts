import type { Page } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

async function dragMarquee(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`editor marquee contains layers and preserves Ctrl add ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await applyHarnessBootstrap(page, { storage: { 'sniptale-locale-preference': 'en' } });
    await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
    await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
    await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0)
      )
      .toBeGreaterThan(0);
    await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
    const layers = page.locator('[data-ui="editor.layers.list-viewport"]');
    const sourceLock = layers.getByRole('button', {
      name: translate('editor.toolbar.lockLayer', 'en'),
      exact: true,
    });
    if (await sourceLock.count()) await sourceLock.first().click();
    const viewport = (await page.locator('[data-ui="editor.canvas.viewport"]').boundingBox())!;
    const starts = [
      { x: viewport.x + 150, y: viewport.y + viewport.height / 2 - 25 },
      { x: viewport.x + 330, y: viewport.y + viewport.height / 2 - 25 },
    ];
    for (const [index, text] of ['One', 'Partially enclosed layer'].entries()) {
      await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
      await page.keyboard.press('Escape');
      await page.mouse.click(starts[index]!.x, starts[index]!.y);
      await page.keyboard.insertText(text);
      await page.keyboard.press('Escape');
    }
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    const textObjects = await page.evaluate(() =>
      window
        .__sniptaleEditorHarness!.getCanvasObjects()
        .filter((object) => object['sniptaleType'] === 'text')
    );
    expect(textObjects).toHaveLength(2);
    const selected = layers.getByRole('button', {
      name: translate('editor.toolbar.toggleLayerSelection', 'en'),
      exact: true,
      pressed: true,
    });
    const start = { x: starts[0]!.x - 30, y: starts[0]!.y - 30 };
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const previews = page.locator('[data-ui="editor.canvas.selection-preview"]');
    const outlines = previews.locator('polygon');
    const historyBefore = await page.evaluate(
      () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
    );
    await page.mouse.move(starts[0]!.x + 12, starts[0]!.y + 12);
    await expect(outlines).toHaveCount(1);
    await expect(outlines).toHaveAttribute('stroke', '#2563eb');
    await expect(previews.locator('circle')).toHaveCount(0);
    await expect(selected).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
    ).toBe(historyBefore);
    await page.screenshot({ path: info.outputPath('hover-layer.png'), fullPage: false });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(starts[1]!.x + 20, starts[1]!.y + 75, { steps: 8 });
    await expect(outlines).toHaveCount(1);
    const previewBounds = (await outlines.boundingBox())!;
    expect(previewBounds.x + previewBounds.width).toBeLessThan(starts[1]!.x);
    await expect(selected).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('marquee-preview-partial.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await expect(outlines).toHaveCount(0);
    await expect(selected).toHaveCount(1);
    const selection = page.locator('[data-ui="editor.canvas.selection-chrome"] polygon');
    await expect(selection).toBeVisible();
    const selectedBounds = (await selection.boundingBox())!;
    expect(selectedBounds.x).toBeGreaterThanOrEqual(start.x);
    expect(selectedBounds.x + selectedBounds.width).toBeLessThan(starts[1]!.x);
    await page.screenshot({ path: info.outputPath('partially-enclosed.png'), fullPage: false });
    await page.keyboard.down('Control');
    await page.mouse.click(starts[1]!.x + 12, starts[1]!.y + 12);
    await page.keyboard.up('Control');
    await expect(selected).toHaveCount(2);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await dragMarquee(page, start, {
      x: starts[1]!.x + Number(textObjects[1]!['scaledWidth']) + 30,
      y: starts[1]!.y + Number(textObjects[1]!['scaledHeight']) + 30,
    });
    await expect(selected).toHaveCount(2);
    await page.screenshot({ path: info.outputPath('fully-enclosed.png'), fullPage: false });
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const reverseStart = {
      x: starts[1]!.x + Number(textObjects[1]!['scaledWidth']) + 30,
      y: starts[1]!.y + Number(textObjects[1]!['scaledHeight']) + 30,
    };
    await page.mouse.move(reverseStart.x, reverseStart.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y, { steps: 8 });
    await expect(outlines).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath('marquee-preview-reverse.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await expect(outlines).toHaveCount(0);
    await expect(selected).toHaveCount(2);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await page.mouse.move(starts[0]!.x + 12, starts[0]!.y + 12);
    await expect(outlines).toHaveCount(1);
    await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
    await expect(outlines).toHaveCount(0);
    await page.locator('[data-ui="editor.floating.tool-rail.shape"]').click();
    const shapeStart = { x: viewport.x + 500, y: viewport.y + viewport.height / 2 + 60 };
    await page.mouse.move(shapeStart.x, shapeStart.y);
    await page.mouse.down();
    await page.mouse.move(shapeStart.x + 120, shapeStart.y + 70, { steps: 4 });
    await page.mouse.up();
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.mouse.move(shapeStart.x + 30, shapeStart.y + 20);
    await expect(outlines).toHaveCount(1);
    await expect(previews.locator('circle')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('hover-shape.png'), fullPage: false });
    await page.mouse.click(shapeStart.x + 30, shapeStart.y + 20);
    await expect(outlines).toHaveCount(0);
    await expect(
      page.locator('[data-ui="editor.canvas.selection-controls"] circle').first()
    ).toBeVisible();
    for (const width of [1200, 1438, 1439, 1440, 1498, 1499, 1500, 1798, 1799, 1800]) {
      await page.setViewportSize({ width, height: size.height });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
      await expect
        .poll(async () => {
          const bar = (await page
            .locator('[data-ui="editor.floating.document-bar"]')
            .boundingBox())!;
          const cursor = (await page
            .locator('[data-ui="editor.floating.tool-rail.select"]')
            .boundingBox())!;
          return bar.x + bar.width <= cursor.x + 1;
        })
        .toBe(true);
    }
  });
}
