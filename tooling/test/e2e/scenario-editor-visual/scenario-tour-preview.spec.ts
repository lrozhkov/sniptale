import { expect } from '@playwright/test';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

test('preview pointer interaction does not focus the surrounding editor canvas', async ({
  page,
  hostOrigin,
}, info) => {
  await openVisualHarness(
    page,
    hostOrigin,
    'light',
    'en',
    { width: 1280, height: 560 },
    'compare',
    { tourFixture: '1' }
  );
  await page.getByRole('button', { name: 'Interactive tour', exact: true }).click();
  const panel = page.locator('#guide-inspector-panel');
  await panel.getByRole('navigation').getByRole('button', { name: 'Actions', exact: true }).click();
  await panel.getByRole('button', { name: 'Text action', exact: true }).click();
  await page.getByRole('button', { name: 'Preview from here', exact: true }).click();
  const stage = page.locator('.tour-stage-host[data-view="preview"]');
  await expect(stage.locator('[data-tour-scene]')).toHaveCSS('opacity', '1');
  await stage.locator('[data-tour-stage]').click({ position: { x: 8, y: 8 } });
  const canvas = page.locator('.tour-canvas');
  expect(await canvas.evaluate((node) => node.tabIndex)).toBe(-1);
  expect(
    await canvas.evaluate((node) => ({
      focused: node === document.activeElement,
      outline: getComputedStyle(node).outlineStyle,
    }))
  ).toEqual({ focused: false, outline: 'none' });
  await expect(stage.locator('#tour-player')).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  const focused = stage.locator(':focus-visible');
  await expect(focused).toHaveCount(1);
  await expect(focused).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: info.outputPath('preview-pointer-focus.png'), fullPage: false });
});

for (const viewport of [
  { width: 1280, height: 560 },
  { width: 1920, height: 900 },
  { width: 1200, height: 560 },
  { width: 1631, height: 700 },
  { width: 1632, height: 700 },
  { width: 1633, height: 700 },
]) {
  test(`preview floats above the editor and returns focus at ${viewport.width}x${viewport.height}`, async ({
    page,
    hostOrigin,
  }, info) => {
    if (viewport.width === 1280)
      await page.clock.install({ time: new Date('2026-10-23T12:00:00Z') });
    await openVisualHarness(page, hostOrigin, 'dark', 'ru', viewport, 'compare', {
      tourFixture: '1',
    });
    const t = createTranslator('ru');
    if (viewport.width < 1280) {
      expect(
        await page
          .locator('.guide-editor-viewport')
          .evaluate((node) => node.scrollWidth > node.clientWidth)
      ).toBe(true);
    }
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    await panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true })
      .click();
    await panel
      .getByRole('button', { name: t('scenario.editor.tourAnnotation'), exact: true })
      .click();
    const preview = page.getByRole('button', {
      name: t('scenario.editor.tourPreviewSlide'),
      exact: true,
    });
    await preview.click();
    const dialog = page.locator('dialog.tour-preview-dialog[data-preview="true"]');
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node) => node.matches(':modal'))).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await expect(dialog.locator('[data-tour-scene]')).toHaveCSS('opacity', '1');
    await expect(dialog.locator('.tour-toolbar')).toBeVisible();
    const geometry = await dialog.locator('[data-tour-hint]').boundingBox();
    const stageGeometry = await dialog.locator('[data-tour-stage]').boundingBox();
    expect(geometry!.y + geometry!.height).toBeCloseTo(
      stageGeometry!.y + stageGeometry!.height - 1,
      0
    );
    const toolbarAlpha = await dialog.locator('.tour-toolbar').evaluate((node) => {
      const color = getComputedStyle(node).backgroundColor;
      return Number(color.match(/(?:\/|,)\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
    });
    expect(toolbarAlpha).toBeGreaterThan(0);
    expect(toolbarAlpha).toBeLessThan(1);
    if (viewport.width === 1280) {
      await page.clock.pauseAt(new Date('2026-10-23T12:10:00Z'));
      await dialog.locator('[data-tour-play]').click();
      await expect(dialog.locator('#tour-player')).toHaveAttribute('data-tour-playing', 'true');
      await dialog.locator('[data-tour-stage]').click({ position: { x: 8, y: 8 } });
      await page.clock.runFor(2100);
      await expect(dialog.locator('#tour-player')).toHaveAttribute(
        'data-tour-chrome-hidden',
        'true'
      );
      expect(await dialog.locator('[data-tour-hint]').boundingBox()).toEqual(geometry);
      expect(await dialog.locator('[data-tour-stage]').boundingBox()).toEqual(stageGeometry);
      await dialog.locator('[data-tour-stage]').hover({ position: { x: 30, y: 20 } });
      await expect(dialog.locator('#tour-player')).toHaveAttribute(
        'data-tour-chrome-hidden',
        'false'
      );
      await dialog.locator('[data-tour-play]').click();
      expect(await dialog.locator('[data-tour-hint]').boundingBox()).toEqual(geometry);
      await page.clock.resume();
    }
    await dialog.locator('[data-tour-contents]').click();
    await expect(dialog.locator('dialog.tour-navigation')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: info.outputPath('floating-preview.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(preview).toBeFocused();
    await expect(page.locator('.tour-stage-host[data-view="edit"]')).toBeVisible();
    if (viewport.width === 1280) {
      for (const fromEnd of [false, true]) {
        if (fromEnd) await page.locator('.tour-end-row').click();
        const beginning = page.getByRole('button', {
          name: t('scenario.editor.tourPreviewStart'),
          exact: true,
        });
        if (fromEnd) await expect(preview).toBeDisabled();
        await beginning.click();
        await expect(dialog).toBeVisible();
        if (fromEnd) {
          await dialog
            .getByRole('button', {
              name: t('scenario.editor.tourReturnToEditing'),
              exact: true,
            })
            .click();
        } else await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(beginning).toBeFocused();
      }
    }
  });
}
