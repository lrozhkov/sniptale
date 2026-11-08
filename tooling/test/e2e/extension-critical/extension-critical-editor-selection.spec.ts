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

async function openTransformFixture(
  page: Page,
  hostOrigin: string,
  size: { width: number; height: number }
) {
  page.setDefaultTimeout(10000);
  await page.setViewportSize(size);
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
    },
  });
  await page.addInitScript(() => {
    localStorage.setItem('sniptale-locale-preference', 'en');
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 320;
    window.__sniptaleHarnessBootstrap = {
      ...window.__sniptaleHarnessBootstrap,
      editorBootstrapPayload: { dataUrl: canvas.toDataURL(), title: 'Selection transforms' },
    };
  });
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect(page.locator('[data-ui="editor.page.root"]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__sniptaleEditorHarness?.getCanvasObjects().length ?? 0))
    .toBeGreaterThan(0);
  const lock = page.locator('[data-ui="editor.layers.list-viewport"]').getByRole('button', {
    name: translate('editor.toolbar.lockLayer', 'en'),
    exact: true,
  });
  if (await lock.count()) await lock.first().click();
  return (await page.locator('[data-ui="editor.canvas.document-boundary"]').boundingBox())!;
}

async function moveSelectedGroup(
  page: Page,
  delta: { x: number; y: number },
  during?: () => Promise<void>
) {
  const border = page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first();
  await expect(border).toHaveAttribute('stroke', '#2563eb');
  const bounds = await border.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
  await during?.();
  await page.mouse.up();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`projected annotations follow native multi-selection ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const tool = (id: string) => page.locator(`[data-ui="${id}"]`);
    await tool('content.toolbar.future-frame-step-badge').click();
    await page.mouse.click(bounds.x + 140, bounds.y + 90);
    await tool('content.toolbar.future-frame-callout').click();
    await page.mouse.click(bounds.x + 300, bounds.y + 90);
    const editable = page.locator('.sniptale-callout [contenteditable="true"]');
    await editable.fill('Move this comment');
    await editable.press('Escape');
    await tool('content.toolbar.future-frame-style').click();
    await dragMarquee(
      page,
      { x: bounds.x + 450, y: bounds.y + 150 },
      { x: bounds.x + 600, y: bounds.y + 240 }
    );
    await tool('editor.floating.tool-rail.select').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await dragMarquee(
      page,
      { x: bounds.x + 30, y: bounds.y + 20 },
      { x: bounds.x + 700, y: bounds.y + 280 }
    );
    const surfaces = [
      page.locator('.sniptale-step-badge').first(),
      page.locator('.sniptale-callout').first(),
      page.locator('.sniptale-interactive-frame-stroke').last(),
      page.locator('.sniptale-step-badge').last(),
    ];
    const positions = async () =>
      Promise.all(
        surfaces.map(async (surface) => {
          const rect = (await surface.boundingBox())!;
          return { x: rect.x, y: rect.y };
        })
      );
    await expect(page.locator('.sniptale-callout [contenteditable="true"]')).toHaveCount(0);
    const before = await positions();
    const delta = { x: 35, y: 20 };
    const displacementError = async () =>
      Math.max(
        ...(await positions()).flatMap((point, index) => [
          Math.abs(point.x - before[index]!.x - delta.x),
          Math.abs(point.y - before[index]!.y - delta.y),
        ])
      );
    await moveSelectedGroup(page, delta, async () => {
      await expect.poll(displacementError).toBeLessThanOrEqual(2);
      await page.screenshot({
        path: info.outputPath('annotations-during-drag.png'),
        fullPage: false,
      });
    });
    await expect.poll(displacementError).toBeLessThanOrEqual(2);
    await page.screenshot({ path: info.outputPath('annotations-after-drag.png'), fullPage: false });
    await tool('editor.floating.tool-rail.history.undo').click();
    await expect
      .poll(async () =>
        Math.max(
          ...(await positions()).flatMap((point, index) => [
            Math.abs(point.x - before[index]!.x),
            Math.abs(point.y - before[index]!.y),
          ])
        )
      )
      .toBeLessThanOrEqual(2);
    await tool('editor.floating.tool-rail.history.redo').click();
    await expect.poll(displacementError).toBeLessThanOrEqual(2);
  });

  test(`mixed arrow styles keep blue selection and reversible history ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('EditorAsyncAction'))
        errors.push(message.text());
    });
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const tool = (id: string) => page.locator(`[data-ui="${id}"]`);
    await tool('editor.floating.tool-rail.arrow').click();
    await tool('content.toolbar.drawing-options.arrow.freehand').click();
    const start = { x: bounds.x + 110, y: bounds.y + 90 };
    const middle = { x: start.x + 120, y: start.y };
    await dragMarquee(page, start, { x: start.x + 240, y: start.y });
    await page.mouse.move(middle.x, middle.y);
    await expect(page.locator('[data-ui="editor.canvas.selection-controls"] circle')).toHaveCount(
      3
    );
    await dragMarquee(page, middle, { x: middle.x, y: middle.y + 35 });
    await tool('editor.floating.tool-rail.select').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await tool('editor.floating.tool-rail.arrow').click();
    await tool('content.toolbar.drawing-options.arrow.uniform').click();
    await dragMarquee(
      page,
      { x: start.x, y: start.y + 130 },
      { x: start.x + 260, y: start.y + 130 }
    );
    await tool('editor.floating.tool-rail.select').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await dragMarquee(
      page,
      { x: bounds.x + 40, y: bounds.y + 40 },
      { x: bounds.x + 430, y: bounds.y + 280 }
    );
    await tool('content.toolbar.drawing-options.arrow.width-24').click();
    await tool('content.toolbar.drawing-options.arrow.uniform').click();
    await expect(
      page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first()
    ).toHaveAttribute('stroke', '#2563eb');
    await moveSelectedGroup(page, { x: 35, y: 20 });
    await expect(
      page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first()
    ).toHaveAttribute('stroke', '#2563eb');
    await page.screenshot({
      path: info.outputPath('arrows-after-common-style-and-move.png'),
      fullPage: false,
    });
    const historyIndex = () =>
      page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
    const top = await historyIndex();
    for (let step = 1; step <= 3; step += 1) {
      await tool('editor.floating.tool-rail.history.undo').click();
      await expect.poll(historyIndex).toBe(top - step);
    }
    for (let step = 2; step >= 0; step -= 1) {
      await tool('editor.floating.tool-rail.history.redo').click();
      await expect.poll(historyIndex).toBe(top - step);
    }
    expect(errors).toEqual([]);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .filter((object) => object['sniptaleType'] === 'arrow').length
        )
      )
      .toBe(2);
  });
}
