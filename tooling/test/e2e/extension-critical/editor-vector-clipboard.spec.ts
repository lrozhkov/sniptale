import type { Page } from '@playwright/test';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { translate } from '../support/catalog-fixture';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { EDITOR_HARNESS_PATH } from '../extension-critical.helpers';

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path fill="#ff0000" d="M2 2h36v36H2z"/></svg>';
const ui = (page: Page, name: string) => page.locator(`[data-ui="editor.elements.${name}"]`);
const vectors = (page: Page) =>
  page.evaluate(() =>
    window
      .__sniptaleEditorHarness!.getCanvasObjects()
      .filter((object) => object['sniptaleType'] === 'vector-element')
  );
const history = (page: Page) =>
  page.evaluate(() => window.__sniptaleEditorHarness!.getInteractionState().historyIndex);

async function settledHistory(page: Page, index: number) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.__sniptaleEditorHarness!.getInteractionState();
        return { index: state.historyIndex, muted: state.historyMuted };
      })
    )
    .toEqual({ index, muted: 0 });
}

async function settleMenu(page: Page) {
  await page.locator('[data-ui="editor.canvas.context-menu"]').evaluate(async (element) => {
    await document.fonts.ready;
    const surface = element.closest('.sniptale-popover-menu');
    if (!surface) throw new Error('Missing menu surface');
    await Promise.allSettled(
      surface
        .getAnimations({ subtree: true })
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished)
    );
  });
}

async function vectorCenter(page: Page) {
  return page.evaluate(() => {
    const harness = window.__sniptaleEditorHarness!;
    const vector = harness
      .getCanvasObjects()
      .find((object) => object['sniptaleType'] === 'vector-element');
    const matrix = vector?.['matrix'];
    const scene = harness.getSceneProjection();
    if (!scene || !Array.isArray(matrix) || !matrix.every((value) => typeof value === 'number'))
      throw new Error('Missing vector geometry');
    const x = matrix[4],
      y = matrix[5],
      [a, b, c, d, e, f] = scene.viewport;
    if ([x, y, a, b, c, d, e, f].some((value) => typeof value !== 'number'))
      throw new Error('Invalid projection');
    return {
      x: scene.rect.left + ((a! * x + c! * y + e!) * scene.rect.width) / scene.width,
      y: scene.rect.top + ((b! * x + d! * y + f!) * scene.rect.height) / scene.height,
    };
  });
}

/** Click a visible canvas point without scrolling the oversized virtual canvas into view. */
async function focusVisibleCanvas(page: Page) {
  const point = await page.evaluate(() => {
    const canvas = document.querySelector('canvas.upper-canvas');
    const viewport = document.querySelector('[data-ui="editor.canvas.viewport"]');
    if (!(canvas instanceof HTMLCanvasElement) || !viewport)
      throw new Error('Missing canvas viewport');
    const canvasBounds = canvas.getBoundingClientRect(),
      bounds = viewport.getBoundingClientRect();
    const left = Math.max(canvasBounds.left, bounds.left, 80);
    const right = Math.min(canvasBounds.right, bounds.right, innerWidth - 80);
    const top = Math.max(canvasBounds.top, bounds.top, 64);
    const bottom = Math.min(canvasBounds.bottom, bounds.bottom, innerHeight - 80);
    if (right <= left || bottom <= top) throw new Error('Canvas has no visible interaction area');
    for (const [xRatio, yRatio] of [
      [0.35, 0.7],
      [0.5, 0.6],
      [0.25, 0.5],
      [0.4, 0.4],
    ]) {
      const x = left + (right - left) * xRatio!,
        y = top + (bottom - top) * yRatio!;
      if (document.elementFromPoint(x, y) === canvas) return { x, y };
    }
    throw new Error('Visible canvas points are covered by editor chrome');
  });
  await page.mouse.click(point.x, point.y);
}

async function acceptedColors(page: Page) {
  const document = await page.evaluate(() => window.__sniptaleEditorHarness!.exportDocument());
  const canvas: unknown = JSON.parse(document.canvasJson);
  if (!isRecord(canvas) || !Array.isArray(canvas['objects']))
    throw new Error('Invalid canvas document');
  const vector = canvas['objects'].find(
    (object: unknown) => isRecord(object) && object['sniptaleType'] === 'vector-element'
  );
  if (!isRecord(vector)) return null;
  if (
    !isRecord(vector['sniptaleVectorElement']) ||
    !isRecord(vector['sniptaleVectorElement']['overrides'])
  )
    throw new Error('Missing vector instance');
  return vector['sniptaleVectorElement']['overrides']['colors'];
}

