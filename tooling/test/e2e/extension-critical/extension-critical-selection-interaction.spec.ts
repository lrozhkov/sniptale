import { writeFile } from 'node:fs/promises';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { translate } from '../../../../apps/extension/src/platform/i18n';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { applyHarnessBootstrap, EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

test.use({ actionTimeout: 10000 });

type Point = { x: number; y: number };
const controls = (page: Page) => page.locator('[data-ui="editor.canvas.selection-controls"]');
const history = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);
const objects = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getCanvasObjects());
const rendered = (page: Page) => page.evaluate(() => window.__sniptaleEditorHarness!.renderImage());

async function assertRestoredPng(page: Page, expected: string, info: TestInfo, label: string) {
  await writeFile(
    info.outputPath(`${label}-before.png`),
    Buffer.from(expected.split(',')[1]!, 'base64')
  );
  await expect
    .poll(async () => {
      const actual = await rendered(page);
      const difference = await page.evaluate(
        async ({ expected, actual }) => {
          const read = async (url: string) => {
            const image = await createImageBitmap(await (await fetch(url)).blob());
            const canvas = new OffscreenCanvas(image.width, image.height);
            const context = canvas.getContext('2d')!;
            context.drawImage(image, 0, 0);
            const result = {
              data: context.getImageData(0, 0, image.width, image.height).data,
              width: image.width,
              height: image.height,
            };
            image.close();
            return result;
          };
          const [before, after] = await Promise.all([read(expected), read(actual)]);
          if (before.width !== after.width || before.height !== after.height)
            throw new Error('Undo changed export dimensions');
          const { width, height } = before;
          // History projection permits 0.5 CSS px; exported antialiasing has a 1 raster px budget.
          const inNeighborhood = (reference: Uint8ClampedArray, offset: number, value: number) => {
            const pixel = Math.floor(offset / 4);
            const x = pixel % width;
            const y = Math.floor(pixel / width);
            const channel = offset % 4;
            let minimum = 255;
            let maximum = 0;
            for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
              for (
                let column = Math.max(0, x - 1);
                column <= Math.min(width - 1, x + 1);
                column++
              ) {
                const sample = reference[(row * width + column) * 4 + channel]!;
                minimum = Math.min(minimum, sample);
                maximum = Math.max(maximum, sample);
              }
            }
            return value >= minimum && value <= maximum;
          };
          let changedPixels = 0;
          let maximumChannelError = 0;
          let pixelsOutsideOnePixelNeighborhood = 0;
          for (let offset = 0; offset < before.data.length; offset += 4) {
            let maximum = 0;
            for (let channel = 0; channel < 4; channel++)
              maximum = Math.max(
                maximum,
                Math.abs(before.data[offset + channel]! - after.data[offset + channel]!)
              );
            if (maximum) {
              changedPixels++;
              for (let channel = 0; channel < 4; channel++) {
                const index = offset + channel;
                if (
                  !inNeighborhood(after.data, index, before.data[index]!) ||
                  !inNeighborhood(before.data, index, after.data[index]!)
                ) {
                  pixelsOutsideOnePixelNeighborhood++;
                  break;
                }
              }
            }
            maximumChannelError = Math.max(maximumChannelError, maximum);
          }
          return { changedPixels, maximumChannelError, pixelsOutsideOnePixelNeighborhood };
        },
        { expected, actual }
      );
      if (difference.changedPixels)
        await writeFile(
          info.outputPath(`${label}-actual.png`),
          Buffer.from(actual.split(',')[1]!, 'base64')
        );
      return difference;
    })
    .toMatchObject({ pixelsOutsideOnePixelNeighborhood: 0 });
}

async function center(locator: Locator): Promise<Point> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Selection control has no visible bounds');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function handle(page: Page, key: string) {
  return center(controls(page).locator(`[data-control="${key}"]`));
}

async function selectionGeometry(page: Page) {
  const [tl, tr, br, bl] = await Promise.all(
    ['tl', 'tr', 'br', 'bl'].map((key) => handle(page, key))
  );
  return {
    tl: tl!,
    tr: tr!,
    br: br!,
    bl: bl!,
    center: { x: (tl!.x + br!.x) / 2, y: (tl!.y + br!.y) / 2 },
  };
}

