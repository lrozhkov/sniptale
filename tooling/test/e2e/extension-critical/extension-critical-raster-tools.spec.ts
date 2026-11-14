import { writeFile } from 'node:fs/promises';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
  enterRasterEditing,
  openRasterFixture,
  rasterControl,
  rasterDocument,
  rasterDrag,
  rasterHistory,
  rasterParameter,
  rasterSnapshot,
  rasterSourcePixel,
  sourceClientPoint,
} from '../support/raster-tools-probe';

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(`raster paint brush respects opacity selection and history ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    const original = await rasterSourcePixel(page, 20, 10);
    const history = await rasterHistory(page);
    await rasterControl(page, 'brush').click();
    const size = rasterControl(page, 'brushSize').getByRole('textbox');
    await size.fill('8');
    await size.press('Enter');
    const opacity = rasterControl(page, 'opacity').getByRole('textbox');
    await opacity.fill('50');
    await opacity.press('Enter');
    await rasterDrag(page, [10, 10], [30, 10]);
    await expect.poll(() => rasterHistory(page)).toBe(history + 1);
    await expect.poll(() => rasterSourcePixel(page, 20, 10)).toEqual([255, 162, 128, 255]);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => rasterSourcePixel(page, 20, 10)).toEqual(original);
    await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
    await expect.poll(() => rasterSourcePixel(page, 20, 10)).toEqual([255, 162, 128, 255]);
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ editing: true, tool: 'brush' });
    await rasterControl(page, 'select').click();
    await rasterDrag(page, [10, 20], [40, 40]);
    const outside = await rasterSourcePixel(page, 60, 30);
    await rasterControl(page, 'brush').click();
    await opacity.fill('100');
    await opacity.press('Enter');
    await rasterDrag(page, [20, 30], [70, 30]);
    await expect.poll(() => rasterSourcePixel(page, 30, 30)).toEqual([255, 69, 0, 255]);
    expect(await rasterSourcePixel(page, 60, 30)).toEqual(outside);
    await page.screenshot({ path: info.outputPath('paint-brush-selection.png'), fullPage: false });
  });

  test(`raster selected pixel hiding and history ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    await rasterControl(page, 'select').click();
    await rasterDrag(page, [50, 40], [120, 100]);
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selection: 'active', tool: 'select' });
    const baseline = await rasterHistory(page);
    const targetId = (await rasterSnapshot(page))?.targetId;
    expect(targetId).toBeTruthy();
    await page.keyboard.press('Delete');
    await expect.poll(() => rasterHistory(page)).toBe(baseline + 1);
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([0, 0, 0, 0]);
    expect(await rasterSourcePixel(page, 45, 70)).toEqual([37, 99, 235, 255]);
    const document = await rasterDocument(page);
    expect(document.version).toBe(3);
    expect(document.canvasJson).toContain('sniptaleRasterOriginalData');
    expect(document.canvasJson).toContain('sniptaleRasterVisibilityData');
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => rasterHistory(page)).toBe(baseline);
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({
        available: true,
        editing: true,
        targetId,
        tool: 'select',
      });
    await expect(rasterControl(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([37, 99, 235, 255]);
    await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
    await expect.poll(() => rasterHistory(page)).toBe(baseline + 1);
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([0, 0, 0, 0]);
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({
        available: true,
        editing: true,
        targetId,
        tool: 'select',
      });
    await expect(rasterControl(page, 'select')).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: info.outputPath('selected-pixels-hidden.png'), fullPage: false });
  });

  test(`raster fill remove-color and copied source fragment ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    await rasterControl(page, 'fill').click();
    const white = await sourceClientPoint(page, 10, 10);
    await page.mouse.click(white.x, white.y);
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false, error: null });
    await expect.poll(() => rasterSourcePixel(page, 10, 10)).toEqual([255, 69, 0, 255]);
    expect(await rasterSourcePixel(page, 80, 70)).toEqual([37, 99, 235, 255]);
    await rasterControl(page, 'removeColor').click();
    await page.mouse.click(white.x, white.y);
    await expect.poll(() => rasterSourcePixel(page, 10, 10)).toEqual([0, 0, 0, 0]);
    expect((await rasterDocument(page)).canvasJson).toContain('sniptaleRasterKeyData');
    await rasterControl(page, 'select').click();
    await rasterDrag(page, [50, 40], [110, 90]);
    await (await rasterParameter(page, 'copySelected')).click();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ targetKind: 'image', permission: 'allowed', editing: false });
    const copied = await page.evaluate(() =>
      window
        .__sniptaleEditorHarness!.getCanvasObjects()
        .find((object) => object['sniptaleType'] === 'image')
    );
    expect(copied).toMatchObject({ width: 60, height: 50 });
    expect(await rasterSourcePixel(page, 20, 20)).toEqual([37, 99, 235, 255]);
    await enterRasterEditing(page);
    await page.screenshot({ path: info.outputPath('copied-source-fragment.png'), fullPage: false });
  });

  test(`raster fast erase restore and cancelled draft ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    await rasterControl(page, 'erase').click();
    const before = await rasterHistory(page);
    const point = await sourceClientPoint(page, 75, 85);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 35, point.y, { steps: 3 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await rasterHistory(page)).toBe(before);
    expect(await rasterSourcePixel(page, 75, 85)).toEqual([37, 99, 235, 255]);
    await rasterDrag(page, [55, 85], [125, 85], 1);
    await expect.poll(() => rasterHistory(page)).toBe(before + 1);
    for (const x of [55, 75, 95, 120])
      expect(await rasterSourcePixel(page, x, 85)).toEqual([0, 0, 0, 0]);
    await rasterControl(page, 'restore').click();
    await rasterDrag(page, [55, 85], [125, 85], 1);
    await expect.poll(() => rasterHistory(page)).toBe(before + 2);
    for (const x of [55, 75, 95, 120])
      expect(await rasterSourcePixel(page, x, 85)).toEqual([37, 99, 235, 255]);
    await page.screenshot({ path: info.outputPath('restored-stroke.png'), fullPage: false });
  });

  test(`raster lasso wand boolean selection and empty protection ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    await rasterControl(page, 'select').click();
    await rasterDrag(page, [50, 40], [90, 90]);
    await (await rasterParameter(page, 'lasso')).click();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selectionMethod: 'lasso' });
    const polygon = await Promise.all(
      [
        [200, 40],
        [280, 40],
        [240, 120],
      ].map(([x, y]) => sourceClientPoint(page, x!, y!))
    );
    await page.keyboard.down('Shift');
    try {
      await page.mouse.move(polygon[0]!.x, polygon[0]!.y);
      await page.mouse.down();
      for (const point of polygon.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up('Shift');
    }
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selection: 'active', busy: false });
    await (await rasterParameter(page, 'wand')).click();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selectionMethod: 'wand' });
    const blue = await sourceClientPoint(page, 70, 60);
    await page.keyboard.down('Control');
    try {
      await page.mouse.click(blue.x, blue.y);
    } finally {
      await page.keyboard.up('Control');
    }
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selection: 'active', busy: false });
    await page.keyboard.press('Delete');
    await expect.poll(() => rasterSourcePixel(page, 240, 60)).toEqual([0, 0, 0, 0]);
    expect(await rasterSourcePixel(page, 70, 60)).toEqual([37, 99, 235, 255]);
    expect(await rasterSourcePixel(page, 240, 135)).toEqual([244, 197, 66, 255]);
    await (await rasterParameter(page, 'clearSelection')).click();
    await (await rasterParameter(page, 'rectangle')).click();
    await rasterDrag(page, [50, 40], [90, 90]);
    await page.keyboard.down('Control');
    try {
      await rasterDrag(page, [50, 40], [90, 90]);
    } finally {
      await page.keyboard.up('Control');
    }
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selection: 'empty' });
    const history = await rasterHistory(page);
    await page.keyboard.press('Delete');
    expect(await rasterHistory(page)).toBe(history);
    expect(
      await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
    ).toBe(1);
    expect(await rasterSourcePixel(page, 70, 60)).toEqual([37, 99, 235, 255]);
    await expect(rasterControl(page, 'invertSelection')).toBeDisabled();
    await expect(rasterControl(page, 'copySelected')).toBeDisabled();
    await expect(rasterControl(page, 'clearSelection')).toBeEnabled();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selection: 'empty' });
    await page.screenshot({ path: info.outputPath('lasso-wand-selection.png'), fullPage: false });
  });

  test(`raster flips and existing correction inspector preserve settings ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    const before = await rasterHistory(page);
    await rasterControl(page, 'fill').click();
    await rasterControl(page, 'flipHorizontal').click();
    await expect.poll(() => rasterHistory(page)).toBe(before + 1);
    expect((await rasterDocument(page)).canvasJson).toContain('"flipX":true');
    await rasterControl(page, 'flipHorizontal').click();
    await expect.poll(() => rasterHistory(page)).toBe(before + 2);
    expect((await rasterDocument(page)).canvasJson).toContain('"flipX":false');
    await rasterControl(page, 'adjustments').click();
    const amount = page.getByRole('textbox', { name: 'Amount', exact: true });
    await expect(amount).toBeVisible();
    await expect(amount).toHaveValue('0.18');
    await amount.fill('0.2');
    await expect(amount).toHaveValue('0.2');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect
      .poll(async () => (await rasterDocument(page)).canvasJson)
      .toContain('"amount":0.2');
    await rasterControl(page, 'adjustments').click();
    await expect(amount).toHaveValue('0.2');
    await page.screenshot({
      path: info.outputPath('existing-source-correction.png'),
      fullPage: false,
    });
  });

  test(`raster reversible layer crop keeps document and source ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    const before = await rasterDocument(page);
    const history = await rasterHistory(page);
    await rasterControl(page, 'crop').click();
    await expect(page.locator('[data-ui="editor.canvas.selection-controls"]')).toBeEmpty();
    await expect(
      page.locator('[data-ui="editor.canvas.selection-chrome"]').locator('path,rect,circle,line')
    ).toHaveCount(0);
    await expect(rasterControl(page, 'freeRatio')).toHaveAttribute('aria-pressed', 'true');
    await expect(rasterControl(page, 'cropRatio').getByRole('button')).toHaveCount(2);
    await rasterDrag(page, [0, 0], [40, 30]);
    await rasterDrag(page, [320, 180], [140, 130]);
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ cropPending: true });
    expect((await rasterDocument(page)).canvasJson).toBe(before.canvasJson);
    await page.keyboard.press('Enter');
    await expect.poll(() => rasterHistory(page)).toBe(history + 1);
    const cropped = await rasterDocument(page);
    expect(cropped.canvasWidth).toBe(before.canvasWidth);
    expect(cropped.canvasHeight).toBe(before.canvasHeight);
    expect(cropped.canvasJson).toContain('"crop":{"x":40,"y":30,"width":100,"height":100}');
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ editing: true, tool: null });
    await expect(rasterControl(page, 'cursor')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('canvas.upper-canvas')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ tool: null });
    await rasterControl(page, 'crop').click();
    await rasterControl(page, 'originalRatio').click();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ cropRatio: 'original', cropPending: true });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ editing: true, tool: 'crop', cropPending: false });
    await rasterControl(page, 'freeRatio').click();
    await rasterDrag(page, [40, 30], [0, 0]);
    await rasterDrag(page, [140, 130], [320, 180]);
    await page.keyboard.press('Enter');
    await expect.poll(() => rasterHistory(page)).toBe(history + 2);
    const expanded = await rasterDocument(page);
    expect(expanded.canvasJson).toContain('"crop":{"x":0,"y":0,"width":320,"height":180}');
    expect(await rasterSourcePixel(page, 200, 70)).toEqual([244, 197, 66, 255]);
    await page.screenshot({ path: info.outputPath('expanded-layer-crop.png'), fullPage: false });
  });
}

test('raster inline numbers and adjacent selection actions remain usable at desktop widths', async ({
  page,
  hostOrigin,
}, info) => {
  await openRasterFixture(page, hostOrigin, { width: 1438, height: 560 });
  await rasterControl(page, 'select').click();
  await expect(rasterControl(page, 'selection-actions')).toHaveCount(0);
  await rasterDrag(page, [50, 40], [90, 90]);
  for (const width of [1438, 1439, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 560 });
    await expect(page.locator('[data-ui="editor.floating.tool-rail"]')).toBeInViewport();
    if (width >= 1280) {
      await expect
        .poll(async () => {
          const bounds = await page.locator('[data-ui="editor.floating.tool-rail"]').boundingBox();
          return bounds ? Math.abs(bounds.x + bounds.width / 2 - width / 2) : Infinity;
        })
        .toBeLessThanOrEqual(0.51);
    }
    await expect
      .poll(
        async () =>
          (await page.locator('[data-ui="editor.floating.tool-rail"]').boundingBox())?.height
      )
      .toBe(50);
    await expect(rasterControl(page, 'properties')).toBeInViewport();
    for (const name of ['rectangle', 'lasso', 'wand'])
      await expect(rasterControl(page, name)).toBeInViewport();
    const actions = rasterControl(page, 'selection-actions');
    await expect(actions).toBeInViewport();
    for (const name of ['clearSelection', 'invertSelection', 'copySelected']) {
      await expect(actions.locator(`[data-ui="editor.raster.${name}"]`)).toBeInViewport();
      await expect(
        rasterControl(page, 'properties').locator(`[data-ui="editor.raster.${name}"]`)
      ).toHaveCount(0);
    }
    await expect(rasterControl(page, 'selectionModifierHint')).toHaveCount(0);
    await expect(rasterControl(page, 'selectAll')).toHaveCount(0);
    await expect(rasterControl(page, 'lasso')).toHaveAttribute('title', /Shift.*Ctrl/);
    await expect(rasterControl(page, 'parameters')).toHaveCount(0);
    await rasterControl(page, 'wand').click();
    const tolerance = rasterControl(page, 'tolerance');
    await expect(tolerance).toBeInViewport();
    const value = tolerance.getByRole('textbox', { name: 'Tolerance', exact: true });
    await expect(value).toBeInViewport();
    await expect(page.getByRole('dialog', { name: 'Tolerance', exact: true })).toHaveCount(0);
    await value.fill('12');
    await value.press('Enter');
    await expect(value).not.toBeFocused();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ settings: { tolerance: 12 } });
    await tolerance.hover();
    await expect(tolerance.locator('input[type="range"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`raster-tolerance-${width}.png`),
      fullPage: false,
    });
    await rasterControl(page, 'rectangle').click();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({
        editing: true,
        tool: 'select',
        settings: { tolerance: 12 },
      });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
  }
});

test('raster Worker edits a representative4K image and restores accepted pixels', async ({
  page,
  hostOrigin,
}, info) => {
  test.setTimeout(120000);
  await openRasterFixture(
    page,
    hostOrigin,
    { width: 1280, height: 560 },
    { width: 3840, height: 2160, mixed: true }
  );
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(0.2));
  await rasterControl(page, 'erase').click();
  const start = Date.now();
  await rasterDrag(page, [900, 1020], [1500, 1020], 2);
  await expect.poll(() => rasterSourcePixel(page, 1200, 1020)).toEqual([0, 0, 0, 0]);
  const eraseMs = Date.now() - start;
  expect(await rasterSourcePixel(page, 1200, 1080)).toEqual([37, 99, 235, 255]);
  await rasterControl(page, 'restore').click();
  const restoreStart = Date.now();
  await rasterDrag(page, [900, 1020], [1500, 1020], 2);
  await expect.poll(() => rasterSourcePixel(page, 1200, 1020)).toEqual([37, 99, 235, 255]);
  const restoreMs = Date.now() - restoreStart;
  await expect.poll(() => rasterSnapshot(page)).toMatchObject({ busy: false });
  const beforePaintRevision = await page.evaluate(
    () => window.__sniptaleEditorHarness!.getInteractionState().historyRevision
  );
  const objectCount = await page.evaluate(
    () => window.__sniptaleEditorHarness!.getCanvasObjects().length
  );
  await rasterControl(page, 'brush').click();
  const paintStart = Date.now();
  await rasterDrag(page, [600, 300], [3000, 1800], 60);
  await expect.poll(() => rasterSourcePixel(page, 1800, 1050)).toEqual([255, 69, 0, 255]);
  // A large distinct raster can prune old snapshots; the revision still counts publications.
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyRevision)
    )
    .toBe(beforePaintRevision + 1);
  await expect.poll(() => rasterSourcePixel(page, 1800, 1050)).toEqual([255, 69, 0, 255]);
  expect(await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)).toBe(
    objectCount
  );
  const paintMs = Date.now() - paintStart;
  const observationPath = info.outputPath('4k-worker-observation.json');
  await writeFile(
    observationPath,
    JSON.stringify(
      {
        width: 3840,
        height: 2160,
        eraseMs,
        restoreMs,
        paintMs,
      },
      null,
      2
    )
  );
  await info.attach('4k-worker-observation', {
    path: observationPath,
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('4k-painted.png'), fullPage: false });
});
