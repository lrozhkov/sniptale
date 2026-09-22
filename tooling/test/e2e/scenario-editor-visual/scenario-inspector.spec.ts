import { expect } from '@playwright/test';
import { test } from '../support/extension-fixture';
import { openVisualHarness, SCENARIO_VISUAL_THEMES } from './scenario-editor-visual.helpers';

for (const theme of SCENARIO_VISUAL_THEMES) {
  test(`scenario inspector shares color and section patterns in ${theme}`, async ({
    page,
    hostOrigin,
  }, testInfo) => {
    await openVisualHarness(page, hostOrigin, theme, 'ru', { width: 1280, height: 720 });
    const panel = page.locator('#guide-inspector-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('Compare two images');
    await expect(panel.locator('.guide-inspector-scope')).toHaveCount(0);
    await panel
      .getByRole('navigation', { name: 'Настройки шага' })
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    const accent = panel.locator('.guide-style-accent');
    await expect(accent.locator('input[type="color"]')).toHaveCount(0);
    await expect(accent.getByText('Акцентный цвет', { exact: true })).toBeVisible();
    await accent.locator('[data-ui="shared.ui.color-selector.picker-trigger"]').click();
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-ui="shared.ui.color-selector.picker"]')).toHaveCount(0);
    await testInfo.attach(`inspector-narrow-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(
      await panel.evaluate((node) =>
        [
          ...node.querySelectorAll(
            'button, [role="group"], .guide-style-fields, .guide-inspector-choice, .guide-style-accent'
          ),
        ]
          .filter((el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1)
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            text: el.textContent?.slice(0, 40),
            width: el.getBoundingClientRect().width,
          }))
      )
    ).toEqual([]);
    expect(
      await panel
        .locator('.guide-inspector-choice [role="group"] button > span')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth)
            .map((node) => node.textContent)
        )
    ).toEqual([]);
    await page.setViewportSize({ width: 1024, height: 640 });
    await testInfo.attach(`inspector-minimum-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await panel.getByRole('button', { name: 'Показать все настройки', exact: true }).click();
    await expect(panel.getByRole('navigation', { name: 'Настройки шага' })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Показать разделы настроек', exact: true }).click();
    await expect(
      panel.getByRole('navigation').getByRole('button', { name: 'Оформление', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .locator('.guide-page-header')
      .getByRole('button', { name: 'Оформление', exact: true })
      .click();
    await expect(panel.locator('h2')).toHaveText('Весь сценарий');
    await expect(
      panel.getByRole('button', { name: 'Показать все настройки', exact: true })
    ).toHaveCount(0);
  });
}

for (const theme of SCENARIO_VISUAL_THEMES) {
  for (const locale of ['ru', 'en'] as const) {
    test(`inspector fields wrap and groups support keyboard disclosure in ${locale} ${theme}`, async ({
      page,
      hostOrigin,
    }, info) => {
      await openVisualHarness(
        page,
        hostOrigin,
        theme,
        locale,
        { width: 1600, height: 900 },
        'compare',
        { tourFixture: '1' }
      );
      const panel = page.locator('#guide-inspector-panel');
      const appearance = locale === 'ru' ? 'Оформление' : 'Appearance';
      await panel
        .getByRole('navigation')
        .getByRole('button', { name: appearance, exact: true })
        .click();
      const divider = page.locator('.guide-panel-divider-right');
      await divider.focus();
      await page.keyboard.press('Home');
      for (const width of [420, 260]) {
        if (width === 260) for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
        await expect(divider).toHaveAttribute('aria-valuenow', String(width));
        expect(
          await panel.evaluate((node) =>
            [
              ...node.querySelectorAll<HTMLElement>(
                'h2, h3, button, .guide-inspector-choice, .guide-style-accent'
              ),
            ]
              .filter((el) => el.getBoundingClientRect().width > 0)
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1 ||
                  el.scrollWidth > el.clientWidth + 1
              )
              .map((el) => el.textContent)
          )
        ).toEqual([]);
        await info.attach(`guide-${locale}-${theme}-${width}`, {
          body: await panel.screenshot(),
          contentType: 'image/png',
        });
      }
      const disclosure = panel.locator('.guide-inspector-disclosure').first();
      await disclosure.focus();
      await page.keyboard.press('Enter');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeHidden();
      await page.keyboard.press('Space');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(panel.locator('.guide-inspector-group-body').first()).toBeVisible();
      await page
        .getByRole('button', {
          name: locale === 'ru' ? 'Интерактивный тур' : 'Interactive tour',
          exact: true,
        })
        .click();
      const tourPanel = page.locator('#guide-inspector-panel');
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', { name: locale === 'ru' ? 'Камера' : 'Camera', exact: true })
        .click();
      await tourPanel.locator('[data-ui="shared.ui.compact-select"] > button').click();
      await page
        .getByRole('option', { name: locale === 'ru' ? 'Вручную' : 'Manual', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]')
      ).toHaveCount(3);
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              '[data-ui="shared.ui.compact-inspector.numeric-row"], [data-ui="shared.ui.compact-select"]'
            ),
          ]
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => el.textContent)
        )
      ).toEqual([]);
      await info.attach(`tour-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('navigation')
        .getByRole('button', {
          name: locale === 'ru' ? 'Объекты слайда' : 'Slide objects',
          exact: true,
        })
        .click();
      await tourPanel
        .getByRole('button', { name: locale === 'ru' ? 'Точка действия' : 'Hotspot', exact: true })
        .click();
      await expect(
        tourPanel.locator('[data-ui="shared.ui.compact-inspector.numeric-row"]').first()
      ).toBeVisible();
      expect(
        await tourPanel.evaluate((node) =>
          [
            ...node.querySelectorAll<HTMLElement>(
              'button, input, textarea, [data-ui="shared.ui.compact-inspector.numeric-row"]'
            ),
          ]
            .filter((el) => el.getBoundingClientRect().width > 0)
            .filter(
              (el) => el.getBoundingClientRect().right > node.getBoundingClientRect().right + 1
            )
            .map((el) => ({ text: el.textContent, label: el.getAttribute('aria-label') }))
        )
      ).toEqual([]);
      const surface = tourPanel.locator('[data-ui="shared.ui.surface-style-selector"]');
      expect(
        await surface
          .locator('.truncate')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => node.textContent)
          )
      ).toEqual([]);
      await surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]').click();
      await expect(surface.getByRole('dialog')).toBeVisible();
      await surface.locator('[data-ui="surface-style.cancel"]').click();
      await expect(surface.getByRole('dialog')).toHaveCount(0);
      await expect(
        surface.locator('[data-ui="shared.ui.surface-style-selector.trigger"]')
      ).toBeFocused();
      await info.attach(`object-${locale}-${theme}-260`, {
        body: await tourPanel.screenshot(),
        contentType: 'image/png',
      });
      await tourPanel
        .getByRole('button', {
          name: locale === 'ru' ? 'К настройкам слайда' : 'Back to slide settings',
          exact: true,
        })
        .click();
      await expect(tourPanel.locator('[data-inspector-object]')).toBeFocused();
      await expect(tourPanel.locator('.tour-object-item-actions')).toBeVisible();
      await expect(tourPanel.locator('.tour-object-item-actions button').first()).toBeDisabled();
    });
  }
}
