import { expect, type Locator } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { PRIMARY_BROWSER_VIEWPORTS } from '../support/browser-viewport';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

async function checkOptionalNote(panel: Locator) {
  const note = panel.locator('[data-ui="shared.information-disclosure"]').first();
  const summary = note.locator('summary');
  await expect(summary).toBeAttached();
  await summary.scrollIntoViewIfNeeded();
  await expect(note).not.toHaveAttribute('open');
  await expect(note.locator('.sniptale-information-body')).toBeHidden();
  await expect(summary).toHaveCSS('min-height', '32px');
  await summary.focus();
  await summary.press('Enter');
  await expect(note).toHaveAttribute('open');
  await expect(note.locator('.sniptale-information-body')).toBeVisible();
  await summary.press('Space');
  await expect(note).not.toHaveAttribute('open');
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const viewport of PRIMARY_BROWSER_VIEWPORTS) {
    test(`scenario inspector composition ${theme} ${viewport.name}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await openVisualHarness(page, hostOrigin, theme, 'ru', viewport.size, 'compare', {
        tourFixture: '1',
      });
      const panel = page.locator('#guide-inspector-panel');
      const category = (name: string) =>
        panel.getByRole('navigation').getByRole('button', { name, exact: true });
      await category('Макет шага').click();
      await checkOptionalNote(panel);
      expect(
        await panel.locator('.guide-template-controls').evaluate((node) => {
          const note = node.closest('.guide-inspector-group')!.previousElementSibling!;
          return node.getBoundingClientRect().top - note.getBoundingClientRect().bottom;
        })
      ).toBeGreaterThanOrEqual(8);
      await page.screenshot({ path: info.outputPath('guide-appearance.png'), fullPage: false });
      await page.getByRole('button', { name: 'Интерактивный тур', exact: true }).click();
      await category('Воспроизведение').click();
      await checkOptionalNote(panel);
      await page.screenshot({ path: info.outputPath('slide-timing.png'), fullPage: false });
      await category('Камера').click();
      await panel.getByRole('button', { name: /Приближение/ }).click();
      await page.getByRole('option', { name: 'Вручную', exact: true }).click();
      await checkOptionalNote(panel);
      await page.screenshot({ path: info.outputPath('camera-settings.png'), fullPage: false });
      await category('Действия').click();
      await panel.getByRole('button', { name: 'Точка действия', exact: true }).click();
      const back = panel.getByRole('button', { name: 'К настройкам слайда', exact: true });
      await back.hover();
      await expect(
        panel
          .locator(':scope > .guide-panel-heading')
          .getByRole('button', { name: 'К настройкам слайда', exact: true })
      ).toBeVisible();
      await expect(back.locator('.lucide-arrow-left')).toHaveCount(1);
      await expect(back).toHaveCSS('width', '32px');
      await page.screenshot({ path: info.outputPath('object-settings.png'), fullPage: false });
      await back.click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', { name: 'Навигационный слайд', exact: true })
        .click();
      await category('Воспроизведение').click();
      await checkOptionalNote(panel);
      await page.screenshot({ path: info.outputPath('navigation-slide.png'), fullPage: false });
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: 'Оформление', exact: true })
        .click();
      await category('Воспроизведение').click();
      await checkOptionalNote(panel);
      await page.screenshot({ path: info.outputPath('tour-playback.png'), fullPage: false });
      await expect
        .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
      await category('Переходы').click();
      await checkOptionalNote(panel);
      await page.screenshot({ path: info.outputPath('tour-transitions.png'), fullPage: false });
      await page.setViewportSize({ width: 1100, height: 560 });
      await checkOptionalNote(panel);
      await expect
        .poll(() => panel.evaluate((node) => node.scrollWidth - node.clientWidth))
        .toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('narrow-playback.png'), fullPage: false });
    });
  }
}
