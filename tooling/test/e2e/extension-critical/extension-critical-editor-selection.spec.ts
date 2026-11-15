import { Buffer } from 'node:buffer';
import type { Page } from '@playwright/test';
import { translate } from '../support/catalog-fixture';
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
      await page.keyboard.press('Enter');
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
    await expect(outlines).toHaveAttribute(
      'stroke',
      'var(--sniptale-color-canvas-selection, #2563eb)'
    );
    await expect(outlines).toHaveAttribute('stroke-dasharray', '');
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
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const beforeRectangleHover = await page.evaluate(() => ({
      objects: window.__sniptaleEditorHarness!.getCanvasObjects(),
      history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
    }));
    await page.mouse.move(shapeStart.x + 30, shapeStart.y + 20);
    await expect(outlines).toHaveCount(1);
    await expect(outlines).toHaveAttribute('stroke-dasharray', '');
    await expect(previews.locator('circle')).toHaveCount(0);
    await expect(page.locator('[data-ui="editor.canvas.selection-controls"] rect')).toHaveCount(0);
    await expect(selected).toHaveCount(0);
    expect(
      await page.evaluate(() => ({
        objects: window.__sniptaleEditorHarness!.getCanvasObjects(),
        history: window.__sniptaleEditorHarness!.getInteractionState().historyIndex,
      }))
    ).toEqual(beforeRectangleHover);
    await page.screenshot({ path: info.outputPath('hover-shape.png'), fullPage: false });
    await page.mouse.click(shapeStart.x + 30, shapeStart.y + 20);
    await expect(outlines).toHaveCount(0);
    await expect(page.locator('[data-ui="editor.canvas.selection-controls"] rect')).toHaveCount(8);
    await expect(page.locator('[data-ui="editor.canvas.selection-controls"] polygon')).toHaveCount(
      0
    );
    await expect(page.locator('[data-ui="editor.canvas.selection-rotate"]')).toBeVisible();
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

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`frame handles retain screen size and logical vertical anchors ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    await page.locator('[data-ui="content.toolbar.future-frame-style"]').click();
    await dragMarquee(
      page,
      { x: bounds.x + 250, y: bounds.y + 100 },
      { x: bounds.x + 400, y: bounds.y + 200 }
    );
    const handles = page.locator('[data-frame-control="resize-handle"]');
    await expect(handles).toHaveCount(8);
    for (const zoom of [0.25, 1, 2]) {
      await page.evaluate((value) => window.__sniptaleEditorHarness!.setZoomLevel(value), zoom);
      await expect
        .poll(() =>
          handles.evaluateAll((elements) => {
            const id = (elements[0] as HTMLElement).dataset['frameId'];
            const stroke = [
              ...document.querySelectorAll<HTMLElement>('.sniptale-interactive-frame-stroke'),
            ].find((element) => element.dataset['frameId'] === id)!;
            const frame = stroke.parentElement!.getBoundingClientRect();
            return Math.max(
              ...elements.flatMap((element) => {
                const direction = (element as HTMLElement).dataset['direction']!;
                const rect = element.getBoundingClientRect();
                const corner = direction.length === 2;
                const horizontal = direction === 'n' || direction === 's';
                const x = direction.includes('w')
                  ? frame.left
                  : direction.includes('e')
                    ? frame.right
                    : frame.left + frame.width / 2;
                const y = direction.includes('n')
                  ? frame.top
                  : direction.includes('s')
                    ? frame.bottom
                    : frame.top + frame.height / 2;
                return [
                  Math.abs(rect.x + rect.width / 2 - x),
                  Math.abs(rect.y + rect.height / 2 - y),
                  Math.abs(rect.width - (corner ? 9 : horizontal ? 12 : 6)),
                  Math.abs(rect.height - (corner ? 9 : horizontal ? 6 : 12)),
                ];
              })
            );
          })
        )
        .toBeLessThanOrEqual(0.5);
      await page.screenshot({
        path: info.outputPath(`frame-handle-geometry-${zoom}.png`),
        fullPage: false,
      });
    }
    await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
    const east = page.locator('[data-frame-control="resize-handle"][data-direction="e"]');
    const color = await handles
      .first()
      .evaluate((element) => getComputedStyle(element).borderColor);
    await east.hover();
    await expect(east).toHaveCSS('border-color', color);
    await expect(east).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(east).toHaveCSS('transition-duration', '0s');
    const north = (await page
      .locator('[data-frame-control="resize-handle"][data-direction="n"]')
      .boundingBox())!;
    const screenshot = await page.screenshot({
      path: info.outputPath('frame-handles-above-stroke.png'),
      fullPage: false,
    });
    const pixel = await page.evaluate(
      async ({ png, x, y }) => {
        const image = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${png}`)).blob()
        );
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const result = [...context.getImageData(x, y, 1, 1).data];
        image.close();
        return result;
      },
      {
        png: screenshot.toString('base64'),
        x: Math.floor(north.x + north.width / 2),
        y: Math.floor(north.y + north.height / 2 - 1),
      }
    );
    expect(pixel.slice(0, 3)).toEqual([255, 255, 255]);
  });

  test(`layer row hover identifies rectangle and arrow without selecting them ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const initialIds = await page.evaluate(() =>
      window.__sniptaleEditorHarness!.getCanvasObjects().map((object) => object['sniptaleId'])
    );
    for (const [index, kind] of ['shape', 'arrow'].entries()) {
      await page.locator(`[data-ui="editor.floating.tool-rail.${kind}"]`).click();
      await dragMarquee(
        page,
        { x: bounds.x + 120 + index * 250, y: bounds.y + 100 },
        { x: bounds.x + 280 + index * 250, y: bounds.y + 190 }
      );
    }
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const objects = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
    const added = objects.filter((object) => !initialIds.includes(object['sniptaleId']));
    expect(added).toHaveLength(2);
    const history = await page.evaluate(
      () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
    );
    const previews = page.locator('[data-ui="editor.canvas.selection-preview"]');
    const selected = page.locator('[data-ui="editor.layers.list-viewport"]').getByRole('button', {
      name: translate('editor.toolbar.toggleLayerSelection', 'en'),
      exact: true,
      pressed: true,
    });
    for (const [index, object] of added.entries()) {
      const row = page.locator(`[data-editor-layer-id="${object['sniptaleId']}"]`);
      await row.hover();
      await expect(previews.locator('polygon')).toHaveCount(1);
      await expect(previews.locator('polygon')).toHaveAttribute('stroke-dasharray', '');
      await expect(previews.locator('polygon')).toHaveAttribute(
        'data-layer-id',
        String(object['sniptaleId'])
      );
      await expect(previews.locator('[data-ui="editor.canvas.selection-handle"]')).toHaveCount(0);
      await expect(selected).toHaveCount(0);
      expect(
        await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        )
      ).toBe(history);
      expect(await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects())).toEqual(
        objects
      );
      await page.screenshot({
        path: info.outputPath(`layer-row-hover-${index === 0 ? 'rectangle' : 'arrow'}.png`),
        fullPage: false,
      });
      await page.locator('[data-ui="editor.floating.tool-rail.select"]').hover();
      await expect(previews.locator('polygon')).toHaveCount(0);
    }
  });
}

async function moveSelectedGroup(
  page: Page,
  delta: { x: number; y: number },
  during?: () => Promise<void>
) {
  const border = page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first();
  await expect(border).toHaveAttribute('stroke', 'var(--sniptale-color-canvas-selection, #2563eb)');
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
    ).toHaveAttribute('stroke', 'var(--sniptale-color-canvas-selection, #2563eb)');
    await moveSelectedGroup(page, { x: 35, y: 20 });
    await expect(
      page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first()
    ).toHaveAttribute('stroke', 'var(--sniptale-color-canvas-selection, #2563eb)');
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

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`identical editor rectangles overlay with stable central guides ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const tool = (kind: string) => page.locator(`[data-ui="editor.floating.tool-rail.${kind}"]`);
    const magnet = page.locator('[data-ui="editor.floating.view-controls.magnet"]');
    if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
    const starts = [
      { x: bounds.x + 120, y: bounds.y + 100 },
      { x: bounds.x + 420, y: bounds.y + 190 },
    ];
    for (const start of starts) {
      await tool('shape').click();
      await dragMarquee(page, start, { x: start.x + 120, y: start.y + 80 });
    }
    await tool('select').click();
    await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');
    const objects = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
    const rectangles = objects.filter((object) => object['sniptaleType'] === 'shape');
    expect(rectangles).toHaveLength(2);
    const source = rectangles[0]!;
    const neighbor = rectangles[1]!;
    const row = (id: unknown) => page.locator(`[data-editor-layer-id="${String(id)}"]`);
    await row(source['sniptaleId'])
      .getByRole('button', {
        name: translate('editor.toolbar.toggleLayerSelection', 'en'),
        exact: true,
      })
      .click();
    const selected = page.locator('[data-ui="editor.layers.list-viewport"]').getByRole('button', {
      name: translate('editor.toolbar.toggleLayerSelection', 'en'),
      exact: true,
      pressed: true,
    });
    await expect(selected).toHaveCount(1);
    const history = await page.evaluate(
      () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
    );
    const guide = page.locator('[data-ui="editor.canvas.magnet-guide"]');
    const markers = page.locator('[data-ui="editor.canvas.magnet-marker"]');
    const grab = { x: starts[0]!.x + 30, y: starts[0]!.y };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    let stableFeedback: unknown;
    for (const [index, jitter] of [0, 1, -1, 2, -2, 0].entries()) {
      await page.mouse.move(grab.x + 300 + jitter, grab.y + 90 - jitter, { steps: 3 });
      await expect(guide).toHaveCount(8);
      await expect(guide.locator('xpath=self::*[@data-axis="x"]')).toHaveCount(4);
      await expect(guide.locator('xpath=self::*[@data-axis="y"]')).toHaveCount(4);
      await expect(markers).toHaveCount(1);
      await expect(markers).toHaveAttribute('data-filled', 'true');
      await expect(markers).not.toHaveAttribute('fill', 'none');
      const feedback = await markers.evaluate((element) => {
        const marker = element as SVGGraphicsElement;
        const box = marker.getBBox();
        const matrix = marker.getScreenCTM()!;
        const center = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
          matrix
        );
        const lines = [...marker.parentElement!.querySelectorAll('line')].map((line) => ({
          axis: line.getAttribute('data-axis'),
          coordinate: Number(
            line.getAttribute(line.getAttribute('data-axis') === 'x' ? 'x1' : 'y1')
          ),
        }));
        return {
          width: box.width * Math.hypot(matrix.a, matrix.b),
          height: box.height * Math.hypot(matrix.c, matrix.d),
          x: center.x,
          y: center.y,
          d: marker.getAttribute('d'),
          lines,
          localCenter: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        };
      });
      expect(feedback.width).toBeCloseTo(8, 1);
      expect(feedback.height).toBeCloseTo(8, 1);
      expect(feedback.x).toBeCloseTo(starts[1]!.x + 60, 0);
      expect(feedback.y).toBeCloseTo(starts[1]!.y + 40, 0);
      for (const axis of ['x', 'y'] as const) {
        const center = feedback.localCenter[axis];
        const extent = Number(neighbor[axis === 'x' ? 'scaledWidth' : 'scaledHeight']) / 2;
        expect(
          [
            ...new Set(
              feedback.lines.filter((line) => line.axis === axis).map((line) => line.coordinate)
            ),
          ].sort((a, b) => a - b)
        ).toEqual([center - extent, center, center + extent]);
      }
      const identity = { d: feedback.d, lines: feedback.lines };
      if (index === 0) stableFeedback = identity;
      else expect(identity).toEqual(stableFeedback);
      await expect(selected).toHaveCount(1);
      await expect(
        row(neighbor['sniptaleId']).getByRole('button', {
          name: translate('editor.toolbar.toggleLayerSelection', 'en'),
          exact: true,
        })
      ).toHaveAttribute('aria-pressed', 'false');
      expect(
        await page.evaluate(
          () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
        )
      ).toBe(history);
      expect(
        await page.evaluate(
          (id) =>
            window
              .__sniptaleEditorHarness!.getCanvasObjects()
              .find((object) => object['sniptaleId'] === id),
          neighbor['sniptaleId']
        )
      ).toEqual(neighbor);
    }
    await page.screenshot({
      path: info.outputPath('identical-rectangle-overlay.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await expect(guide).toHaveCount(0);
    await expect(markers).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
      )
      .toBe(history + 1);
    await tool('history.undo').click();
    await expect
      .poll(() => page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects()))
      .toEqual(objects);
    expect(
      await page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
    ).toBe(history);
    for (const alignment of [
      { name: 'equal-height-row', axis: 'y' as const, end: { x: grab.x, y: grab.y + 90 } },
      { name: 'equal-width-column', axis: 'x' as const, end: { x: grab.x + 300, y: grab.y - 60 } },
    ]) {
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      for (const jitter of [-1, 0, 1]) {
        await page.mouse.move(
          alignment.end.x + (alignment.axis === 'x' ? jitter : 0),
          alignment.end.y + (alignment.axis === 'y' ? jitter : 0),
          { steps: 3 }
        );
        await expect(guide).toHaveCount(4);
        await expect(guide.locator(`xpath=self::*[@data-axis="${alignment.axis}"]`)).toHaveCount(4);
        await expect(markers).toHaveCount(1);
        await expect(markers).toHaveAttribute('data-filled', 'false');
        const coordinates = await guide.evaluateAll((elements) =>
          elements.map((line) =>
            Number(line.getAttribute(line.getAttribute('data-axis') === 'x' ? 'x1' : 'y1'))
          )
        );
        const center = await markers.evaluate((element, axis) => {
          const box = (element as SVGGraphicsElement).getBBox();
          return axis === 'x' ? box.x + box.width / 2 : box.y + box.height / 2;
        }, alignment.axis);
        const extent =
          Number(neighbor[alignment.axis === 'x' ? 'scaledWidth' : 'scaledHeight']) / 2;
        expect([...new Set(coordinates)].sort((a, b) => a - b)).toEqual([
          center - extent,
          center,
          center + extent,
        ]);
        await expect(selected).toHaveCount(1);
        expect(
          await page.evaluate(
            () => window.__sniptaleEditorHarness!.getInteractionState().historyIndex
          )
        ).toBe(history);
      }
      await page.screenshot({ path: info.outputPath(`${alignment.name}.png`), fullPage: false });
      await page.mouse.up();
      await expect(guide).toHaveCount(0);
      await expect(markers).toHaveCount(0);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex)
        )
        .toBe(history + 1);
      await tool('history.undo').click();
      await expect
        .poll(() => page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects()))
        .toEqual(objects);
    }
  });

  test(`editor accepts unaligned dimensions and equal gaps ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const tool = (kind: string) => page.locator(`[data-ui="editor.floating.tool-rail.${kind}"]`);
    const magnet = page.locator('[data-ui="editor.floating.view-controls.magnet"]');
    const setMagnet = async (enabled: boolean) => {
      if (((await magnet.getAttribute('aria-pressed')) === 'true') !== enabled)
        await magnet.click();
    };
    const draw = async (x: number, y: number, width: number, height: number) => {
      await tool('shape').click();
      await dragMarquee(
        page,
        { x: bounds.x + x, y: bounds.y + y },
        { x: bounds.x + x + width, y: bounds.y + y + height }
      );
    };
    const select = async (id: unknown) => {
      await tool('select').click();
      await page
        .locator(`[data-editor-layer-id="${String(id)}"]`)
        .getByRole('button', {
          name: translate('editor.toolbar.toggleLayerSelection', 'en'),
          exact: true,
        })
        .click();
    };
    const handle = async (key: string) => {
      const locator = page.locator(
        `[data-ui="editor.canvas.selection-controls"] [data-control="${key}"]`
      );
      await expect(locator).toBeVisible();
      const box = (await locator.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const selectedBox = async () => {
      const [tl, br] = await Promise.all([handle('tl'), handle('br')]);
      return { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };
    };
    const history = () =>
      page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
    const relations = page.locator('[data-ui="editor.canvas.magnet-relation"]');
    const assertMeasurement = async (kind: 'dimension' | 'gap', value: number, count: number) => {
      const measurements = relations.filter({ has: page.locator('polyline') });
      await expect(measurements).toHaveCount(count);
      for (const measurement of await measurements.all()) {
        await expect(measurement).toHaveAttribute('data-relation-kind', kind);
        await expect(measurement).toHaveAttribute('data-relation-axis', 'x');
        expect(Number(await measurement.getAttribute('data-value'))).toBeCloseTo(value, 5);
        const length = await measurement
          .locator('polyline')
          .first()
          .evaluate((element) => {
            const points = (element as SVGPolylineElement).points;
            return Math.hypot(
              points.getItem(1).x - points.getItem(0).x,
              points.getItem(1).y - points.getItem(0).y
            );
          });
        expect(length).toBeCloseTo(value, 5);
      }
    };
    await setMagnet(false);
    await draw(120, 60, 80, 60);
    await draw(450, 40, 120, 90);
    const created = await page.evaluate(() =>
      window
        .__sniptaleEditorHarness!.getCanvasObjects()
        .filter((object) => object['sniptaleType'] === 'shape')
    );
    const sourceId = created[0]!['sniptaleId'];
    const reference = created[1]!;
    await select(sourceId);
    await setMagnet(true);
    const initial = await selectedBox();
    const beforeResize = await history();
    const mr = await handle('mr');
    await page.mouse.move(mr.x, mr.y);
    await page.mouse.down();
    await page.mouse.move(mr.x + 39, mr.y, { steps: 6 });
    const referenceWidth = Number(reference['scaledWidth']);
    await assertMeasurement('dimension', referenceWidth, 2);
    expect((await selectedBox()).width).toBeCloseTo(referenceWidth, 0);
    expect((await selectedBox()).height).toBeCloseTo(initial.height, 0);
    expect(await history()).toBe(beforeResize);
    expect(
      await page.evaluate(
        (id) =>
          window
            .__sniptaleEditorHarness!.getCanvasObjects()
            .find((object) => object['sniptaleId'] === id),
        reference['sniptaleId']
      )
    ).toEqual(reference);
    await page.screenshot({ path: info.outputPath('editor-unaligned-width.png'), fullPage: false });
    await page.mouse.up();
    await expect(relations).toHaveCount(0);
    await expect.poll(history).toBe(beforeResize + 1);
    await tool('history.undo').click();
    await select(sourceId);
    await expect
      .poll(async () => Math.abs((await selectedBox()).width - initial.width))
      .toBeLessThanOrEqual(0.5);
    await setMagnet(false);
    await draw(100, 210, 40, 60);
    await draw(340, 210, 40, 60);
    const allShapes = await page.evaluate(() =>
      window
        .__sniptaleEditorHarness!.getCanvasObjects()
        .filter((object) => object['sniptaleType'] === 'shape')
    );
    await select(allShapes[2]!['sniptaleId']);
    const firstNeighbor = await selectedBox();
    await select(allShapes[3]!['sniptaleId']);
    const secondNeighbor = await selectedBox();
    await select(sourceId);
    await setMagnet(true);
    const sourceBox = await selectedBox();
    const referenceGap = secondNeighbor.x - firstNeighbor.x - firstNeighbor.width;
    const centerGap = (referenceGap - sourceBox.width) / 2;
    const centerLeft = firstNeighbor.x + firstNeighbor.width + centerGap;
    const repeatLeft = secondNeighbor.x + secondNeighbor.width + referenceGap;
    const beforeMove = await history();
    const moveTo = async (left: number, top: number) => {
      const box = await selectedBox();
      const grab = { x: box.x + 20, y: box.y };
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(left + 20, top, { steps: 8 });
    };
    await moveTo(centerLeft - 2, firstNeighbor.y);
    await assertMeasurement('gap', centerGap, 2);
    expect((await selectedBox()).x).toBeCloseTo(centerLeft, 0);
    expect(await history()).toBe(beforeMove);
    await page.screenshot({ path: info.outputPath('editor-centered-gaps.png'), fullPage: false });
    await page.mouse.up();
    await expect(relations).toHaveCount(0);
    await expect.poll(history).toBe(beforeMove + 1);
    const accepted = await selectedBox();
    await moveTo(repeatLeft - 2, firstNeighbor.y);
    await assertMeasurement('gap', referenceGap, 2);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(relations).toHaveCount(0);
    expect(await history()).toBe(beforeMove + 1);
    await expect
      .poll(async () => Math.abs((await selectedBox()).x - accepted.x))
      .toBeLessThanOrEqual(0.5);
    await moveTo(repeatLeft - 2, firstNeighbor.y);
    await assertMeasurement('gap', referenceGap, 2);
    expect((await selectedBox()).x).toBeCloseTo(repeatLeft, 0);
    await page.screenshot({ path: info.outputPath('editor-repeated-gaps.png'), fullPage: false });
    await page.mouse.up();
    await expect(relations).toHaveCount(0);
    await expect.poll(history).toBe(beforeMove + 2);
    await tool('history.undo').click();
    await select(sourceId);
    await expect
      .poll(async () => Math.abs((await selectedBox()).x - accepted.x))
      .toBeLessThanOrEqual(0.5);
    expect(await history()).toBe(beforeMove + 1);
  });

  test(`editor pencil move obeys central magnet and click preserves chrome ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const tool = (kind: string) => page.locator(`[data-ui="editor.floating.tool-rail.${kind}"]`);
    const polygon = page.locator('[data-ui="editor.canvas.selection-controls"] > polygon').first();
    const center = async () => {
      const rect = (await polygon.boundingBox())!;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const pencil = { x: bounds.x + 150, y: bounds.y + 100 };
    const arrow = { x: bounds.x + 550, y: bounds.y + 200 };
    await tool('pencil').click();
    await dragMarquee(
      page,
      { x: pencil.x - 50, y: pencil.y - 20 },
      {
        x: pencil.x + 50,
        y: pencil.y + 20,
      }
    );
    await tool('arrow').click();
    await dragMarquee(
      page,
      { x: arrow.x - 90, y: arrow.y - 50 },
      {
        x: arrow.x + 90,
        y: arrow.y + 50,
      }
    );
    await tool('select').click();
    await page.mouse.click(bounds.x + 30, bounds.y + 30);
    await page.mouse.move(arrow.x, arrow.y);
    const arrowPreview = page.locator('[data-ui="editor.canvas.selection-preview"] polygon');
    await expect(arrowPreview).toHaveCount(0);
    await page.mouse.click(arrow.x, arrow.y);
    const endpoint = async (key: 'start' | 'end') => {
      const handle = page.locator(
        `[data-ui="editor.canvas.selection-controls"] [data-control="${key}"]`
      );
      await expect(handle).toBeVisible();
      const rect = (await handle.boundingBox())!;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    const [startPoint, endPoint] = await Promise.all([endpoint('start'), endpoint('end')]);
    const target = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    };
    await page.mouse.click(pencil.x, pencil.y);
    const initial = await center();
    const control = page.locator('[data-ui="editor.canvas.selection-controls"]');
    await page.mouse.move(initial.x, initial.y);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await expect(control).toHaveCSS('opacity', '1');
    await page.mouse.up();
    await expect(control).toHaveCSS('opacity', '1');
    const magnet = page.locator('[data-ui="editor.floating.view-controls.magnet"]');
    if ((await magnet.getAttribute('aria-pressed')) === 'true') await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.down('Shift');
    await page.mouse.move(initial.x, initial.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 4, target.y + 3, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await center()).y - initial.y)).toBeLessThanOrEqual(1);
    await page.keyboard.up('Shift');
    await tool('history.undo').click();
    await page.mouse.click(pencil.x, pencil.y);
    await page.keyboard.down('Shift');
    await page.mouse.move(initial.x, initial.y);
    await page.mouse.down();
    await page.mouse.move(target.x + 4, target.y + 3, { steps: 8 });
    await page.keyboard.up('Shift');
    await page.mouse.move(target.x + 4, target.y + 4);
    await page.mouse.up();
    expect(Math.abs((await center()).x - target.x)).toBeGreaterThan(2);
    expect(Math.abs((await center()).y - target.y)).toBeGreaterThan(2);
    await tool('history.undo').click();
    await page.mouse.click(pencil.x, pencil.y);
    await magnet.click();
    await expect(magnet).toHaveAttribute('aria-pressed', 'true');
    const restored = await center();
    await page.mouse.move(restored.x, restored.y);
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
    await expect(control).toHaveCSS('opacity', '1');
    await page.mouse.move(target.x + 4, target.y + 4, { steps: 8 });
    await expect(control).toHaveCSS('opacity', '0');
    await page.mouse.up();
    await expect(control).toHaveCSS('opacity', '1');
    await expect.poll(async () => Math.abs((await center()).x - target.x)).toBeLessThanOrEqual(1);
    await expect.poll(async () => Math.abs((await center()).y - target.y)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('pencil-arrow-magnet.png'), fullPage: false });
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`nested lower pencil remains targetable through larger layers ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const initialIds = await page.evaluate(() =>
      window.__sniptaleEditorHarness!.getCanvasObjects().map((object) => object['sniptaleId'])
    );
    await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
    await dragMarquee(page, { x: center.x, y: center.y - 22 }, { x: center.x, y: center.y + 22 });
    await page.mouse.move(center.x + 75, center.y);
    await page.mouse.down();
    for (let step = 1; step <= 32; step++) {
      const angle = (step / 32) * Math.PI * 2;
      await page.mouse.move(center.x + Math.cos(angle) * 75, center.y + Math.sin(angle) * 65);
    }
    await page.mouse.up();
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const added = await page.evaluate(
      (ids) =>
        window
          .__sniptaleEditorHarness!.getCanvasObjects()
          .filter((object) => !ids.includes(object['sniptaleId'])),
      initialIds
    );
    expect(added).toHaveLength(2);
    const preview = page.locator('[data-ui="editor.canvas.selection-preview"] polygon');
    const selectedRow = (id: unknown) =>
      page
        .locator(`[data-editor-layer-id="${id}"]`)
        .locator(
          '[data-ui="editor.layers.selection-toggle"], [data-ui="editor.layers.drag-handle"]'
        );
    await page.mouse.move(center.x, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(added[0]!['sniptaleId']));
    await page.screenshot({
      path: info.outputPath('hollow-pencil-lower-hover.png'),
      fullPage: false,
    });
    await page.mouse.click(center.x, center.y);
    await expect(selectedRow(added[0]!['sniptaleId'])).toHaveAttribute('aria-pressed', 'true');
    await expect(selectedRow(added[1]!['sniptaleId'])).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await page.mouse.move(center.x + 75, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(added[1]!['sniptaleId']));
    await page.mouse.click(center.x + 75, center.y);
    await expect(selectedRow(added[1]!['sniptaleId'])).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({
      path: info.outputPath('hollow-pencil-upper-selected.png'),
      fullPage: false,
    });
    await page.locator('[data-ui="editor.floating.tool-rail.shape"]').click();
    await page.locator('[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]').click();
    const fill = page.locator('[data-ui="content.toolbar.drawing-options.shape.fill-toggle"]');
    if ((await fill.getAttribute('aria-pressed')) !== 'true') await fill.click();
    await dragMarquee(
      page,
      { x: center.x - 50, y: center.y - 35 },
      { x: center.x + 50, y: center.y + 35 }
    );
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const filled = await page.evaluate(() =>
      window.__sniptaleEditorHarness!.getCanvasObjects().at(-1)!
    );
    await page.mouse.move(center.x, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(added[0]!['sniptaleId']));
    await page.mouse.click(center.x, center.y);
    await expect(selectedRow(added[0]!['sniptaleId'])).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await page.mouse.move(center.x + 35, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(filled['sniptaleId']));
    await page.mouse.click(center.x + 35, center.y);
    await expect(selectedRow(filled['sniptaleId'])).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({
      path: info.outputPath('nested-filled-free-area.png'),
      fullPage: false,
    });
  });

  test(`nested lower pencil remains targetable through opaque raster ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    await page.locator('[data-ui="editor.floating.tool-rail.pencil"]').click();
    await dragMarquee(page, { x: center.x, y: center.y - 22 }, { x: center.x, y: center.y + 22 });
    const lower = await page.evaluate(() =>
      window.__sniptaleEditorHarness!.getCanvasObjects().at(-1)!
    );
    const opaque = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 240;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#38bdf8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png');
    });
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('button', { name: translate('editor.toolbar.insertImage', 'en'), exact: true })
      .click();
    await (
      await chooser
    ).setFiles({
      name: 'Opaque upper.png',
      mimeType: 'image/png',
      buffer: Buffer.from(opaque.split(',')[1]!, 'base64'),
    });
    await expect
      .poll(() => page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length))
      .toBe(3);
    const upper = await page.evaluate(() =>
      window.__sniptaleEditorHarness!.getCanvasObjects().at(-1)!
    );
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const preview = page.locator('[data-ui="editor.canvas.selection-preview"] polygon');
    await page.mouse.move(center.x, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(lower['sniptaleId']));
    await page.screenshot({
      path: info.outputPath('opaque-raster-lower-hover.png'),
      fullPage: false,
    });
    await page.mouse.click(center.x, center.y);
    await expect(
      page
        .locator(`[data-editor-layer-id="${lower['sniptaleId']}"]`)
        .locator(
          '[data-ui="editor.layers.selection-toggle"], [data-ui="editor.layers.drag-handle"]'
        )
    ).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await page.mouse.move(center.x + 200, center.y);
    await expect(preview).toHaveAttribute('data-layer-id', String(upper['sniptaleId']));
    await page.mouse.click(center.x + 200, center.y);
    await expect(
      page
        .locator(`[data-editor-layer-id="${upper['sniptaleId']}"]`)
        .locator(
          '[data-ui="editor.layers.selection-toggle"], [data-ui="editor.layers.drag-handle"]'
        )
    ).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({
      path: info.outputPath('opaque-raster-free-area-selected.png'),
      fullPage: false,
    });
  });

  test(`raster first click retains border and first drag remains marquee ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const bounds = await openTransformFixture(page, hostOrigin, size);
    await page
      .locator('[data-ui="editor.layers.list-viewport"]')
      .getByRole('button', {
        name: translate('editor.toolbar.unlockLayer', 'en'),
        exact: true,
      })
      .click();
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const preview = page.locator('[data-ui="editor.canvas.selection-preview"] polygon');
    await page.mouse.move(point.x, point.y);
    await expect(preview).toHaveCount(1);
    await page.evaluate(() => {
      for (const type of ['mousedown', 'mouseup']) {
        window.addEventListener(type, () => {
          document.documentElement.setAttribute(
            `data-proof-${type}`,
            JSON.stringify({
              preview: document.querySelectorAll(
                '[data-ui="editor.canvas.selection-preview"] polygon'
              ).length,
              border: document.querySelectorAll(
                '[data-ui="editor.canvas.selection-controls"] > polygon'
              ).length,
              handles: document.querySelectorAll(
                '[data-ui="editor.canvas.selection-controls"] [data-control]'
              ).length,
            })
          );
        });
      }
    });
    await page.mouse.down();
    const down = JSON.parse((await page.locator('html').getAttribute('data-proof-mousedown'))!);
    expect(down.preview + down.border).toBeGreaterThan(0);
    expect(down.handles).toBe(0);
    await expect(preview).toHaveCount(1);
    await page.screenshot({ path: info.outputPath('raster-pending-border.png'), fullPage: false });
    await page.mouse.up();
    const up = JSON.parse((await page.locator('html').getAttribute('data-proof-mouseup'))!);
    expect(up.border).toBeGreaterThan(0);
    expect(up.handles).toBeGreaterThanOrEqual(8);
    await page.screenshot({ path: info.outputPath('raster-click-controls.png'), fullPage: false });
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const before = await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
    await dragMarquee(page, point, { x: point.x + 45, y: point.y + 35 });
    await expect(
      page.locator('[data-ui="editor.canvas.selection-controls"] [data-control]')
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects())).toEqual(
      before
    );
  });
}
