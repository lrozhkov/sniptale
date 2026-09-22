import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness } from './scenario-editor-visual.helpers';

for (const theme of ['light', 'dark'] as const) {
  for (const locale of ['ru', 'en'] as const) {
    test(`contents rows reveal all actions together in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      const ru = locale === 'ru';
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 1000 },
        'compare',
        { tourFixture: '1' }
      );
      await page
        .getByRole('button', { name: ru ? 'Интерактивный тур' : 'Interactive tour', exact: true })
        .click();
      await page
        .locator('#guide-library-panel')
        .getByRole('button', { name: ru ? 'Навигационный слайд' : 'Navigation slide', exact: true })
        .click();
      const panel = page.locator('#guide-inspector-panel');
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: ru ? 'Пункты оглавления' : 'Contents links', exact: true })
        .click();
      await panel
        .getByRole('button', {
          name: new RegExp(ru ? '^Добавить ссылки на слайды' : '^Add slide links'),
        })
        .click();
      const rows = panel.locator('.tour-contents-row');
      await expect(rows).toHaveCount(2);
      await page.mouse.move(700, 100);
      const effectiveOpacity = () =>
        rows
          .first()
          .locator('button')
          .last()
          .evaluate((node) => {
            let opacity = 1;
            for (let current: Element | null = node; current; current = current.parentElement)
              opacity *= Number(getComputedStyle(current).opacity);
            return opacity;
          });
      const disabledOpacity = () =>
        rows
          .first()
          .locator('button:disabled')
          .evaluate((node) => {
            let opacity = 1;
            for (let current: Element | null = node; current; current = current.parentElement)
              opacity *= Number(getComputedStyle(current).opacity);
            return opacity;
          });
      await expect.poll(effectiveOpacity).toBe(0);
      await expect.configure({ soft: true }).poll(disabledOpacity).toBe(0);
      await expect.soft(panel.locator('.guide-inspector-hint')).toHaveCount(0);
      const main = rows.first().locator('[data-inspector-object]');
      const before = await main.boundingBox();
      await rows.first().hover();
      await expect.poll(effectiveOpacity).toBe(1);
      expect(await main.boundingBox()).toEqual(before);
      await info.attach(`contents-hover-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      const names = () => rows.locator('.tour-contents-select > span:last-child').allTextContents();
      const original = await names();
      await rows
        .first()
        .getByRole('button', {
          name: ru ? 'Переместить кнопку ниже' : 'Move button down',
          exact: true,
        })
        .click();
      expect(await names()).toEqual([...original].reverse());
      await page.mouse.move(700, 100);
      await rows.first().locator('.tour-contents-select').focus();
      await page.keyboard.press('Tab');
      expect(
        await rows
          .first()
          .locator('.tour-contents-actions')
          .evaluate((node) => node.contains(document.activeElement))
      ).toBe(true);
      await rows
        .first()
        .getByRole('button', { name: ru ? 'Удалить' : 'Delete', exact: true })
        .click();
      await expect(rows).toHaveCount(1);
      await page
        .locator('.guide-page-header')
        .getByRole('button', { name: ru ? 'Отменить' : 'Undo', exact: true })
        .click();
      await expect(rows).toHaveCount(2);
      await rows.first().locator('.tour-contents-select').click();
      await panel
        .getByRole('textbox', { name: ru ? 'Текст' : 'Text', exact: true })
        .fill(ru ? 'Подготовка рабочего пространства' : 'Prepare your workspace');
      await panel
        .getByRole('button', {
          name: ru ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      await expect(rows.first().locator('.tour-contents-select')).toBeFocused();
      const resize = page.locator('.guide-panel-divider-right');
      await resize.focus();
      for (let index = 0; index < 10; index++) await page.keyboard.press('ArrowRight');
      await expect(resize).toHaveAttribute('aria-valuenow', '260');
      await page.mouse.move(700, 100);
      await expect.poll(disabledOpacity).toBe(0);
      expect(
        await rows.evaluateAll(
          (nodes) => nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length
        )
      ).toBe(0);
      await info.attach(`contents-idle-narrow-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
      await rows.first().hover();
      await expect.poll(effectiveOpacity).toBe(1);
      await info.attach(`contents-hover-narrow-${locale}-${theme}`, {
        body: await panel.screenshot(),
        contentType: 'image/png',
      });
    });
  }
}
