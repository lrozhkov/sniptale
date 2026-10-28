import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openDesignReview } from './extension-critical-page-toolbar.helpers';
import { DEFAULT_DRAWING_COLORS } from '../../../../apps/extension/src/features/drawing/public';
import { translate } from '../../../../apps/extension/src/platform/i18n';
const t = (key: Parameters<typeof translate>[0]) => translate(key, 'ru');
const ui = (page: Page, name: string) => page.locator(`[data-ui="${name}"]`);

async function configure(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/apps/extension/src/popup/index.html`);
  await page.evaluate(
    async (colors) => {
      await chrome.storage.local.remove(['sniptale_editor_presets']);
      await chrome.storage.local.set({
        'sniptale-locale-preference': 'ru',
        'sniptale-theme-preference': 'light',
        sniptale_picker_compact: false,
        sniptale_drawing_palette: { schemaVersion: 1, colors },
      });
    },
    [...DEFAULT_DRAWING_COLORS]
  );
}
async function openCatalog(picker: Locator) {
  await picker.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true });
    for (let parent = element.parentElement; parent; parent = parent.parentElement)
      animations.push(...parent.getAnimations());
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
  });
  const before = (await picker.boundingBox())!.height;
  await picker
    .getByRole('button', { name: t('shared.ui.colorCatalogSearch'), exact: true })
    .click();
  const panel = picker.locator('[data-ui="shared.ui.color-selector.catalog"]');
  await expect(panel).toBeVisible();
  await expect
    .poll(async () =>
      Number((await panel.locator('.sniptale-catalog-count span').innerText()).replace(/\D/g, ''))
    )
    .toBeGreaterThan(30000);
  expect(Math.abs((await picker.boundingBox())!.height - before)).toBeLessThanOrEqual(1);
  const input = panel.locator('input');
  const tiles = panel.locator('.sniptale-catalog-tiles button');
  await input.press('ArrowDown');
  await expect(tiles.first()).toBeFocused();
  await tiles.first().press('ArrowDown');
  await expect(tiles.nth(8)).toBeFocused();
  await input.focus();
  return panel;
}
async function checkNearby(page: Page, panel: Locator) {
  const title = panel.locator('.sniptale-catalog-title strong');
  const selected = await title.innerText();
  const row = panel.locator('.sniptale-catalog-nearby');
  const buttons = row.locator('button');
  await buttons.first().hover();
  const preview = await title.innerText();
  expect(preview).not.toBe(selected);
  const first = (await buttons.nth(0).boundingBox())!,
    second = (await buttons.nth(1).boundingBox())!;
  await page.mouse.move((first.x + first.width + second.x) / 2, first.y + first.height / 2);
  await expect(title).toHaveText(preview);
  await panel.locator('input').hover();
  await expect(title).toHaveText(selected);
}
async function chooseRebecca(panel: Locator) {
  await panel.locator('input').fill('663399');
  await panel.locator('.sniptale-catalog-tiles button').first().click();
}

for (const { name, size } of PRIMARY_BROWSER_VIEWPORTS) {
  test(`named palettes and solid catalog ${name}`, async ({
    page,
    context,
    extensionId,
    hostOrigin,
  }, info) => {
    await page.setViewportSize(size);
    await configure(page, extensionId);
    const base = `chrome-extension://${extensionId}/apps/extension/src/settings/index.html`;
    await page.goto(`${base}?section=editor-resources&view=palettes`);
    const nameField = page
      .getByRole('textbox', { name: new RegExp(t('shared.ui.colorCatalogName')) })
      .first();
    await nameField.fill('Brand coral');
    await nameField.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_drawing_palette')).sniptale_drawing_palette
              .names?.['#ff7f50']
        )
      )
      .toBe('Brand coral');
    await page.reload();
    await expect(nameField).toHaveValue('Brand coral');
    await page
      .getByRole('button', { name: t('settings.editor.paletteSceneBackground'), exact: true })
      .click();
    await ui(page, 'shared.ui.color-selector.picker-trigger').first().click();
    const picker = ui(page, 'shared.ui.color-selector.picker');
    await picker
      .getByRole('spinbutton', { name: t('shared.ui.colorSelectorAlpha'), exact: true })
      .fill('65');
    const panel = await openCatalog(picker);
    await checkNearby(page, panel);
    await chooseRebecca(panel);
    await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toHaveValue('#663399');
    await expect(
      picker.getByRole('spinbutton', { name: t('shared.ui.colorSelectorAlpha'), exact: true })
    ).toHaveValue('65');
    await page.screenshot({ path: info.outputPath('solid-catalog.png'), fullPage: false });
    await picker
      .getByRole('button', { name: t('shared.ui.colorSelectorApply'), exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await chrome.storage.local.get('sniptale_editor_presets')).sniptale_editor_presets
              .palette.sceneBackground[0]
        )
      )
      .toBe('#663399a6');
    const host = await openDesignReview(context, extensionId, hostOrigin, size);
    try {
      await ui(host.page, 'content.toolbar.mode-selector-button').click();
      await ui(host.page, 'content.toolbar.mode-option.drawing').click();
      const pencil = ui(host.page, 'content.toolbar.drawing.pencil');
      if ((await pencil.getAttribute('aria-expanded')) !== 'true') await pencil.click();
      await ui(host.page, 'content.toolbar.drawing-options.pencil')
        .locator('[data-ui="shared.ui.color-selector.picker-trigger"]')
        .click();
      const contentPicker = ui(host.page, 'shared.ui.color-selector.picker');
      await expect(
        contentPicker.locator('[data-ui="shared.ui.color-selector.picker-palette"] button').first()
      ).toHaveAttribute('title', 'Brand coral · #FF7F50');
      await openCatalog(contentPicker);
      await host.page.screenshot({ path: info.outputPath('content-catalog.png'), fullPage: false });
    } finally {
      await host.page.close();
      await host.popup.close();
    }
  });
  test(`gradient catalog keeps stop history ${name}`, async ({ page, extensionId }, info) => {
    await page.setViewportSize(size);
    await configure(page, extensionId);
    await page.goto(
      `chrome-extension://${extensionId}/apps/extension/src/settings/index.html?section=editor-resources&view=gradients`
    );
    await page
      .getByRole('button', { name: t('settings.editor.gradients.add'), exact: true })
      .click();
    const picker = ui(page, 'shared.ui.paint-selector.popup');
    const before = await picker.getByRole('textbox', { name: 'HEX', exact: true }).inputValue();
    const panel = await openCatalog(picker);
    await checkNearby(page, panel);
    await chooseRebecca(panel);
    await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toHaveValue('#663399');
    await picker
      .getByRole('button', { name: t('highlighter.paintPicker.undo'), exact: true })
      .click();
    await expect(picker.getByRole('textbox', { name: 'HEX', exact: true })).toHaveValue(before);
    await chooseRebecca(panel);
    await panel.locator('input').fill('zzzzzz');
    const grid = panel.locator('.sniptale-catalog-grid');
    await expect(grid).toHaveClass(/is-empty/);
    expect(await grid.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
    await page.screenshot({ path: info.outputPath('gradient-catalog.png'), fullPage: false });
    await picker.getByRole('button', { name: t('common.actions.cancel'), exact: true }).click();
    await expect(picker).toHaveCount(0);
  });
}