function maximumError(
  a: Awaited<ReturnType<typeof selectionGeometry>>,
  b: Awaited<ReturnType<typeof selectionGeometry>>
) {
  return Math.max(
    ...(['tl', 'tr', 'br', 'bl'] as const).map((key) =>
      Math.hypot(a[key].x - b[key].x, a[key].y - b[key].y)
    )
  );
}

async function drag(page: Page, from: Point, to: Point, modifiers: string[] = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  for (const modifier of modifiers.toReversed()) await page.keyboard.up(modifier);
}

async function selectLayer(page: Page, id: string, additive = false) {
  const marker = page.locator(`[data-editor-layer-id="${id}"]`);
  await expect(marker).toBeVisible();
  const button = (await marker.evaluate((node) => node.tagName === 'BUTTON'))
    ? marker
    : marker.getByRole('button', {
        name: translate('editor.toolbar.toggleLayerSelection', 'en'),
        exact: true,
      });
  await button.click({ modifiers: additive ? ['Control'] : [] });
}

async function groupSelection(page: Page) {
  await page
    .locator('[data-ui="editor.layers.selection-actions.mass-group"]')
    .getByRole('button', {
      name: translate('editor.toolbar.groupLayers', 'en'),
      exact: true,
    })
    .click();
  const group = (await objects(page)).find((object) => object['sniptaleType'] === 'group');
  const id = group?.['sniptaleId'];
  if (typeof id !== 'string') throw new Error('UI grouping did not create a group identity');
  return id;
}

async function openEditor(
  page: Page,
  hostOrigin: string,
  size: { width: number; height: number },
  keepChromeVisible = false
) {
  await page.setViewportSize(size);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  });
  await applyHarnessBootstrap(page, {
    storage: {
      'sniptale-locale-preference': 'en',
      'sniptale-theme-preference': size.width === 1920 ? 'dark' : 'light',
      ...(keepChromeVisible
        ? { sniptale_editor_workspace_defaults: { hideSelectionWhileDragging: false } }
        : {}),
    },
    editorBootstrapPayload: { dataUrl, title: 'Selection interactions' },
  });
  await page.addInitScript(() => localStorage.setItem('sniptale-locale-preference', 'en'));
  await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
  await expect
    .poll(() =>
      page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
    )
    .toBe(true);
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
  await page.evaluate(() => document.fonts.ready);
  const sourceLock = page.locator('[data-ui="editor.layers.list-viewport"]').getByRole('button', {
    name: translate('editor.toolbar.lockLayer', 'en'),
    exact: true,
  });
  if (await sourceLock.count()) await sourceLock.first().click();
  const viewport = (await page.locator('[data-ui="editor.canvas.viewport"]').boundingBox())!;
  const boundary = (await page
    .locator('[data-ui="editor.canvas.document-boundary"]')
    .boundingBox())!;
  return {
    x: Math.max(boundary.x + 40, viewport.x + 110),
    y: Math.max(boundary.y + 120, viewport.y + 120),
  };
}

async function rectangle(page: Page, from: Point, width = 80, height = 55) {
  const before = new Set((await objects(page)).map((object) => object['sniptaleId']));
  await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
  await page.locator('[data-ui="editor.floating.tool-rail.shape"]').click();
  await page.locator('[data-ui="content.toolbar.drawing-options.shape.kind-rectangle"]').click();
  await drag(page, from, { x: from.x + width, y: from.y + height });
  await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
  const object = (await objects(page)).find(
    (candidate) => !before.has(candidate['sniptaleId']) && candidate['sniptaleType'] === 'shape'
  );
  const id = object?.['sniptaleId'];
  if (typeof id !== 'string')
    throw new Error('Pointer drawing did not create a rectangle identity');
  return id;
}