for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
  test(
    `vector Copy menu and keyboard Paste keep editable resources after deleting ` +
      `the original and local library item ${viewport.name}`,
    async ({ page, hostOrigin }, info) => {
      await page.setViewportSize(viewport.size);
      await page.context().route('https://api.iconify.design/**', (route) => route.abort());
      const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 480;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Missing canvas');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 900, 480);
        return canvas.toDataURL('image/png');
      });
      await page.addInitScript(
        (payload) => {
          window.__sniptaleHarnessBootstrap = {
            storage: { 'sniptale-locale-preference': 'en' },
            editorBootstrapPayload: payload,
          };
          localStorage.setItem('sniptale-locale-preference', 'en');
        },
        { dataUrl, title: 'Vector clipboard proof' }
      );
      await page.goto(`${hostOrigin}${EDITOR_HARNESS_PATH}`);
      await expect
        .poll(() =>
          page.evaluate(() => window.__sniptaleEditorHarness?.getInteractionState().historyReady)
        )
        .toBe(true);
      await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
      await ui(page, 'import-input').setInputFiles({
        name: 'clipboard-proof.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(svg),
      });
      const destination = page.getByRole('dialog', {
        name: 'Import into a user collection',
        exact: true,
      });
      await expect(destination).toBeVisible();
      await destination.getByRole('button', { name: 'Import', exact: true }).click();
      await expect(destination).toBeHidden();
      const card = page.getByRole('button', { name: 'clipboard-proof.svg', exact: true });
      await expect(card.locator('img')).toBeVisible();
      await card.click();
      await ui(page, 'add').click();
      await expect.poll(() => vectors(page).then((objects) => objects.length)).toBe(1);
      const originalId = (await vectors(page))[0]!['sniptaleId'];
      const originalColors = await acceptedColors(page);
      expect(originalColors).toEqual({ c0: '#202020' });
      const beforeCopy = await history(page);
      const center = await vectorCenter(page);
      await page.mouse.click(center.x, center.y, { button: 'right' });
      const menu = page.locator('[data-ui="editor.canvas.context-menu"]');
      await settleMenu(page);
      await expect(
        menu.getByRole('button', { name: 'Copy vector layers', exact: true })
      ).toBeEnabled();
      await menu.getByRole('button', { name: 'Copy vector layers', exact: true }).click();
      await expect(menu).toBeHidden();
      expect(await history(page)).toBe(beforeCopy);
      await page.mouse.click(center.x, center.y, { button: 'right' });
      await menu
        .getByRole('button', { name: translate('editor.toolbar.deleteLayer', 'en'), exact: true })
        .click();
      await expect.poll(() => vectors(page).then((objects) => objects.length)).toBe(0);
      await page.locator('[data-ui="editor.floating.layers.mode.elements"]').click();
      await card.click();
      await page.getByRole('button', { name: 'Remove from my elements', exact: true }).click();
      await expect(card).toHaveCount(0);
      const beforePaste = await history(page);
      await focusVisibleCanvas(page);
      await page.keyboard.press('Control+k');
      const palette = page.locator('[data-ui="editor.command-palette"]');
      await expect(palette).toBeVisible();
      await palette.getByRole('textbox').fill('Paste vector layers');
      await expect(palette.getByRole('option', { name: /Paste vector layers/u })).toBeEnabled();
      await palette.getByRole('textbox').press('Enter');
      await expect(palette).toBeHidden();
      await expect.poll(() => vectors(page).then((objects) => objects.length)).toBe(1);
      expect((await vectors(page))[0]!['sniptaleId']).not.toBe(originalId);
      expect(await history(page)).toBe(beforePaste + 1);
      expect(await acceptedColors(page)).toEqual(originalColors);
      const pastedCenterBeforeHistory = await vectorCenter(page);
      await page
        .locator('[data-ui="editor.vector.properties"] [data-ui="shared.ui.color-selector"]')
        .first()
        .getByRole('button', {
          name: translate('shared.ui.colorSelectorChooseColor', 'en'),
          exact: true,
        })
        .click();
      const fullMode = page.getByRole('button', {
        name: translate('shared.ui.colorSelectorFullMode', 'en'),
        exact: true,
      });
      if (await fullMode.isVisible()) await fullMode.click();
      const hex = page.getByRole('textbox', {
        name: translate('shared.ui.colorSelectorHex', 'en'),
        exact: true,
      });
      await hex.fill('#00ff00');
      await hex.press('Tab');
      await page
        .getByRole('button', { name: translate('shared.ui.colorSelectorApply', 'en'), exact: true })
        .click();
      await expect.poll(() => acceptedColors(page)).toEqual({ c0: '#00ff00' });
      await page.keyboard.press('Escape');
      await focusVisibleCanvas(page);
      await page.keyboard.press('Control+z');
      await settledHistory(page, beforePaste + 1);
      await expect.poll(() => acceptedColors(page)).toEqual(originalColors);
      await page.keyboard.press('Control+z');
      await settledHistory(page, beforePaste);
      await expect.poll(() => vectors(page).then((objects) => objects.length)).toBe(0);
      await page.keyboard.press('Control+Shift+z');
      await settledHistory(page, beforePaste + 1);
      await expect.poll(() => vectors(page).then((objects) => objects.length)).toBe(1);
      const pastedCenter = await vectorCenter(page);
      expect(Math.abs(pastedCenter.x - pastedCenterBeforeHistory.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pastedCenter.y - pastedCenterBeforeHistory.y)).toBeLessThanOrEqual(1);
      await page.mouse.click(pastedCenter.x, pastedCenter.y, { button: 'right' });
      await expect(
        menu.getByRole('button', { name: 'Paste vector layers', exact: true })
      ).toBeEnabled();
      await settleMenu(page);
      const bounds = await menu.evaluate((element) =>
        element.closest('.sniptale-popover-menu')?.getBoundingClientRect().toJSON()
      );
      if (!bounds) throw new Error('Missing clipboard menu');
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.size.height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: info.outputPath('vector-copy-paste-menu.png'),
        fullPage: false,
      });
    }
  );
}
