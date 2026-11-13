import { writeFile } from 'node:fs/promises';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import {
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
    await (await rasterParameter(page, 'hideSelected')).click();
    await expect.poll(() => rasterHistory(page)).toBe(baseline + 1);
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([0, 0, 0, 0]);
    expect(await rasterSourcePixel(page, 45, 70)).toEqual([37, 99, 235, 255]);
    const document = await rasterDocument(page);
    expect(document.version).toBe(3);
    expect(document.canvasJson).toContain('sniptaleRasterOriginalData');
    expect(document.canvasJson).toContain('sniptaleRasterVisibilityData');
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => rasterHistory(page)).toBe(baseline);
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([37, 99, 235, 255]);
    await page.locator('[data-ui="editor.floating.tool-rail.history.redo"]').click();
    await expect.poll(() => rasterHistory(page)).toBe(baseline + 1);
    await expect.poll(() => rasterSourcePixel(page, 80, 70)).toEqual([0, 0, 0, 0]);
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
      .toMatchObject({ targetKind: 'image', permission: 'allowed' });
    const copied = await page.evaluate(() =>
      window
        .__sniptaleEditorHarness!.getCanvasObjects()
        .find((object) => object['sniptaleType'] === 'image')
    );
    expect(copied).toMatchObject({ width: 60, height: 50 });
    expect(await rasterSourcePixel(page, 20, 20)).toEqual([37, 99, 235, 255]);
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
    await (await rasterParameter(page, 'restore')).click();
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
    await (await rasterParameter(page, 'selectionMode.add')).click();
    await (await rasterParameter(page, 'lasso')).click();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selectionMode: 'add', selectionMethod: 'lasso' });
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    const polygon = await Promise.all(
      [
        [200, 40],
        [280, 40],
        [240, 120],
      ].map(([x, y]) => sourceClientPoint(page, x!, y!))
    );
    await page.mouse.move(polygon[0]!.x, polygon[0]!.y);
    await page.mouse.down();
    for (const point of polygon.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selection: 'active', busy: false });
    await (await rasterParameter(page, 'selectionMode.subtract')).click();
    await (await rasterParameter(page, 'wand')).click();
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selectionMode: 'subtract', selectionMethod: 'wand' });
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    const blue = await sourceClientPoint(page, 70, 60);
    await page.mouse.click(blue.x, blue.y);
    await expect
      .poll(() => rasterSnapshot(page))
      .toMatchObject({ selection: 'active', busy: false });
    await (await rasterParameter(page, 'hideSelected')).click();
    await expect.poll(() => rasterSourcePixel(page, 240, 60)).toEqual([0, 0, 0, 0]);
    expect(await rasterSourcePixel(page, 70, 60)).toEqual([37, 99, 235, 255]);
    expect(await rasterSourcePixel(page, 240, 135)).toEqual([244, 197, 66, 255]);
    await (await rasterParameter(page, 'clearSelection')).click();
    await (await rasterParameter(page, 'selectionMode.new')).click();
    await (await rasterParameter(page, 'rectangle')).click();
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    await rasterDrag(page, [50, 40], [90, 90]);
    await (await rasterParameter(page, 'selectionMode.subtract')).click();
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    await rasterDrag(page, [50, 40], [90, 90]);
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selection: 'empty' });
    const history = await rasterHistory(page);
    await page.keyboard.press('Delete');
    expect(await rasterHistory(page)).toBe(history);
    expect(
      await page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects().length)
    ).toBe(1);
    expect(await rasterSourcePixel(page, 70, 60)).toEqual([37, 99, 235, 255]);
    await (await rasterParameter(page, 'invertSelection')).click();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ selection: 'active' });
    await page.screenshot({ path: info.outputPath('lasso-wand-selection.png'), fullPage: false });
  });

  test(`raster flips and existing correction inspector preserve settings ${viewport.name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    await openRasterFixture(page, hostOrigin, viewport.size);
    const before = await rasterHistory(page);
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
    const ratio = (await rasterParameter(page, 'cropRatio')).getByRole('button', {
      name: 'Crop ratio',
      exact: true,
    });
    await ratio.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(ratio).toBeFocused();
    await ratio.click();
    await page.getByRole('option', { name: '1:1', exact: true }).click();
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ cropRatio: '1:1', tool: 'crop' });
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    await rasterDrag(page, [40, 30], [140, 140]);
    await expect.poll(() => rasterSnapshot(page)).toMatchObject({ cropPending: true });
    expect((await rasterDocument(page)).canvasJson).toBe(before.canvasJson);
    await (await rasterParameter(page, 'applyCrop')).click();
    await expect.poll(() => rasterHistory(page)).toBe(history + 1);
    const cropped = await rasterDocument(page);
    expect(cropped.canvasWidth).toBe(before.canvasWidth);
    expect(cropped.canvasHeight).toBe(before.canvasHeight);
    expect(cropped.canvasJson).toContain('"crop":{"x":40,"y":30,"width":100,"height":100}');
    await (
      await rasterParameter(page, 'cropRatio')
    )
      .getByRole('button', { name: 'Crop ratio', exact: true })
      .click();
    await page.getByRole('option', { name: 'Free ratio', exact: true }).click();
    if (await page.getByRole('dialog', { name: 'Tool parameters', exact: true }).count())
      await page.keyboard.press('Escape');
    await rasterDrag(page, [0, 0], [320, 180]);
    await (await rasterParameter(page, 'applyCrop')).click();
    await expect.poll(() => rasterHistory(page)).toBe(history + 2);
    const expanded = await rasterDocument(page);
    expect(expanded.canvasJson).toContain('"crop":{"x":0,"y":0,"width":320,"height":180}');
    expect(await rasterSourcePixel(page, 200, 70)).toEqual([244, 197, 66, 255]);
    await page.screenshot({ path: info.outputPath('expanded-layer-crop.png'), fullPage: false });
  });
}

test('raster controls fit breakpoint and short desktop viewports', async ({
  page,
  hostOrigin,
}, info) => {
  await openRasterFixture(page, hostOrigin, { width: 1499, height: 560 });
  await rasterControl(page, 'select').click();
  for (const width of [1499, 1500, 1501, 1024]) {
    await page.setViewportSize({ width, height: 560 });
    const toolbar = rasterControl(page, 'toolbar');
    await expect(toolbar).toBeInViewport();
    if (width < 1500) {
      await rasterControl(page, 'parameters').click();
      const popup = page.getByRole('dialog', { name: 'Tool parameters', exact: true });
      await expect(popup).toBeInViewport();
      await expect(rasterControl(page, 'selectionMode.subtract')).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`raster-parameters-${width}.png`),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(popup).toHaveCount(0);
      await expect(rasterControl(page, 'parameters')).toBeFocused();
    } else {
      await expect(rasterControl(page, 'parameters')).toHaveCount(0);
      await expect(rasterControl(page, 'selectionMode.subtract')).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`raster-inline-${width}.png`),
        fullPage: false,
      });
    }
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
  await (await rasterParameter(page, 'restore')).click();
  const restoreStart = Date.now();
  await rasterDrag(page, [900, 1020], [1500, 1020], 2);
  await expect.poll(() => rasterSourcePixel(page, 1200, 1020)).toEqual([37, 99, 235, 255]);
  const observationPath = info.outputPath('4k-worker-observation.json');
  await writeFile(
    observationPath,
    JSON.stringify(
      {
        width: 3840,
        height: 2160,
        eraseMs,
        restoreMs: Date.now() - restoreStart,
      },
      null,
      2
    )
  );
  await info.attach('4k-worker-observation', {
    path: observationPath,
    contentType: 'application/json',
  });
  await page.screenshot({ path: info.outputPath('4k-restored.png'), fullPage: false });
});