async function checkControlMetrics(page: Page) {
  const corner = controls(page).locator('[data-control="tl"]');
  const side = controls(page).locator('[data-control="ml"]');
  await expect(corner).toHaveAttribute('width', '9');
  await expect(corner).toHaveAttribute('height', '9');
  await expect(side).toHaveAttribute('width', '6');
  await expect(side).toHaveAttribute('height', '12');
  const rotate = controls(page).locator('[data-control="mtr"]');
  await expect(rotate).toHaveAttribute('fill', 'none');
  const iconSize = await rotate.evaluate((node) => {
    if (!(node instanceof SVGGraphicsElement)) throw new Error('Rotation control is not SVG');
    const matrix = node.getScreenCTM()!;
    return 24 * Math.hypot(matrix.a, matrix.b);
  });
  expect(iconSize).toBeCloseTo(24, 1);
  const attributes = () =>
    controls(page)
      .locator('[data-control]')
      .evaluateAll((nodes) =>
        nodes.map((node) =>
          ['width', 'height', 'fill', 'stroke', 'transform', 'd'].map((name) =>
            node.getAttribute(name)
          )
        )
      );
  const before = await attributes();
  const point = await center(corner);
  await page.mouse.move(point.x, point.y);
  await expect.poll(attributes).toEqual(before);
  const rotation = await center(rotate);
  await page.mouse.move(rotation.x, rotation.y);
  await expect.poll(attributes).toEqual(before);
}

async function rotationGeometry(page: Page, text: boolean) {
  const icon = controls(page).locator('[data-control="mtr"]');
  await expect(icon).toBeVisible();
  return icon.evaluate((node, text) => {
    if (!(node instanceof SVGGraphicsElement)) throw new Error('Missing rotation SVG');
    const matrix = node.getScreenCTM()!;
    const box = node.getBBox();
    const middle = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(
      matrix
    );
    const owner = node.parentElement!;
    let corner: DOMPoint;
    if (text) {
      const border = owner.querySelector<SVGPolygonElement>(
        'polygon:not([data-ui="editor.canvas.parent-group-context"])'
      )!;
      const point = border.points.getItem(1);
      corner = new DOMPoint(point.x, point.y).matrixTransform(border.getScreenCTM()!);
    } else {
      const handle = owner.querySelector<SVGGraphicsElement>('[data-control="tr"]')!;
      const rect = handle.getBoundingClientRect();
      corner = new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    }
    return {
      width: box.width * Math.hypot(matrix.a, matrix.b),
      height: box.height * Math.hypot(matrix.c, matrix.d),
      gap: Math.hypot(middle.x - corner.x, middle.y - corner.y),
    };
  }, text);
}

