import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { SCENARIO_EDITOR_VISUAL_HARNESS_PATH } from '../extension-critical.helpers';
import { createTranslator } from '../../../../apps/extension/src/platform/i18n';
import { openVisualHarness, createPageIssueCollector } from './scenario-editor-visual.helpers';

for (const [locale, theme, size] of [
  ['ru', 'light', { width: 1280, height: 560 }],
  ['en', 'dark', { width: 1920, height: 900 }],
] as const) {
  test(`authors one ordered action sequence and previews the selected action ${locale}`, async ({
    page,
    hostOrigin,
  }, info) => {
    const t = createTranslator(locale);
    const issues = createPageIssueCollector(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openVisualHarness(page, hostOrigin, theme, locale, size, 'compare', { tourFixture: '1' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    const panel = page.locator('#guide-inspector-panel');
    const slides = page.locator('.tour-slide-select');
    async function choose(label: string, option: string) {
      await panel.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('option', { name: option, exact: true }).click();
    }
    for (let slide = 0; slide < 2; slide += 1) {
      await slides.nth(slide).click();
      const category = panel
        .getByRole('navigation')
        .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
      if (await category.isVisible()) await category.click();
      for (let action = 0; action < 3; action += 1) {
        const add = panel.getByRole('button', {
          name: t('scenario.editor.tourAddObject'),
          exact: true,
        });
        if (await add.isVisible()) {
          await add.click();
          await page
            .locator('.guide-action-menu')
            .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
            .click();
        } else
          await panel
            .getByRole('button', { name: t('scenario.editor.tourHotspot'), exact: true })
            .click();
        const label = `Action ${slide * 3 + action + 1}`;
        await panel
          .getByRole('textbox', { name: t('scenario.editor.tourObjectLabel'), exact: true })
          .fill(label);
        await expect(page.locator('.tour-stage-host [data-tour-hint-action-title]')).toHaveText(
          label
        );
        const text = panel.getByRole('textbox', {
          name: t('scenario.editor.textLabel'),
          exact: true,
        });
        await text.click();
        await expect(text).toBeFocused();
        await text.pressSequentially(`Instruction ${label}`);
        await expect(
          panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
        ).toHaveValue(`Instruction ${label}`);
        await expect(
          panel.getByRole('button', { name: t('scenario.editor.tourAction'), exact: true })
        ).toHaveCount(0);
        if (action === 1) {
          const appearance = panel
            .getByRole('navigation')
            .getByRole('button', { name: t('scenario.editor.appearance'), exact: true });
          if (await appearance.isVisible()) await appearance.click();
          await choose(t('scenario.editor.tourVisual'), t('scenario.editor.tourVisualFrame'));
          await expect(
            panel.getByRole('textbox', { name: t('scenario.editor.tourFrameStroke'), exact: true })
          ).toBeVisible();
        }
        await panel
          .getByRole('button', { name: t('scenario.editor.tourBackToSlide'), exact: true })
          .click();
      }
    }
    await slides.nth(0).click();
    const category = panel
      .getByRole('navigation')
      .getByRole('button', { name: t('scenario.editor.tourObjects'), exact: true });
    if (await category.isVisible()) await category.click();
    await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
    await expect(panel.locator('.tour-object-row').nth(1)).toHaveText(/2\.\s*Action 2/);
    await panel.locator('.tour-object-item').nth(1).hover();
    await panel
      .locator('.tour-object-item')
      .nth(1)
      .getByRole('button', { name: t('scenario.editor.tourMoveObjectUp'), exact: true })
      .click();
    await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 2/);
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
    await panel.locator('.tour-object-row').nth(2).dragTo(panel.locator('.tour-object-row').nth(0));
    await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 3/);
    await page.getByRole('button', { name: t('scenario.editor.guideUndo'), exact: true }).click();
    await expect(panel.locator('.tour-object-row').nth(0)).toHaveText(/1\.\s*Action 1/);
    await expect(page.getByRole('status').first()).toHaveText(t('scenario.editor.guideSaved'));
    const reopen = new URL(page.url());
    reopen.pathname = SCENARIO_EDITOR_VISUAL_HARNESS_PATH;
    reopen.searchParams.set('tourFixture', '1');
    reopen.searchParams.set('locale', locale);
    reopen.searchParams.set('theme', theme);
    await page.goto(reopen.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: t('scenario.editor.tourMode'), exact: true }).click();
    await slides.nth(0).click();
    if (await category.isVisible()) await category.click();
    await expect(panel.locator('.tour-object-row')).toHaveCount(3);
    await panel.locator('.tour-object-row[title="Action 2"]').click();
    await expect(
      panel.getByRole('textbox', { name: t('scenario.editor.textLabel'), exact: true })
    ).toHaveValue('Instruction Action 2');
    await page.screenshot({ path: info.outputPath('action-inspector.png'), fullPage: false });
    await page
      .locator('.tour-header-controls')
      .getByRole('button', { name: t('scenario.editor.tourPreviewSlide'), exact: true })
      .click();
    const player = page.locator('.tour-stage-host #tour-player');
    await expect(player.locator('[data-tour-counter]')).toHaveText('2 / 6');
    await expect(player.locator('[data-tour-hint-action-title]')).toHaveText('Action 2');
    await expect(player.locator('[data-tour-hint-text]')).toHaveText('Instruction Action 2');
    await expect(player.locator('[data-tour-object-id]')).toHaveCount(1);
    await player.locator('[data-tour-manual]').click();
    await player.locator('[data-tour-next]').click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('3 / 6');
    await player.locator('[data-tour-next]').click();
    await expect(player.locator('[data-tour-counter]')).toHaveText('4 / 6');
    await player.locator('[data-tour-contents]').click();
    await expect(player.locator('.tour-contents-list button').nth(3)).toHaveText('4. Action 4');
    await page.screenshot({ path: info.outputPath('action-preview-menu.png'), fullPage: false });
    issues.assertClean();
  });
}