async function checkRotationZoom(page: Page, text: boolean, id: string, info: TestInfo) {
  const boundary = page.locator('[data-ui="editor.canvas.document-boundary"]');
  const baseWidth = (await boundary.boundingBox())!.width;
  const baseline = await rotationGeometry(page, text);
  const autoNavigate = page.locator('[data-ui="editor.layers.auto-navigate"]');
  const wasNavigating = (await autoNavigate.getAttribute('aria-pressed')) === 'true';
  if (!wasNavigating) await autoNavigate.click();
  for (const zoom of [0.2, 1, 4]) {
    await page.evaluate((value) => window.__sniptaleEditorHarness!.setZoomLevel(value), zoom);
    await expect
      .poll(async () => (await boundary.boundingBox())!.width)
      .toBeCloseTo(baseWidth * zoom, 0);
    await selectLayer(page, id);
    const current = await rotationGeometry(page, text);
    expect(Math.abs(current.width - baseline.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(current.height - baseline.height)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(current.gap - baseline.gap)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: info.outputPath(`${text ? 'text' : 'rectangle'}-rotation-${zoom}.png`),
      fullPage: false,
    });
  }
  await page.evaluate(() => window.__sniptaleEditorHarness!.setZoomLevel(1));
  await expect.poll(async () => (await boundary.boundingBox())!.width).toBeCloseTo(baseWidth, 0);
  await selectLayer(page, id);
  if (!wasNavigating) await autoNavigate.click();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`nested group gestures, tree choice and reversible transforms ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const origin = await openEditor(page, hostOrigin, size);
    const first = await rectangle(page, origin);
    const second = await rectangle(page, { x: origin.x + 160, y: origin.y });
    await selectLayer(page, first);
    await selectLayer(page, second, true);
    const inner = await groupSelection(page);
    const beforeParent = await selectionGeometry(page);
    const rotation = await handle(page, 'mtr');
    const radians = Math.PI / 6;
    const dx = rotation.x - beforeParent.center.x;
    const dy = rotation.y - beforeParent.center.y;
    await drag(
      page,
      rotation,
      {
        x: beforeParent.center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: beforeParent.center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
      },
      ['Alt']
    );
    const parentRotated = await selectionGeometry(page);
    const parentAngle =
      (Math.atan2(
        parentRotated.tr.y - parentRotated.tl.y,
        parentRotated.tr.x - parentRotated.tl.x
      ) *
        180) /
      Math.PI;
    expect(parentAngle).toBeGreaterThan(20);
    expect(parentAngle).toBeLessThan(40);
    await drag(page, parentRotated.br, { x: parentRotated.br.x + 22, y: parentRotated.br.y + 15 }, [
      'Alt',
    ]);
    expect(
      Number((await objects(page)).find((object) => object['sniptaleId'] === inner)!['scaleX'])
    ).toBeGreaterThan(1);
    const innerCenter = (await selectionGeometry(page)).center;
    await page.locator('[data-ui="editor.floating.tool-rail.text"]').click();
    await page.mouse.click(origin.x + 30, origin.y + 170);
    await page.keyboard.insertText('Group text');
    await page.keyboard.press('Enter');
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    const text = (await objects(page)).find((object) => object['sniptaleType'] === 'text');
    const textId = text?.['sniptaleId'];
    if (typeof textId !== 'string') throw new Error('Text insertion did not create an identity');
    await selectLayer(page, inner);
    await selectLayer(page, textId, true);
    const outer = await groupSelection(page);
    await page.mouse.dblclick(innerCenter.x, innerCenter.y);
    await expect(page.locator(`[data-editor-layer-id="${inner}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await selectLayer(page, first);
    const initial = await selectionGeometry(page);
    await page.mouse.click(initial.center.x, initial.center.y);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.mouse.dblclick(initial.center.x, initial.center.y);
    await expect(page.locator(`[data-editor-layer-id="${inner}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await page.mouse.dblclick(initial.center.x, initial.center.y);
    await expect(page.locator(`[data-editor-layer-id="${first}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const context = page.locator('[data-ui="editor.canvas.parent-group-context"]');
    await expect(context).toHaveCount(1);
    await expect(context).toHaveAttribute('stroke', 'var(--sniptale-color-text-muted, #64748b)');
    await expect(context).toHaveAttribute('stroke-dasharray', /4.*3/u);
    await expect(page.locator(`[data-editor-layer-id="${outer}"]`)).toHaveAttribute(
      'data-parent-context',
      'true'
    );
    await expect(
      controls(page).locator('polygon:not([data-ui="editor.canvas.parent-group-context"])')
    ).toHaveCount(0);
    await checkControlMetrics(page);
    await checkRotationZoom(page, false, first, info);
    const acceptedGeometry = await selectionGeometry(page);
    await page.screenshot({
      path: info.outputPath('nested-child-neutral-context.png'),
      fullPage: false,
    });
    const selectChild = async (id: string) => {
      await selectLayer(page, outer);
      await selectLayer(page, inner);
      await selectLayer(page, id);
    };
    await selectChild(second);
    const peer = await selectionGeometry(page);
    await selectChild(first);
    const pngBefore = await rendered(page);
    const historyBefore = await history(page);
    const selected = await selectionGeometry(page);
    await drag(page, selected.center, { x: selected.center.x + 24, y: selected.center.y + 14 }, [
      'Alt',
    ]);
    await expect.poll(() => history(page)).toBe(historyBefore + 1);
    const moved = await selectionGeometry(page);
    expect(moved.center.x - selected.center.x).toBeCloseTo(24, 0);
    expect(moved.center.y - selected.center.y).toBeCloseTo(14, 0);
    await selectChild(second);
    expect(maximumError(await selectionGeometry(page), peer)).toBeLessThanOrEqual(1);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await assertRestoredPng(page, pngBefore, info, 'child-drag-undo');
    await selectChild(first);
    const beforeResize = await selectionGeometry(page);
    expect(maximumError(beforeResize, selected)).toBeLessThanOrEqual(0.5);
    const resizeHistory = await history(page);
    await drag(page, beforeResize.br, { x: beforeResize.br.x + 18, y: beforeResize.br.y + 18 }, [
      'Alt',
    ]);
    await expect.poll(() => history(page)).toBe(resizeHistory + 1);
    expect(maximumError(await selectionGeometry(page), beforeResize)).toBeGreaterThan(5);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await assertRestoredPng(page, pngBefore, info, 'child-resize-undo');
    await selectChild(first);
    const beforeRotate = await selectionGeometry(page);
    const childRotation = await handle(page, 'mtr');
    const rotateHistory = await history(page);
    await drag(page, childRotation, { x: childRotation.x + 25, y: childRotation.y + 15 }, ['Alt']);
    await expect.poll(() => history(page)).toBe(rotateHistory + 1);
    expect(maximumError(await selectionGeometry(page), beforeRotate)).toBeGreaterThan(3);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await assertRestoredPng(page, pngBefore, info, 'child-rotation-undo');
    await selectChild(first);
    const afterUndo = await selectionGeometry(page);
    expect(maximumError(afterUndo, acceptedGeometry)).toBeLessThanOrEqual(0.5);
    const gestureHistory = await history(page);
    const gesturePng = await rendered(page);
    await page.keyboard.down('Alt');
    await page.mouse.move(afterUndo.center.x, afterUndo.center.y);
    await page.mouse.down();
    await page.mouse.move(afterUndo.center.x + 8, afterUndo.center.y + 5, { steps: 4 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await expect(page.locator(`[data-editor-layer-id="${first}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(context).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().transform)
      )
      .toBeNull();
    await expect.poll(() => history(page)).toBe(gestureHistory);
    await expect.poll(() => rendered(page)).toBe(gesturePng);
    await selectChild(first);
    await selectLayer(page, outer, true);
    await expect(
      page.locator('[data-ui="editor.layers.group-child"][aria-pressed="true"]')
    ).toHaveCount(0);
    await expect(controls(page).locator('[data-control="tl"]')).toHaveCount(1);
    await selectLayer(page, textId);
    await checkRotationZoom(page, true, textId, info);
    const widthHandle = controls(page).locator('[data-control="mr"]');
    const capturedPoint = await center(widthHandle);
    const capturedColor = await widthHandle.getAttribute('stroke');
    if (!capturedColor) throw new Error('Text width control has no selection color');
    const widthHistory = await history(page);
    await page.mouse.move(capturedPoint.x, capturedPoint.y);
    await page.mouse.down();
    await page.mouse.move(capturedPoint.x + 30, capturedPoint.y + 45, { steps: 4 });
    await expect
      .poll(() =>
        page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().transform?.corner)
      )
      .toBe('mr');
    await expect(widthHandle).toHaveAttribute('fill', capturedColor);
    await expect(controls(page).locator('[data-control="ml"]')).toHaveAttribute('fill', '#fff');
    await page.mouse.move(capturedPoint.x + 35, capturedPoint.y + 70, { steps: 4 });
    await expect(widthHandle).toHaveAttribute('fill', capturedColor);
    await page.screenshot({
      path: info.outputPath('captured-text-width-off-handle.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await expect(widthHandle).toHaveAttribute('fill', '#fff');
    await expect.poll(() => history(page)).toBe(widthHistory + 1);
    const textCenter = await center(
      controls(page).locator('polygon:not([data-ui="editor.canvas.parent-group-context"])')
    );
    const textHistory = await history(page);
    await page.mouse.dblclick(textCenter.x, textCenter.y);
    const input = page.locator('textarea[data-fabric="textarea"]');
    await expect(input).toHaveValue('Group text');
    await expect(controls(page).locator('[data-control]')).toHaveCount(0);
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText('Cancelled text');
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(page.locator(`[data-editor-layer-id="${textId}"]`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(await history(page)).toBe(textHistory);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="editor.canvas.parent-group-context"]')).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('group-exit-after-text-cancel.png'),
      fullPage: false,
    });
    const selectedExport = await rendered(page);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    expect(await rendered(page)).toBe(selectedExport);
    expect(errors).toEqual([]);
  });

  test(`marquee containment, direction and Escape restore selection ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const origin = await openEditor(page, hostOrigin, size);
    const first = await rectangle(page, origin);
    const second = await rectangle(page, { x: origin.x + 150, y: origin.y });
    const selectedRows = page
      .locator('[data-ui="editor.layers.list-viewport"]')
      .getByRole('button', {
        name: translate('editor.toolbar.toggleLayerSelection', 'en'),
        exact: true,
        pressed: true,
      });
    const beforeHistory = await history(page);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await page.locator(`[data-editor-layer-id="${first}"]`).hover();
    const rowOutline = page.locator(
      `[data-ui="editor.canvas.selection-preview-outline"][data-layer-id="${first}"]`
    );
    await expect(rowOutline).toBeVisible();
    await page.screenshot({
      path: info.outputPath('layer-row-hover-outline.png'),
      fullPage: false,
    });
    await page.mouse.move(origin.x + 40, origin.y + 25);
    await expect(rowOutline).toBeVisible();
    await expect(rowOutline).toHaveAttribute('stroke-dasharray', '');
    await expect(
      page.locator('[data-ui="editor.canvas.selection-preview"] [data-control]')
    ).toHaveCount(0);
    await page.mouse.move(origin.x + 300, origin.y + 160);
    await expect(rowOutline).toHaveCount(0);
    const start = { x: origin.x - 25, y: origin.y - 25 };
    const partial = { x: origin.x + 175, y: origin.y + 90 };
    await drag(page, start, partial);
    await expect(selectedRows).toHaveCount(1);
    await selectLayer(page, first);
    const previous = await selectionGeometry(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const end = { x: origin.x + 260, y: origin.y + 90 };
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.screenshot({ path: info.outputPath('marquee-candidates.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(selectedRows).toHaveCount(1);
    expect(maximumError(await selectionGeometry(page), previous)).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await drag(page, start, end);
    await expect(selectedRows).toHaveCount(2);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    await drag(page, end, start);
    await expect(selectedRows).toHaveCount(2);
    expect(await history(page)).toBe(beforeHistory);
    await page.screenshot({
      path: info.outputPath('marquee-reverse-accepted.png'),
      fullPage: false,
    });
    await selectLayer(page, second);
    await checkControlMetrics(page);
    await expect(controls(page).locator('polygon')).toHaveCount(0);
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`arrow ready points and captured inserted bend retain identity ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const origin = await openEditor(page, hostOrigin, size, true);
    await page.locator('[data-ui="editor.floating.tool-rail.arrow"]').click();
    await page.locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]').click();
    const start = { x: origin.x + 20, y: origin.y + 25 };
    await drag(page, start, { x: start.x + 300, y: start.y });
    const arrow = (await objects(page)).find((object) => object['sniptaleType'] === 'arrow');
    const arrowId = arrow?.['sniptaleId'];
    if (typeof arrowId !== 'string') throw new Error('Arrow drawing did not create an identity');
    await page.locator('[data-ui="editor.floating.tool-rail.select"]').click();
    await selectLayer(page, arrowId);
    const points = controls(page).locator('circle');
    await expect(points).toHaveCount(2);
    const ghost = controls(page).locator('[data-control="bend-insert"]');
    const middle = { x: start.x + 150, y: start.y };
    await page.mouse.move(middle.x, middle.y);
    await expect(ghost).toHaveAttribute('fill', '#fff');
    await expect(ghost).toHaveAttribute('r', '5');
    await drag(page, middle, { x: middle.x, y: middle.y + 55 });
    await page.mouse.move(start.x + 350, start.y + 140);
    const oldBend = controls(page).locator('[data-control="bend-0"]');
    await expect(oldBend).toHaveAttribute('fill', '#fff');
    const oldCenter = await center(oldBend);
    await page.mouse.move(oldCenter.x, oldCenter.y);
    const accent = await oldBend.getAttribute('stroke');
    if (!accent) throw new Error('Arrow point has no blue selection stroke');
    await expect(oldBend).toHaveAttribute('fill', accent);
    await expect(oldBend).toHaveAttribute('r', '5');
    for (const key of ['start', 'end'])
      await expect(controls(page).locator(`[data-control="${key}"]`)).toHaveAttribute(
        'fill',
        '#fff'
      );
    await page.screenshot({
      path: info.outputPath('arrow-existing-point-ready.png'),
      fullPage: false,
    });
    const candidate = { x: start.x + 300 * 0.21875, y: start.y + 55 * 0.5625 };
    await page.mouse.move(candidate.x, candidate.y);
    await expect(ghost).toHaveAttribute('fill', '#fff');
    await expect(oldBend).toHaveAttribute('fill', '#fff');
    const insertion = await center(ghost);
    const before = await history(page);
    await page.mouse.move(insertion.x, insertion.y);
    await page.mouse.down();
    await page.mouse.move(insertion.x - 10, insertion.y + 35, { steps: 5 });
    await expect(controls(page)).toHaveCSS('opacity', '1');
    await expect(ghost).toHaveCSS('opacity', '1');
    await expect(ghost).toHaveAttribute('fill', accent);
    await expect(oldBend).toHaveAttribute('fill', '#fff');
    const retained = await center(oldBend);
    expect(Math.hypot(retained.x - oldCenter.x, retained.y - oldCenter.y)).toBeLessThanOrEqual(0.5);
    for (const key of ['start', 'end'])
      await expect(controls(page).locator(`[data-control="${key}"]`)).toHaveAttribute(
        'fill',
        '#fff'
      );
    await page.mouse.move(insertion.x + 5, insertion.y + 75, { steps: 5 });
    await expect(controls(page)).toHaveCSS('opacity', '1');
    await expect(ghost).toHaveCSS('opacity', '1');
    await expect(ghost).toHaveAttribute('fill', accent);
    await expect(oldBend).toHaveAttribute('fill', '#fff');
    expect(await history(page)).toBe(before);
    await page.screenshot({
      path: info.outputPath('arrow-insert-captured-old-neighbor-neutral.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await page.mouse.move(start.x + 350, start.y + 140);
    await expect.poll(() => history(page)).toBe(before + 1);
    await expect(controls(page).locator('[data-control="bend-1"]')).toBeVisible();
    await expect(controls(page).locator('[data-control="bend-0"]')).toHaveAttribute('fill', '#fff');
    await expect(controls(page).locator('[data-control="bend-1"]')).toHaveAttribute('fill', '#fff');
    await expect(controls(page).locator('polygon')).toHaveCount(0);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => history(page)).toBe(before);
    await expect(controls(page).locator('[data-control="bend-1"]')).toHaveCount(0);
    await selectLayer(page, arrowId);
    await expect(controls(page).locator('[data-control="bend-0"]')).toBeVisible();
    await expect(controls(page).locator('[data-control="bend-1"]')).toHaveCount(0);
    const restored = await center(controls(page).locator('[data-control="bend-0"]'));
    expect(Math.hypot(restored.x - oldCenter.x, restored.y - oldCenter.y)).toBeLessThanOrEqual(0.5);
  });
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`grouped arrow points keep scene geometry and solid rectangle hover ${name}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const origin = await openEditor(page, hostOrigin, size, true);
    await page.locator('[data-ui="editor.floating.tool-rail.arrow"]').click();
    await page.locator('[data-ui="content.toolbar.drawing-options.arrow.freehand"]').click();
    const start = { x: origin.x + 20, y: origin.y + 25 };
    await drag(page, start, { x: start.x + 200, y: start.y });
    const arrowId = (await objects(page)).find((object) => object['sniptaleType'] === 'arrow')?.[
      'sniptaleId'
    ];
    if (typeof arrowId !== 'string') throw new Error('Grouped arrow identity missing');
    const rectangleId = await rectangle(page, { x: origin.x + 250, y: origin.y + 90 }, 60, 45);
    await page.evaluate(() => window.__sniptaleEditorHarness!.clearSelection());
    const hover = page.locator(
      `[data-ui="editor.canvas.selection-preview-outline"][data-layer-id="${rectangleId}"]`
    );
    await page.mouse.move(origin.x + 280, origin.y + 110);
    await expect(hover).toBeVisible();
    await expect(hover).toHaveAttribute('stroke-dasharray', '');
    await expect(
      page.locator('[data-ui="editor.canvas.selection-preview"] [data-control]')
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath('solid-rectangle-canvas-hover.png'),
      fullPage: false,
    });
    await page.mouse.move(origin.x + 370, origin.y + 180);
    await expect(hover).toHaveCount(0);
    await selectLayer(page, arrowId);
    await selectLayer(page, rectangleId, true);
    const group = await groupSelection(page);
    const before = await selectionGeometry(page);
    const rotation = await handle(page, 'mtr');
    const angle = Math.PI / 6;
    const dx = rotation.x - before.center.x;
    const dy = rotation.y - before.center.y;
    await drag(
      page,
      rotation,
      {
        x: before.center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: before.center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
      },
      ['Alt']
    );
    const rotated = await selectionGeometry(page);
    await drag(page, rotated.br, { x: rotated.br.x + 20, y: rotated.br.y + 10 }, ['Alt']);
    await selectLayer(page, arrowId);
    const endpoint = await handle(page, 'end');
    const fixed = await handle(page, 'start');
    const moved = { x: endpoint.x + 30, y: endpoint.y + 20 };
    const historyBefore = await history(page);
    await drag(page, endpoint, moved, ['Alt']);
    await expect.poll(() => history(page)).toBe(historyBefore + 1);
    const actual = await handle(page, 'end');
    const actualFixed = await handle(page, 'start');
    expect(Math.hypot(actual.x - moved.x, actual.y - moved.y)).toBeLessThanOrEqual(0.5);
    expect(Math.hypot(actualFixed.x - fixed.x, actualFixed.y - fixed.y)).toBeLessThanOrEqual(0.5);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => history(page)).toBe(historyBefore);
    await selectLayer(page, group);
    await selectLayer(page, arrowId);
    const restored = await handle(page, 'end');
    expect(Math.hypot(restored.x - endpoint.x, restored.y - endpoint.y)).toBeLessThanOrEqual(0.5);
    const restoredStart = await handle(page, 'start');
    const midpoint = {
      x: (restoredStart.x + restored.x) / 2,
      y: (restoredStart.y + restored.y) / 2,
    };
    await page.mouse.move(midpoint.x, midpoint.y);
    const ghost = controls(page).locator('[data-control="bend-insert"]');
    await expect(ghost).toHaveAttribute('fill', '#fff');
    const pending = await center(ghost);
    const bend = { x: pending.x + 12, y: pending.y + 28 };
    const bendHistory = await history(page);
    await page.mouse.move(pending.x, pending.y);
    await page.mouse.down();
    await page.mouse.move(bend.x, bend.y, { steps: 6 });
    await expect(ghost).toHaveAttribute('fill', (await ghost.getAttribute('stroke')) ?? '');
    await page.screenshot({
      path: info.outputPath('nested-arrow-bend-captured.png'),
      fullPage: false,
    });
    await page.mouse.up();
    await expect.poll(() => history(page)).toBe(bendHistory + 1);
    const actualBend = await handle(page, 'bend-0');
    expect(Math.hypot(actualBend.x - bend.x, actualBend.y - bend.y)).toBeLessThanOrEqual(0.5);
    await page.locator('[data-ui="editor.floating.tool-rail.history.undo"]').click();
    await expect.poll(() => history(page)).toBe(bendHistory);
    await selectLayer(page, group);
    await selectLayer(page, arrowId);
    await expect(controls(page).locator('[data-control="bend-0"]')).toHaveCount(0);
    await expect(page.locator('[data-ui="editor.canvas.parent-group-context"]')).toHaveCount(1);
  });
}
